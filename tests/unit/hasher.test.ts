/**
 * Hasher Tests
 * Tests for core hashing functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  hashFile,
  hashBlake3,
  hashSha256,
  hashSha512,
  hashBuffer,
  hashString,
  verifyFile
} from '../../src/core/hasher.js';

describe('Hasher', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-hasher-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('hashFile', () => {
    it('should hash a file with blake3 algorithm', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello, World!');

      const result = await hashFile(testFile, 'blake3');

      expect(result.hash).toHaveLength(16);
      expect(result.hash).toMatch(/^[a-f0-9]{16}$/);
      expect(result.algorithm).toBe('blake3');
      expect(result.size).toBe(13); // "Hello, World!" is 13 bytes
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should hash a file with blake3-full algorithm', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello, World!');

      const result = await hashFile(testFile, 'blake3-full');

      expect(result.hash).toHaveLength(64);
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.algorithm).toBe('blake3-full');
    });

    it('should hash a file with sha256 algorithm', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello, World!');

      const result = await hashFile(testFile, 'sha256');

      expect(result.hash).toHaveLength(64);
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.algorithm).toBe('sha256');
    });

    it('should hash a file with sha512 algorithm', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello, World!');

      const result = await hashFile(testFile, 'sha512');

      expect(result.hash).toHaveLength(128);
      expect(result.hash).toMatch(/^[a-f0-9]{128}$/);
      expect(result.algorithm).toBe('sha512');
    });

    it('should produce consistent hash for same content', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Consistent Content');

      const result1 = await hashFile(testFile, 'blake3');
      const result2 = await hashFile(testFile, 'blake3');

      expect(result1.hash).toBe(result2.hash);
    });

    it('should produce different hashes for different content', async () => {
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      await fs.writeFile(file1, 'Content A');
      await fs.writeFile(file2, 'Content B');

      const result1 = await hashFile(file1, 'blake3');
      const result2 = await hashFile(file2, 'blake3');

      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should handle empty files', async () => {
      const emptyFile = path.join(tempDir, 'empty.txt');
      await fs.writeFile(emptyFile, '');

      const result = await hashFile(emptyFile, 'blake3');

      expect(result.hash).toHaveLength(16);
      expect(result.size).toBe(0);
    });

    it('should handle binary files', async () => {
      const binaryFile = path.join(tempDir, 'binary.bin');
      const binaryContent = Buffer.from([0x00, 0xFF, 0x7F, 0x80, 0x01]);
      await fs.writeFile(binaryFile, binaryContent);

      const result = await hashFile(binaryFile, 'blake3');

      expect(result.hash).toHaveLength(16);
      expect(result.size).toBe(5);
    });

    it('should throw for non-existent file', async () => {
      await expect(hashFile('/nonexistent/file.txt', 'blake3'))
        .rejects.toThrow();
    });
  });

  describe('hashBlake3', () => {
    it('should hash with truncated output by default', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Test content');

      const hash = await hashBlake3(testFile);

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should hash with full output when specified', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Test content');

      const hash = await hashBlake3(testFile, { full: true });

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('hashSha256', () => {
    it('should produce valid SHA-256 hash', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Test for SHA-256');

      const hash = await hashSha256(testFile);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('hashSha512', () => {
    it('should produce valid SHA-512 hash', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Test for SHA-512');

      const hash = await hashSha512(testFile);

      expect(hash).toHaveLength(128);
      expect(hash).toMatch(/^[a-f0-9]{128}$/);
    });
  });

  describe('hashBuffer', () => {
    it('should hash a buffer and return truncated hash by default', () => {
      const buffer = Buffer.from('Buffer content');

      const hash = hashBuffer(buffer);

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should hash a buffer with full hash when full=true', () => {
      const buffer = Buffer.from('Buffer content');

      const hash = hashBuffer(buffer, true);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be consistent', () => {
      const buffer = Buffer.from('Same content');

      const hash1 = hashBuffer(buffer);
      const hash2 = hashBuffer(buffer);

      expect(hash1).toBe(hash2);
    });
  });

  describe('hashString', () => {
    it('should hash a string and return truncated hash by default', () => {
      const hash = hashString('String to hash');

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should hash a string with full hash when full=true', () => {
      const hash = hashString('String to hash', true);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle Unicode strings', () => {
      const hash = hashString('Unicode: 你好世界 🌍');

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should handle empty strings', () => {
      const hash = hashString('');

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('verifyFile', () => {
    it('should return match=true for matching hash', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Verify me');

      const hashResult = await hashFile(testFile, 'blake3');
      const verified = await verifyFile(testFile, hashResult.hash, 'blake3');

      expect(verified.match).toBe(true);
      expect(verified.actual).toBe(hashResult.hash);
      expect(verified.algorithm).toBe('blake3');
    });

    it('should return match=false for non-matching hash', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Verify me');

      const verified = await verifyFile(testFile, 'wronghash12345678', 'blake3');

      expect(verified.match).toBe(false);
    });

    it('should work with different algorithms', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Multi-algo test');

      const blake3Result = await hashFile(testFile, 'blake3');
      const sha256Result = await hashFile(testFile, 'sha256');

      const blake3Verify = await verifyFile(testFile, blake3Result.hash, 'blake3');
      const sha256Verify = await verifyFile(testFile, sha256Result.hash, 'sha256');

      expect(blake3Verify.match).toBe(true);
      expect(sha256Verify.match).toBe(true);

      // Cross-algorithm should fail
      const crossVerify = await verifyFile(testFile, blake3Result.hash, 'sha256');
      expect(crossVerify.match).toBe(false);
    });
  });

  describe('Large File Handling', () => {
    it('should handle files larger than buffer size', async () => {
      const largeFile = path.join(tempDir, 'large.bin');
      // Create a 1MB file
      const content = Buffer.alloc(1024 * 1024, 'x');
      await fs.writeFile(largeFile, content);

      const result = await hashFile(largeFile, 'blake3');

      expect(result.hash).toHaveLength(16);
      expect(result.size).toBe(1024 * 1024);
    });
  });
});
