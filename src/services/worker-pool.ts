/**
 * Worker pool for parallel hashing
 * Manages worker threads for CPU-bound hash operations
 */

import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { isNetworkPath } from '../utils/network.js';
import { LOCAL_BUFFER_SIZE, NETWORK_BUFFER_SIZE, NETWORK_CONCURRENCY } from '../core/constants.js';
import type { Algorithm } from '../schemas/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, '..', 'workers', 'hash.worker.js');

interface HashTask {
  id: number;
  filePath: string;
  algorithm: Algorithm;
  bufferSize: number;
}

interface HashResult {
  id: number;
  filePath: string;
  hash: string;
  size: number;
  error?: string;
}

interface PendingTask {
  task: HashTask;
  resolve: (result: HashResult) => void;
  reject: (error: Error) => void;
}

export interface WorkerPoolOptions {
  concurrency?: number;
  networkConcurrency?: number;
  forceSequential?: boolean;  // HDD mode
}

export class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private pendingTasks: PendingTask[] = [];
  private taskIdCounter = 0;
  private taskCallbacks = new Map<number, PendingTask>();
  private concurrency: number;
  private networkConcurrency: number;
  private forceSequential: boolean;

  constructor(options: WorkerPoolOptions = {}) {
    const cpuCount = os.cpus().length;
    this.concurrency = options.concurrency ?? Math.max(1, cpuCount - 1);
    this.networkConcurrency = options.networkConcurrency ?? NETWORK_CONCURRENCY;
    this.forceSequential = options.forceSequential ?? false;

    // In sequential mode, use only 1 worker
    if (this.forceSequential) {
      this.concurrency = 1;
    }
  }

  /**
   * Initialize worker pool
   */
  async initialize(): Promise<void> {
    for (let i = 0; i < this.concurrency; i++) {
      const worker = new Worker(WORKER_PATH);

      worker.on('message', (result: HashResult) => {
        const pending = this.taskCallbacks.get(result.id);
        if (pending) {
          this.taskCallbacks.delete(result.id);
          if (result.error) {
            pending.reject(new Error(result.error));
          } else {
            pending.resolve(result);
          }
        }

        // Worker is now available
        this.availableWorkers.push(worker);
        this.processNextTask();
      });

      worker.on('error', (err) => {
        console.error('Worker error:', err);
      });

      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  /**
   * Hash a single file using the worker pool
   */
  async hashFile(filePath: string, algorithm: Algorithm = 'blake3'): Promise<HashResult> {
    const isNetwork = isNetworkPath(filePath);
    const bufferSize = isNetwork ? NETWORK_BUFFER_SIZE : LOCAL_BUFFER_SIZE;

    const task: HashTask = {
      id: ++this.taskIdCounter,
      filePath,
      algorithm,
      bufferSize
    };

    return new Promise((resolve, reject) => {
      const pending: PendingTask = { task, resolve, reject };
      this.taskCallbacks.set(task.id, pending);
      this.pendingTasks.push(pending);
      this.processNextTask();
    });
  }

  /**
   * Hash multiple files in parallel
   */
  async hashFiles(
    files: string[],
    algorithm: Algorithm = 'blake3',
    onProgress?: (completed: number, total: number, file: string) => void
  ): Promise<HashResult[]> {
    const results: HashResult[] = [];
    let completed = 0;

    // Determine effective concurrency based on path type
    const isNetwork = files.length > 0 && isNetworkPath(files[0]);
    const effectiveConcurrency = isNetwork ? this.networkConcurrency : this.concurrency;

    // Process in batches
    const batches: string[][] = [];
    for (let i = 0; i < files.length; i += effectiveConcurrency) {
      batches.push(files.slice(i, i + effectiveConcurrency));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(async (file) => {
        try {
          const result = await this.hashFile(file, algorithm);
          completed++;
          onProgress?.(completed, files.length, file);
          return result;
        } catch (err: unknown) {
          completed++;
          onProgress?.(completed, files.length, file);
          return {
            id: 0,
            filePath: file,
            hash: '',
            size: 0,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Process next pending task if worker available
   */
  private processNextTask(): void {
    if (this.pendingTasks.length === 0 || this.availableWorkers.length === 0) {
      return;
    }

    const worker = this.availableWorkers.pop()!;
    const pending = this.pendingTasks.shift()!;

    worker.postMessage(pending.task);
  }

  /**
   * Shutdown all workers
   */
  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map(w => w.terminate()));
    this.workers = [];
    this.availableWorkers = [];
  }

  /**
   * Get pool statistics
   */
  getStats(): { workers: number; pending: number; active: number } {
    return {
      workers: this.workers.length,
      pending: this.pendingTasks.length,
      active: this.workers.length - this.availableWorkers.length
    };
  }
}

// Singleton pool for convenience
let defaultPool: WorkerPool | null = null;

export async function getDefaultPool(options?: WorkerPoolOptions): Promise<WorkerPool> {
  if (!defaultPool) {
    defaultPool = new WorkerPool(options);
    await defaultPool.initialize();
  }
  return defaultPool;
}

export async function shutdownDefaultPool(): Promise<void> {
  if (defaultPool) {
    await defaultPool.shutdown();
    defaultPool = null;
  }
}
