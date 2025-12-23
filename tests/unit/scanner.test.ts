/**
 * Scanner unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { scanDirectory, getFileInfos, scanWithInfo } from '../../src/services/scanner.js';

describe('Scanner', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temp test directory
    testDir = path.join(os.tmpdir(), `wnb-scanner-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('scanDirectory', () => {
    it('should find all files in a directory', async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content2');
      await fs.writeFile(path.join(testDir, 'file3.txt'), 'content3');

      const result = await scanDirectory(testDir);

      expect(result.files).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
    });

    it('should find files recursively', async () => {
      // Create nested structure
      const subDir = path.join(testDir, 'subdir');
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(testDir, 'root.txt'), 'root');
      await fs.writeFile(path.join(subDir, 'nested.txt'), 'nested');

      const result = await scanDirectory(testDir, { recursive: true });

      expect(result.files).toHaveLength(2);
      expect(result.directories).toContain(subDir);
    });

    it('should not recurse when recursive is false', async () => {
      const subDir = path.join(testDir, 'subdir');
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(testDir, 'root.txt'), 'root');
      await fs.writeFile(path.join(subDir, 'nested.txt'), 'nested');

      const result = await scanDirectory(testDir, { recursive: false });

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toContain('root.txt');
    });

    it('should skip hidden files by default', async () => {
      await fs.writeFile(path.join(testDir, 'visible.txt'), 'visible');
      await fs.writeFile(path.join(testDir, '.hidden'), 'hidden');

      const result = await scanDirectory(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toContain('visible.txt');
      expect(result.skipped).toBeGreaterThan(0);
    });

    it('should include hidden files when option is set', async () => {
      await fs.writeFile(path.join(testDir, 'visible.txt'), 'visible');
      await fs.writeFile(path.join(testDir, '.hidden'), 'hidden');

      const result = await scanDirectory(testDir, { includeHidden: true });

      expect(result.files).toHaveLength(2);
    });

    it('should filter by minimum size', async () => {
      await fs.writeFile(path.join(testDir, 'small.txt'), 'a');
      await fs.writeFile(path.join(testDir, 'large.txt'), 'a'.repeat(100));

      const result = await scanDirectory(testDir, { minSize: 50 });

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toContain('large.txt');
    });

    it('should filter by maximum size', async () => {
      await fs.writeFile(path.join(testDir, 'small.txt'), 'a');
      await fs.writeFile(path.join(testDir, 'large.txt'), 'a'.repeat(100));

      const result = await scanDirectory(testDir, { maxSize: 50 });

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toContain('small.txt');
    });

    it('should exclude patterns', async () => {
      await fs.writeFile(path.join(testDir, 'keep.txt'), 'keep');
      await fs.writeFile(path.join(testDir, 'skip.log'), 'skip');

      const result = await scanDirectory(testDir, { excludePatterns: ['*.log'] });

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toContain('keep.txt');
    });

    it('should handle empty directories', async () => {
      const result = await scanDirectory(testDir);

      expect(result.files).toHaveLength(0);
      expect(result.directories).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle non-existent directories', async () => {
      const result = await scanDirectory(path.join(testDir, 'nonexistent'));

      expect(result.errors).toHaveLength(1);
    });

    it('should return sorted file lists', async () => {
      await fs.writeFile(path.join(testDir, 'z.txt'), 'z');
      await fs.writeFile(path.join(testDir, 'a.txt'), 'a');
      await fs.writeFile(path.join(testDir, 'm.txt'), 'm');

      const result = await scanDirectory(testDir);

      expect(result.files).toHaveLength(3);
      expect(result.files[0]).toContain('a.txt');
      expect(result.files[1]).toContain('m.txt');
      expect(result.files[2]).toContain('z.txt');
    });

    it('should track total size when size filtering', async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'a'.repeat(100));
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'b'.repeat(200));

      const result = await scanDirectory(testDir, { minSize: 1 });

      expect(result.totalSize).toBe(300);
    });
  });

  describe('getFileInfos', () => {
    it('should return file info for all files', async () => {
      const file1 = path.join(testDir, 'file1.txt');
      const file2 = path.join(testDir, 'file2.txt');
      await fs.writeFile(file1, 'content1');
      await fs.writeFile(file2, 'content2');

      const infos = await getFileInfos([file1, file2]);

      expect(infos).toHaveLength(2);
      expect(infos[0].path).toBe(file1);
      expect(infos[0].size).toBe(8);
      expect(infos[0].mtime).toBeInstanceOf(Date);
      expect(infos[0].isSymlink).toBe(false);
    });

    it('should skip files that cannot be stat', async () => {
      const existingFile = path.join(testDir, 'exists.txt');
      await fs.writeFile(existingFile, 'exists');

      const infos = await getFileInfos([
        existingFile,
        path.join(testDir, 'nonexistent.txt')
      ]);

      expect(infos).toHaveLength(1);
      expect(infos[0].path).toBe(existingFile);
    });
  });

  describe('scanWithInfo', () => {
    it('should return both scan result and file infos', async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content2');

      const { result, infos } = await scanWithInfo(testDir);

      expect(result.files).toHaveLength(2);
      expect(infos).toHaveLength(2);
      expect(infos[0].size).toBe(8);
    });
  });
});
