/**
 * Progress Reporter - Reports progress to orchestrator via Unix socket
 *
 * Enables bidirectional communication:
 * - Worker sends progress updates, stage changes, completion
 * - Orchestrator sends control commands: pause, resume, cancel
 *
 * Falls back to standalone mode (stderr output) if no socket configured.
 */

import { createConnection, Socket } from 'net';
import { createInterface, Interface } from 'readline';
import { EventEmitter } from 'events';

// Get version from package.json
const APP_NAME = 'wake-n-blake';
let APP_VERSION = '0.1.0';
try {
  APP_VERSION = process.env.npm_package_version || '0.1.0';
} catch {
  // Use default
}

export interface ProgressMessage {
  type: string;
  timestamp: string;
  session_id: string;
  app: string;
  app_version: string;
  [key: string]: unknown;
}

export interface StageInfo {
  name: string;
  displayName: string;
  number: number;
  totalStages: number;
  weight: number;
}

export interface ProgressData {
  stage: StageInfo;
  completed: number;
  total: number;
  failed?: number;
  skipped?: number;
  currentFile?: string;
  percentComplete: number;
  etaMs?: number;
  bytesProcessed?: number;
  totalBytes?: number;
  throughputBytesPerSec?: number;
  throughputFilesPerSec?: number;
}

/**
 * Progress Reporter - Reports to orchestrator via Unix socket
 * Falls back to standalone mode if no socket provided
 */
export class ProgressReporter extends EventEmitter {
  private socket: Socket | null = null;
  private rl: Interface | null = null;
  private _paused = false;
  private _cancelled = false;
  private sessionId: string;
  private connected = false;
  private startedAt: number;

  constructor() {
    super();
    this.sessionId = process.env.PROGRESS_SESSION_ID || '';
    this.startedAt = Date.now();
  }

  get paused(): boolean {
    return this._paused;
  }

  get cancelled(): boolean {
    return this._cancelled;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Connect to orchestrator socket
   * Returns false if no socket configured (standalone mode)
   */
  async connect(): Promise<boolean> {
    const socketPath = process.env.PROGRESS_SOCKET;
    if (!socketPath) {
      return false; // Standalone mode
    }

    return new Promise((resolve) => {
      try {
        this.socket = createConnection(socketPath, () => {
          this.connected = true;
          this.setupListener();
          resolve(true);
        });
        this.socket.on('error', () => {
          this.connected = false;
          resolve(false);
        });
        this.socket.on('close', () => {
          this.connected = false;
        });
      } catch {
        resolve(false);
      }
    });
  }

  private setupListener(): void {
    if (!this.socket) return;

    this.rl = createInterface({ input: this.socket });
    this.rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'control') {
          this.handleControl(msg);
        }
      } catch {
        // Ignore malformed messages
      }
    });
  }

  private handleControl(msg: { command: string; reason?: string }): void {
    switch (msg.command) {
      case 'pause':
        this._paused = true;
        this.sendAck('pause', 'accepted');
        this.emit('pause');
        break;
      case 'resume':
        this._paused = false;
        this.sendAck('resume', 'accepted');
        this.emit('resume');
        break;
      case 'cancel':
        this._cancelled = true;
        this.sendAck('cancel', 'accepted');
        this.emit('cancel', msg.reason);
        break;
    }
  }

  private sendAck(command: string, status: string): void {
    this.send({
      type: 'ack',
      command,
      status,
    });
  }

  /**
   * Send message to orchestrator
   */
  send(message: Partial<ProgressMessage>): void {
    if (!this.socket || !this.connected) return;

    const fullMessage: ProgressMessage = {
      type: message.type || 'progress',
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      app: APP_NAME,
      app_version: APP_VERSION,
      ...message,
    };

    try {
      this.socket.write(JSON.stringify(fullMessage) + '\n');
    } catch {
      // Socket may have closed
    }
  }

  /**
   * Send stage started notification
   */
  stageStarted(stage: StageInfo): void {
    this.send({
      type: 'stage_started',
      stage: {
        name: stage.name,
        display_name: stage.displayName,
        number: stage.number,
        total_stages: stage.totalStages,
      },
    });
  }

  /**
   * Send stage completed notification
   */
  stageCompleted(stage: StageInfo, durationMs: number, itemsProcessed: number): void {
    this.send({
      type: 'stage_completed',
      stage: {
        name: stage.name,
        number: stage.number,
      },
      duration_ms: durationMs,
      items_processed: itemsProcessed,
    });
  }

  /**
   * Send progress update
   */
  progress(data: ProgressData): void {
    this.send({
      type: 'progress',
      stage: {
        name: data.stage.name,
        display_name: data.stage.displayName,
        number: data.stage.number,
        total_stages: data.stage.totalStages,
        weight: data.stage.weight,
      },
      items: {
        total: data.total,
        completed: data.completed,
        failed: data.failed || 0,
        skipped: data.skipped || 0,
      },
      bytes: data.totalBytes
        ? {
            total: data.totalBytes,
            completed: data.bytesProcessed || 0,
          }
        : undefined,
      current: {
        item: data.currentFile,
        item_short: data.currentFile?.split('/').pop(),
      },
      timing: {
        started_at: new Date(this.startedAt).toISOString(),
        elapsed_ms: Date.now() - this.startedAt,
        eta_ms: data.etaMs,
      },
      throughput: {
        items_per_sec: data.throughputFilesPerSec,
        bytes_per_sec: data.throughputBytesPerSec,
      },
      percent_complete: data.percentComplete,
    });
  }

  /**
   * Send item completed notification (optional fine-grained updates)
   */
  itemCompleted(
    item: string,
    status: 'success' | 'failed' | 'skipped' | 'duplicate',
    durationMs: number,
    bytesProcessed?: number
  ): void {
    this.send({
      type: 'item_completed',
      item,
      status,
      duration_ms: durationMs,
      bytes_processed: bytesProcessed,
    });
  }

  /**
   * Send error notification
   */
  error(
    code: string,
    message: string,
    item?: string,
    fatal = false
  ): void {
    this.send({
      type: 'error',
      error: {
        code,
        message,
        item,
        fatal,
      },
    });
  }

  /**
   * Send completion message
   */
  complete(summary: {
    totalItems: number;
    successful: number;
    failed: number;
    skipped: number;
    durationMs: number;
    bytesProcessed?: number;
  }): void {
    this.send({
      type: 'complete',
      summary: {
        total_items: summary.totalItems,
        successful: summary.successful,
        failed: summary.failed,
        skipped: summary.skipped,
        duration_ms: summary.durationMs,
        bytes_processed: summary.bytesProcessed,
      },
      exit_code: summary.failed > 0 ? 1 : 0,
    });
  }

  /**
   * Wait while paused (for use in processing loop)
   */
  async waitWhilePaused(): Promise<void> {
    while (this._paused && !this._cancelled) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /**
   * Check if should continue processing
   */
  shouldContinue(): boolean {
    return !this._cancelled;
  }

  /**
   * Reset start time (call when actual processing begins)
   */
  resetStartTime(): void {
    this.startedAt = Date.now();
  }

  /**
   * Close socket connection
   */
  close(): void {
    this.rl?.close();
    this.socket?.end();
    this.connected = false;
  }
}

// Export singleton factory
let _reporter: ProgressReporter | null = null;

export function getProgressReporter(): ProgressReporter {
  if (!_reporter) {
    _reporter = new ProgressReporter();
  }
  return _reporter;
}
