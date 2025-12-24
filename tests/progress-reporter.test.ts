/**
 * Progress Reporter Tests
 *
 * Tests for Unix socket-based progress reporting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, Server, Socket } from 'net';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProgressReporter, getProgressReporter, ProgressData, StageInfo } from '../src/core/progress-reporter.js';

describe('ProgressReporter', () => {
  let reporter: ProgressReporter;
  let server: Server;
  let socketPath: string;
  let tempDir: string;
  let serverConnection: Socket | null = null;
  let receivedMessages: string[] = [];

  beforeEach(() => {
    // Create temp directory for socket
    tempDir = mkdtempSync(join(tmpdir(), 'wnb-test-'));
    socketPath = join(tempDir, 'progress.sock');

    // Create mock server
    receivedMessages = [];
    serverConnection = null;

    server = createServer((socket) => {
      serverConnection = socket;
      socket.on('data', (data) => {
        receivedMessages.push(...data.toString().split('\n').filter(Boolean));
      });
    });

    server.listen(socketPath);

    // Set environment variable
    process.env.PROGRESS_SOCKET = socketPath;
    process.env.PROGRESS_SESSION_ID = 'test-session-123';

    reporter = new ProgressReporter();
  });

  afterEach(async () => {
    reporter.close();
    server.close();

    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }

    delete process.env.PROGRESS_SOCKET;
    delete process.env.PROGRESS_SESSION_ID;
  });

  describe('connect()', () => {
    it('should connect to socket when PROGRESS_SOCKET is set', async () => {
      const connected = await reporter.connect();

      expect(connected).toBe(true);
      expect(reporter.isConnected).toBe(true);
    });

    it('should return false when PROGRESS_SOCKET is not set', async () => {
      delete process.env.PROGRESS_SOCKET;
      reporter = new ProgressReporter();

      const connected = await reporter.connect();

      expect(connected).toBe(false);
      expect(reporter.isConnected).toBe(false);
    });

    it('should return false when socket path does not exist', async () => {
      process.env.PROGRESS_SOCKET = '/nonexistent/path/socket.sock';
      reporter = new ProgressReporter();

      const connected = await reporter.connect();

      expect(connected).toBe(false);
    });
  });

  describe('send()', () => {
    it('should send JSON messages with required fields', async () => {
      await reporter.connect();

      reporter.send({ type: 'test', custom: 'data' });

      // Wait for message to be received
      await new Promise((r) => setTimeout(r, 50));

      expect(receivedMessages.length).toBeGreaterThan(0);
      const msg = JSON.parse(receivedMessages[0]);

      expect(msg.type).toBe('test');
      expect(msg.custom).toBe('data');
      expect(msg.timestamp).toBeDefined();
      expect(msg.session_id).toBe('test-session-123');
      expect(msg.app).toBe('wake-n-blake');
      expect(msg.app_version).toBeDefined();
    });

    it('should not throw when not connected', () => {
      // Should not throw
      expect(() => reporter.send({ type: 'test' })).not.toThrow();
    });
  });

  describe('stageStarted()', () => {
    it('should send stage_started message', async () => {
      await reporter.connect();

      const stage: StageInfo = {
        name: 'hashing',
        displayName: 'Computing hashes',
        number: 1,
        totalStages: 3,
        weight: 80,
      };

      reporter.stageStarted(stage);

      await new Promise((r) => setTimeout(r, 50));

      expect(receivedMessages.length).toBe(1);
      const msg = JSON.parse(receivedMessages[0]);

      expect(msg.type).toBe('stage_started');
      expect(msg.stage.name).toBe('hashing');
      expect(msg.stage.display_name).toBe('Computing hashes');
      expect(msg.stage.number).toBe(1);
      expect(msg.stage.total_stages).toBe(3);
    });
  });

  describe('stageCompleted()', () => {
    it('should send stage_completed message', async () => {
      await reporter.connect();

      const stage: StageInfo = {
        name: 'hashing',
        displayName: 'Computing hashes',
        number: 1,
        totalStages: 3,
        weight: 80,
      };

      reporter.stageCompleted(stage, 5000, 100);

      await new Promise((r) => setTimeout(r, 50));

      expect(receivedMessages.length).toBe(1);
      const msg = JSON.parse(receivedMessages[0]);

      expect(msg.type).toBe('stage_completed');
      expect(msg.stage.name).toBe('hashing');
      expect(msg.duration_ms).toBe(5000);
      expect(msg.items_processed).toBe(100);
    });
  });

  describe('progress()', () => {
    it('should send progress message with all fields', async () => {
      await reporter.connect();
      reporter.resetStartTime();

      const data: ProgressData = {
        stage: {
          name: 'hashing',
          displayName: 'Computing hashes',
          number: 1,
          totalStages: 3,
          weight: 80,
        },
        completed: 50,
        total: 100,
        failed: 2,
        skipped: 3,
        currentFile: '/path/to/file.jpg',
        percentComplete: 50.0,
        etaMs: 30000,
        bytesProcessed: 1024000,
        totalBytes: 2048000,
        throughputBytesPerSec: 100000,
        throughputFilesPerSec: 10,
      };

      reporter.progress(data);

      await new Promise((r) => setTimeout(r, 50));

      expect(receivedMessages.length).toBe(1);
      const msg = JSON.parse(receivedMessages[0]);

      expect(msg.type).toBe('progress');
      expect(msg.stage.name).toBe('hashing');
      expect(msg.items.completed).toBe(50);
      expect(msg.items.total).toBe(100);
      expect(msg.items.failed).toBe(2);
      expect(msg.items.skipped).toBe(3);
      expect(msg.bytes.completed).toBe(1024000);
      expect(msg.bytes.total).toBe(2048000);
      expect(msg.current.item).toBe('/path/to/file.jpg');
      expect(msg.current.item_short).toBe('file.jpg');
      expect(msg.timing.eta_ms).toBe(30000);
      expect(msg.throughput.bytes_per_sec).toBe(100000);
      expect(msg.throughput.items_per_sec).toBe(10);
      expect(msg.percent_complete).toBe(50.0);
    });

    it('should handle missing optional fields', async () => {
      await reporter.connect();

      const data: ProgressData = {
        stage: {
          name: 'hashing',
          displayName: 'Computing hashes',
          number: 1,
          totalStages: 3,
          weight: 80,
        },
        completed: 50,
        total: 100,
        percentComplete: 50.0,
      };

      reporter.progress(data);

      await new Promise((r) => setTimeout(r, 50));

      const msg = JSON.parse(receivedMessages[0]);
      expect(msg.items.failed).toBe(0);
      expect(msg.items.skipped).toBe(0);
      expect(msg.bytes).toBeUndefined();
    });
  });

  describe('itemCompleted()', () => {
    it('should send item_completed message', async () => {
      await reporter.connect();

      reporter.itemCompleted('/path/to/file.jpg', 'success', 150, 1024);

      await new Promise((r) => setTimeout(r, 50));

      const msg = JSON.parse(receivedMessages[0]);

      expect(msg.type).toBe('item_completed');
      expect(msg.item).toBe('/path/to/file.jpg');
      expect(msg.status).toBe('success');
      expect(msg.duration_ms).toBe(150);
      expect(msg.bytes_processed).toBe(1024);
    });
  });

  describe('error()', () => {
    it('should send error message', async () => {
      await reporter.connect();

      reporter.error('FILE_NOT_FOUND', 'File does not exist', '/missing.jpg', false);

      await new Promise((r) => setTimeout(r, 50));

      const msg = JSON.parse(receivedMessages[0]);

      expect(msg.type).toBe('error');
      expect(msg.error.code).toBe('FILE_NOT_FOUND');
      expect(msg.error.message).toBe('File does not exist');
      expect(msg.error.item).toBe('/missing.jpg');
      expect(msg.error.fatal).toBe(false);
    });
  });

  describe('complete()', () => {
    it('should send complete message with summary', async () => {
      await reporter.connect();

      reporter.complete({
        totalItems: 100,
        successful: 95,
        failed: 3,
        skipped: 2,
        durationMs: 60000,
        bytesProcessed: 1024000000,
      });

      await new Promise((r) => setTimeout(r, 50));

      const msg = JSON.parse(receivedMessages[0]);

      expect(msg.type).toBe('complete');
      expect(msg.summary.total_items).toBe(100);
      expect(msg.summary.successful).toBe(95);
      expect(msg.summary.failed).toBe(3);
      expect(msg.summary.skipped).toBe(2);
      expect(msg.summary.duration_ms).toBe(60000);
      expect(msg.summary.bytes_processed).toBe(1024000000);
      expect(msg.exit_code).toBe(1); // Because failed > 0
    });

    it('should set exit_code to 0 when no failures', async () => {
      await reporter.connect();

      reporter.complete({
        totalItems: 100,
        successful: 100,
        failed: 0,
        skipped: 0,
        durationMs: 60000,
      });

      await new Promise((r) => setTimeout(r, 50));

      const msg = JSON.parse(receivedMessages[0]);
      expect(msg.exit_code).toBe(0);
    });
  });

  describe('control commands', () => {
    it('should handle pause command', async () => {
      await reporter.connect();

      const pauseHandler = vi.fn();
      reporter.on('pause', pauseHandler);

      // Send pause command from server
      serverConnection?.write(JSON.stringify({ type: 'control', command: 'pause' }) + '\n');

      await new Promise((r) => setTimeout(r, 50));

      expect(reporter.paused).toBe(true);
      expect(pauseHandler).toHaveBeenCalled();

      // Check ack was sent
      const ackMsg = receivedMessages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'ack' && parsed.command === 'pause';
      });
      expect(ackMsg).toBeDefined();
    });

    it('should handle resume command', async () => {
      await reporter.connect();

      const resumeHandler = vi.fn();
      reporter.on('resume', resumeHandler);

      // First pause
      serverConnection?.write(JSON.stringify({ type: 'control', command: 'pause' }) + '\n');
      await new Promise((r) => setTimeout(r, 50));
      expect(reporter.paused).toBe(true);

      // Then resume
      serverConnection?.write(JSON.stringify({ type: 'control', command: 'resume' }) + '\n');
      await new Promise((r) => setTimeout(r, 50));

      expect(reporter.paused).toBe(false);
      expect(resumeHandler).toHaveBeenCalled();
    });

    it('should handle cancel command', async () => {
      await reporter.connect();

      const cancelHandler = vi.fn();
      reporter.on('cancel', cancelHandler);

      serverConnection?.write(
        JSON.stringify({ type: 'control', command: 'cancel', reason: 'User requested' }) + '\n'
      );

      await new Promise((r) => setTimeout(r, 50));

      expect(reporter.cancelled).toBe(true);
      expect(cancelHandler).toHaveBeenCalledWith('User requested');
    });
  });

  describe('shouldContinue()', () => {
    it('should return true when not cancelled', async () => {
      await reporter.connect();
      expect(reporter.shouldContinue()).toBe(true);
    });

    it('should return false when cancelled', async () => {
      await reporter.connect();

      serverConnection?.write(JSON.stringify({ type: 'control', command: 'cancel' }) + '\n');
      await new Promise((r) => setTimeout(r, 50));

      expect(reporter.shouldContinue()).toBe(false);
    });
  });

  describe('waitWhilePaused()', () => {
    it('should wait while paused and return when resumed', async () => {
      await reporter.connect();

      // Pause
      serverConnection?.write(JSON.stringify({ type: 'control', command: 'pause' }) + '\n');
      await new Promise((r) => setTimeout(r, 50));

      // Start waiting in background
      let waitCompleted = false;
      const waitPromise = reporter.waitWhilePaused().then(() => {
        waitCompleted = true;
      });

      // Should not complete immediately
      await new Promise((r) => setTimeout(r, 150));
      expect(waitCompleted).toBe(false);

      // Resume
      serverConnection?.write(JSON.stringify({ type: 'control', command: 'resume' }) + '\n');

      // Now should complete
      await waitPromise;
      expect(waitCompleted).toBe(true);
    });

    it('should exit immediately when cancelled while paused', async () => {
      await reporter.connect();

      // Pause
      serverConnection?.write(JSON.stringify({ type: 'control', command: 'pause' }) + '\n');
      await new Promise((r) => setTimeout(r, 50));

      // Start waiting in background
      let waitCompleted = false;
      const waitPromise = reporter.waitWhilePaused().then(() => {
        waitCompleted = true;
      });

      // Cancel should break the wait
      serverConnection?.write(JSON.stringify({ type: 'control', command: 'cancel' }) + '\n');

      await waitPromise;
      expect(waitCompleted).toBe(true);
    });
  });

  describe('getProgressReporter()', () => {
    it('should return singleton instance', () => {
      // Reset module state
      vi.resetModules();

      const reporter1 = getProgressReporter();
      const reporter2 = getProgressReporter();

      expect(reporter1).toBe(reporter2);
    });
  });
});

describe('Standalone mode', () => {
  it('should work without socket (silent mode)', () => {
    delete process.env.PROGRESS_SOCKET;

    const reporter = new ProgressReporter();

    // Should not throw any errors
    expect(() => {
      reporter.send({ type: 'test' });
      reporter.stageStarted({
        name: 'test',
        displayName: 'Test',
        number: 1,
        totalStages: 1,
        weight: 100,
      });
      reporter.complete({
        totalItems: 10,
        successful: 10,
        failed: 0,
        skipped: 0,
        durationMs: 1000,
      });
    }).not.toThrow();

    expect(reporter.isConnected).toBe(false);
  });
});
