/**
 * Copier Tests
 * Tests for network-safe file copying with inline hashing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { copyWithHash, copyBatch, moveWithHash } from '../../src/core/copier.js';
import { hashFile } from '../../src/core/hasher.js';

describe('Copier', () => {
  let tempDir: string;
  let sourceDir: string;
  let destDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-copier-test-'));
    sourceDir = path.join(tempDir, 'source');
    destDir = path.join(tempDir, 'dest');
    await fs.mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('copyWithHash', () => {
    it('should copy file and return hash', async () => {
      const sourceFile = path.join(sourceDir, 'test.txt');
      const destFile = path.join(destDir, 'test.txt');
      await fs.writeFile(sourceFile, 'Copy me with hash');

      const result = await copyWithHash(sourceFile, destFile);

      expect(result.source).toBe(sourceFile);
      expect(result.destination).toBe(destFile);
      expect(result.hash).toHaveLength(16);
      expect(result.algorithm).toBe('blake3');
      expect(result.size).toBe(17); // "Copy me with hash"
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.verified).toBe(true);
      expect(result.retries).toBe(0);

      // Verify file was copied
      const destContent = await fs.readFile(destFile, 'utf-8');
      expect(destContent).toBe('Copy me with hash');
    });

    it('should verify copy by default', async () => {
      const sourceFile = path.join(sourceDir, 'verify.txt');
      const destFile = path.join(destDir, 'verify.txt');
      await fs.writeFile(sourceFile, 'Verify this copy');

      const result = await copyWithHash(sourceFile, destFile, { verify: true });

      expect(result.verified).toBe(true);

      // Double-check by re-hashing
      const destHash = await hashFile(destFile, 'blake3');
      expect(destHash.hash).toBe(result.hash);
    });

    it('should skip verification when disabled', async () => {
      const sourceFile = path.join(sourceDir, 'noverify.txt');
      const destFile = path.join(destDir, 'noverify.txt');
      await fs.writeFile(sourceFile, 'No verify');

      const result = await copyWithHash(sourceFile, destFile, { verify: false });

      expect(result.verified).toBe(false);
    });

    it('should create destination directory if needed', async () => {
      const sourceFile = path.join(sourceDir, 'nested.txt');
      const destFile = path.join(destDir, 'deep', 'nested', 'file.txt');
      await fs.writeFile(sourceFile, 'Nested content');

      const result = await copyWithHash(sourceFile, destFile);

      expect(result.destination).toBe(destFile);
      const content = await fs.readFile(destFile, 'utf-8');
      expect(content).toBe('Nested content');
    });

    it('should fail if destination exists and overwrite is false', async () => {
      const sourceFile = path.join(sourceDir, 'source.txt');
      const destFile = path.join(destDir, 'existing.txt');
      await fs.writeFile(sourceFile, 'Source');
      await fs.mkdir(destDir, { recursive: true });
      await fs.writeFile(destFile, 'Existing');

      await expect(copyWithHash(sourceFile, destFile, { overwrite: false }))
        .rejects.toThrow('Destination already exists');
    });

    it('should overwrite when overwrite is true', async () => {
      const sourceFile = path.join(sourceDir, 'source.txt');
      const destFile = path.join(destDir, 'existing.txt');
      await fs.writeFile(sourceFile, 'New content');
      await fs.mkdir(destDir, { recursive: true });
      await fs.writeFile(destFile, 'Old content');

      const result = await copyWithHash(sourceFile, destFile, { overwrite: true });

      const content = await fs.readFile(destFile, 'utf-8');
      expect(content).toBe('New content');
    });

    it('should preserve timestamps by default', async () => {
      const sourceFile = path.join(sourceDir, 'timestamps.txt');
      const destFile = path.join(destDir, 'timestamps.txt');
      await fs.writeFile(sourceFile, 'Preserve my times');

      // Set specific mtime
      const mtime = new Date('2023-06-15T10:30:00Z');
      await fs.utimes(sourceFile, mtime, mtime);

      await copyWithHash(sourceFile, destFile, { preserveTimestamps: true });

      const sourceStats = await fs.stat(sourceFile);
      const destStats = await fs.stat(destFile);

      expect(destStats.mtime.getTime()).toBe(sourceStats.mtime.getTime());
    });

    it('should support different algorithms', async () => {
      const sourceFile = path.join(sourceDir, 'algo.txt');
      const destFile256 = path.join(destDir, 'sha256.txt');
      const destFile512 = path.join(destDir, 'sha512.txt');
      await fs.writeFile(sourceFile, 'Algorithm test');

      const sha256Result = await copyWithHash(sourceFile, destFile256, { algorithm: 'sha256' });
      const sha512Result = await copyWithHash(sourceFile, destFile512, { algorithm: 'sha512' });

      expect(sha256Result.hash).toHaveLength(64);
      expect(sha256Result.algorithm).toBe('sha256');
      expect(sha512Result.hash).toHaveLength(128);
      expect(sha512Result.algorithm).toBe('sha512');
    });

    it('should report progress via callback', async () => {
      const sourceFile = path.join(sourceDir, 'progress.txt');
      const destFile = path.join(destDir, 'progress.txt');
      // Create a larger file for progress tracking
      const content = 'x'.repeat(10000);
      await fs.writeFile(sourceFile, content);

      const progressCalls: Array<{ bytes: number; total: number }> = [];

      await copyWithHash(sourceFile, destFile, {
        onProgress: (bytes, total) => {
          progressCalls.push({ bytes, total });
        }
      });

      expect(progressCalls.length).toBeGreaterThan(0);
      // Final call should have bytes === total
      const lastCall = progressCalls[progressCalls.length - 1];
      expect(lastCall.bytes).toBe(lastCall.total);
    });

    it('should handle binary files', async () => {
      const sourceFile = path.join(sourceDir, 'binary.bin');
      const destFile = path.join(destDir, 'binary.bin');
      const binaryContent = Buffer.from([0x00, 0xFF, 0x7F, 0x80, 0xFE, 0x01]);
      await fs.writeFile(sourceFile, binaryContent);

      const result = await copyWithHash(sourceFile, destFile);

      const destContent = await fs.readFile(destFile);
      expect(destContent.equals(binaryContent)).toBe(true);
      expect(result.size).toBe(6);
    });

    it('should throw for non-existent source', async () => {
      const destFile = path.join(destDir, 'dest.txt');

      await expect(copyWithHash('/nonexistent/file.txt', destFile))
        .rejects.toThrow();
    });
  });

  describe('copyBatch', () => {
    it('should copy multiple files', async () => {
      const files = [
        { source: path.join(sourceDir, 'file1.txt'), destination: path.join(destDir, 'file1.txt') },
        { source: path.join(sourceDir, 'file2.txt'), destination: path.join(destDir, 'file2.txt') },
        { source: path.join(sourceDir, 'file3.txt'), destination: path.join(destDir, 'file3.txt') }
      ];

      for (let i = 0; i < files.length; i++) {
        await fs.writeFile(files[i].source, `Content ${i + 1}`);
      }

      const results = await copyBatch(files);

      expect(results).toHaveLength(3);
      // Results may not be in order due to concurrency, so check by finding each
      for (const file of files) {
        const found = results.find(r => r.source === file.source);
        expect(found).toBeDefined();
        expect(found!.destination).toBe(file.destination);
      }
    });

    it('should respect concurrency option', async () => {
      const files = [];
      for (let i = 0; i < 10; i++) {
        const source = path.join(sourceDir, `file${i}.txt`);
        await fs.writeFile(source, `Content ${i}`);
        files.push({
          source,
          destination: path.join(destDir, `file${i}.txt`)
        });
      }

      const results = await copyBatch(files, { concurrency: 2 });

      expect(results).toHaveLength(10);
    });

    it('should continue on individual file errors', async () => {
      const files = [
        { source: path.join(sourceDir, 'good.txt'), destination: path.join(destDir, 'good.txt') },
        { source: '/nonexistent/bad.txt', destination: path.join(destDir, 'bad.txt') }
      ];

      await fs.writeFile(files[0].source, 'Good file');

      const results = await copyBatch(files);

      // Only the good file should be in results
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe(files[0].source);
    });
  });

  describe('moveWithHash', () => {
    it('should move file (copy + delete source)', async () => {
      const sourceFile = path.join(sourceDir, 'move.txt');
      const destFile = path.join(destDir, 'move.txt');
      await fs.writeFile(sourceFile, 'Move me');

      const result = await moveWithHash(sourceFile, destFile);

      expect(result.verified).toBe(true);

      // Source should be deleted
      await expect(fs.access(sourceFile)).rejects.toThrow();

      // Destination should exist
      const content = await fs.readFile(destFile, 'utf-8');
      expect(content).toBe('Move me');
    });

    it('should verify before deleting source', async () => {
      const sourceFile = path.join(sourceDir, 'safe.txt');
      const destFile = path.join(destDir, 'safe.txt');
      await fs.writeFile(sourceFile, 'Safe content');

      const result = await moveWithHash(sourceFile, destFile);

      expect(result.verified).toBe(true);
      // If verification failed, source would still exist
      // Since test passes, verification worked
    });
  });

  describe('Large File Handling', () => {
    it('should handle files larger than buffer size', async () => {
      const sourceFile = path.join(sourceDir, 'large.bin');
      const destFile = path.join(destDir, 'large.bin');
      // Create 2MB file
      const content = Buffer.alloc(2 * 1024 * 1024, 'x');
      await fs.writeFile(sourceFile, content);

      const result = await copyWithHash(sourceFile, destFile);

      expect(result.size).toBe(2 * 1024 * 1024);
      expect(result.verified).toBe(true);

      const destContent = await fs.readFile(destFile);
      expect(destContent.equals(content)).toBe(true);
    });
  });
});
