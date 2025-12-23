/**
 * BagIt Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createBag, verifyBag } from '../../src/services/bagit/index.js';

describe('BagIt Service', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `wnb-bagit-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('createBag', () => {
    it('should create valid BagIt structure', async () => {
      // Create test file
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');

      const result = await createBag(tempDir);

      // Check result
      expect(result.fileCount).toBe(1);
      expect(result.algorithm).toBe('sha256');
      expect(result.tagFiles).toContain('bagit.txt');
      expect(result.tagFiles).toContain('bag-info.txt');
      expect(result.tagFiles).toContain('manifest-sha256.txt');

      // Check files exist
      expect(await fs.access(path.join(tempDir, 'bagit.txt')).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(path.join(tempDir, 'bag-info.txt')).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(path.join(tempDir, 'data')).then(() => true).catch(() => false)).toBe(true);
    });

    it('should move files to data/ directory', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');

      await createBag(tempDir);

      // Original should not exist
      const originalExists = await fs.access(path.join(tempDir, 'test.txt')).then(() => true).catch(() => false);
      expect(originalExists).toBe(false);

      // Should be in data/
      const dataExists = await fs.access(path.join(tempDir, 'data', 'test.txt')).then(() => true).catch(() => false);
      expect(dataExists).toBe(true);
    });

    it('should generate correct bagit.txt', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');

      await createBag(tempDir);

      const bagitTxt = await fs.readFile(path.join(tempDir, 'bagit.txt'), 'utf-8');
      expect(bagitTxt).toContain('BagIt-Version: 1.0');
      expect(bagitTxt).toContain('Tag-File-Character-Encoding: UTF-8');
    });

    it('should generate bag-info.txt with Payload-Oxum', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');

      await createBag(tempDir);

      const bagInfo = await fs.readFile(path.join(tempDir, 'bag-info.txt'), 'utf-8');
      expect(bagInfo).toContain('Payload-Oxum:');
      expect(bagInfo).toContain('Bag-Software-Agent: wake-n-blake');
      expect(bagInfo).toContain('Bagging-Date:');
    });

    it('should include custom bag-info metadata', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');

      await createBag(tempDir, {
        bagInfo: {
          'Source-Organization': 'Test Org',
          'Contact-Name': 'Test User'
        }
      });

      const bagInfo = await fs.readFile(path.join(tempDir, 'bag-info.txt'), 'utf-8');
      expect(bagInfo).toContain('Source-Organization: Test Org');
      expect(bagInfo).toContain('Contact-Name: Test User');
    });

    it('should generate manifest with correct format', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');

      await createBag(tempDir);

      const manifest = await fs.readFile(path.join(tempDir, 'manifest-sha256.txt'), 'utf-8');
      // Format: hash  path (two spaces)
      expect(manifest).toMatch(/^[a-f0-9]{64}\s{2}data\/test\.txt$/m);
    });

    it('should use sha512 when requested', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');

      const result = await createBag(tempDir, { algorithm: 'sha512' });

      expect(result.algorithm).toBe('sha512');
      const manifestExists = await fs.access(path.join(tempDir, 'manifest-sha512.txt')).then(() => true).catch(() => false);
      expect(manifestExists).toBe(true);
    });

    it('should throw error if already a bag', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');
      await createBag(tempDir);

      await expect(createBag(tempDir)).rejects.toThrow('already a BagIt package');
    });

    it('should call progress callback', async () => {
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'content2');

      const progressCalls: number[] = [];
      await createBag(tempDir, {
        onProgress: (current) => progressCalls.push(current)
      });

      expect(progressCalls).toEqual([1, 2]);
    });
  });

  describe('verifyBag', () => {
    it('should verify valid bag', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');
      await createBag(tempDir);

      const result = await verifyBag(tempDir);

      expect(result.valid).toBe(true);
      expect(result.payloadValid).toBe(true);
      expect(result.tagFilesValid).toBe(true);
      expect(result.payloadOxumMatch).toBe(true);
      expect(result.verifiedFiles).toBe(1);
    });

    it('should detect missing payload files', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');
      await createBag(tempDir);

      // Delete a payload file
      await fs.unlink(path.join(tempDir, 'data', 'test.txt'));

      const result = await verifyBag(tempDir);

      expect(result.valid).toBe(false);
      expect(result.payloadValid).toBe(false);
      expect(result.missingFiles).toHaveLength(1);
    });

    it('should detect modified payload files', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'original content');
      await createBag(tempDir);

      // Modify payload file
      await fs.writeFile(path.join(tempDir, 'data', 'test.txt'), 'modified content');

      const result = await verifyBag(tempDir);

      expect(result.valid).toBe(false);
      expect(result.payloadValid).toBe(false);
      expect(result.invalidFiles).toHaveLength(1);
    });

    it('should detect extra files in data directory', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');
      await createBag(tempDir);

      // Add extra file to data/
      await fs.writeFile(path.join(tempDir, 'data', 'extra.txt'), 'extra');

      const result = await verifyBag(tempDir);

      // Extra files should be reported
      expect(result.extraFiles).toContain('data/extra.txt');
    });

    it('should return error for missing bagit.txt', async () => {
      // Create directory without bagit.txt
      await fs.mkdir(path.join(tempDir, 'data'));
      await fs.writeFile(path.join(tempDir, 'data', 'test.txt'), 'content');

      const result = await verifyBag(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing bagit.txt');
    });
  });
});
