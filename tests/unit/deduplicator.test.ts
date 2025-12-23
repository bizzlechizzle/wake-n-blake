/**
 * Deduplicator unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { findDuplicates, linkDuplicates, deleteDuplicates } from '../../src/services/deduplicator.js';

describe('Deduplicator', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temp test directory
    testDir = path.join(os.tmpdir(), `wnb-dedup-test-${Date.now()}`);
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

  describe('findDuplicates', () => {
    it('should find duplicate files with same content', async () => {
      // Create duplicate files
      const content = 'duplicate content';
      await fs.writeFile(path.join(testDir, 'file1.txt'), content);
      await fs.writeFile(path.join(testDir, 'file2.txt'), content);
      await fs.writeFile(path.join(testDir, 'file3.txt'), content);

      const result = await findDuplicates(testDir);

      expect(result.duplicateGroups).toHaveLength(1);
      expect(result.duplicateGroups[0].files).toHaveLength(3);
      expect(result.duplicateCount).toBe(2); // 3 files - 1 original = 2 duplicates
      expect(result.totalFiles).toBe(3);
      expect(result.uniqueFiles).toBe(1);
    });

    it('should not report unique files as duplicates', async () => {
      await fs.writeFile(path.join(testDir, 'unique1.txt'), 'content1');
      await fs.writeFile(path.join(testDir, 'unique2.txt'), 'content2');
      await fs.writeFile(path.join(testDir, 'unique3.txt'), 'content3');

      const result = await findDuplicates(testDir);

      expect(result.duplicateGroups).toHaveLength(0);
      expect(result.duplicateCount).toBe(0);
      expect(result.uniqueFiles).toBe(3);
    });

    it('should find multiple duplicate groups', async () => {
      await fs.writeFile(path.join(testDir, 'groupA-1.txt'), 'contentA');
      await fs.writeFile(path.join(testDir, 'groupA-2.txt'), 'contentA');
      await fs.writeFile(path.join(testDir, 'groupB-1.txt'), 'contentB');
      await fs.writeFile(path.join(testDir, 'groupB-2.txt'), 'contentB');
      await fs.writeFile(path.join(testDir, 'unique.txt'), 'unique');

      const result = await findDuplicates(testDir);

      expect(result.duplicateGroups).toHaveLength(2);
      expect(result.totalFiles).toBe(5);
      expect(result.uniqueFiles).toBe(3); // 2 groups + 1 unique
      expect(result.duplicateCount).toBe(2); // 1 duplicate per group
    });

    it('should calculate wasted bytes correctly', async () => {
      const content = 'x'.repeat(1000); // 1000 bytes
      await fs.writeFile(path.join(testDir, 'file1.txt'), content);
      await fs.writeFile(path.join(testDir, 'file2.txt'), content);
      await fs.writeFile(path.join(testDir, 'file3.txt'), content);

      const result = await findDuplicates(testDir);

      expect(result.wastedBytes).toBe(2000); // (3-1) * 1000
    });

    it('should filter by minimum size', async () => {
      await fs.writeFile(path.join(testDir, 'small1.txt'), 'a');
      await fs.writeFile(path.join(testDir, 'small2.txt'), 'a');
      await fs.writeFile(path.join(testDir, 'large1.txt'), 'b'.repeat(100));
      await fs.writeFile(path.join(testDir, 'large2.txt'), 'b'.repeat(100));

      const result = await findDuplicates(testDir, { minSize: 50 });

      expect(result.duplicateGroups).toHaveLength(1);
      expect(result.duplicateGroups[0].size).toBe(100);
    });

    it('should work with subdirectories when recursive', async () => {
      const subDir = path.join(testDir, 'subdir');
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(testDir, 'root.txt'), 'same');
      await fs.writeFile(path.join(subDir, 'nested.txt'), 'same');

      const result = await findDuplicates(testDir, { recursive: true });

      expect(result.duplicateGroups).toHaveLength(1);
      expect(result.duplicateGroups[0].files).toHaveLength(2);
    });

    it('should not find duplicates in subdirectories when not recursive', async () => {
      const subDir = path.join(testDir, 'subdir');
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(testDir, 'root.txt'), 'same');
      await fs.writeFile(path.join(subDir, 'nested.txt'), 'same');

      const result = await findDuplicates(testDir, { recursive: false });

      expect(result.duplicateGroups).toHaveLength(0);
      expect(result.totalFiles).toBe(1);
    });

    it('should handle empty directories', async () => {
      const result = await findDuplicates(testDir);

      expect(result.totalFiles).toBe(0);
      expect(result.duplicateGroups).toHaveLength(0);
      expect(result.wastedBytes).toBe(0);
    });

    it('should sort duplicate groups by wasted space', async () => {
      // Large duplicate group
      await fs.writeFile(path.join(testDir, 'large1.txt'), 'x'.repeat(1000));
      await fs.writeFile(path.join(testDir, 'large2.txt'), 'x'.repeat(1000));

      // Small duplicate group
      await fs.writeFile(path.join(testDir, 'small1.txt'), 'y');
      await fs.writeFile(path.join(testDir, 'small2.txt'), 'y');

      const result = await findDuplicates(testDir);

      expect(result.duplicateGroups).toHaveLength(2);
      expect(result.duplicateGroups[0].size).toBe(1000); // Large first
      expect(result.duplicateGroups[1].size).toBe(1); // Small second
    });

    it('should track duration', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), 'content');

      const result = await findDuplicates(testDir);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should call progress callback', async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content2');

      const progressCalls: Array<{ current: number; total: number }> = [];
      await findDuplicates(testDir, {
        onProgress: (current, total) => {
          progressCalls.push({ current, total });
        }
      });

      expect(progressCalls.length).toBe(2);
      expect(progressCalls[0]).toEqual({ current: 1, total: 2 });
      expect(progressCalls[1]).toEqual({ current: 2, total: 2 });
    });
  });

  describe('linkDuplicates', () => {
    it('should report what would be linked in dry run', async () => {
      const duplicateGroups = [{
        hash: 'abc123',
        size: 100,
        files: [
          path.join(testDir, 'original.txt'),
          path.join(testDir, 'dup1.txt'),
          path.join(testDir, 'dup2.txt')
        ]
      }];

      const result = await linkDuplicates(duplicateGroups, true);

      expect(result.linked).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should actually link files when not dry run', async () => {
      // Create files
      const content = 'duplicate content';
      const original = path.join(testDir, 'original.txt');
      const dup1 = path.join(testDir, 'dup1.txt');

      await fs.writeFile(original, content);
      await fs.writeFile(dup1, content);

      const duplicateGroups = [{
        hash: 'abc123',
        size: content.length,
        files: [original, dup1]
      }];

      const result = await linkDuplicates(duplicateGroups, false);

      expect(result.linked).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Verify they're now hardlinked (same inode)
      const stat1 = await fs.stat(original);
      const stat2 = await fs.stat(dup1);
      expect(stat1.ino).toBe(stat2.ino);
    });
  });

  describe('deleteDuplicates', () => {
    it('should report what would be deleted in dry run', async () => {
      const duplicateGroups = [{
        hash: 'abc123',
        size: 100,
        files: [
          path.join(testDir, 'original.txt'),
          path.join(testDir, 'dup1.txt'),
          path.join(testDir, 'dup2.txt')
        ]
      }];

      const result = await deleteDuplicates(duplicateGroups, true);

      expect(result.deleted).toBe(2);
      expect(result.freedBytes).toBe(200); // 2 files * 100 bytes
      expect(result.errors).toHaveLength(0);
    });

    it('should actually delete files when not dry run', async () => {
      const content = 'duplicate content';
      const original = path.join(testDir, 'original.txt');
      const dup1 = path.join(testDir, 'dup1.txt');

      await fs.writeFile(original, content);
      await fs.writeFile(dup1, content);

      const duplicateGroups = [{
        hash: 'abc123',
        size: content.length,
        files: [original, dup1]
      }];

      const result = await deleteDuplicates(duplicateGroups, false);

      expect(result.deleted).toBe(1);
      expect(result.freedBytes).toBe(content.length);

      // Verify original still exists, duplicate is gone
      await expect(fs.access(original)).resolves.toBeUndefined();
      await expect(fs.access(dup1)).rejects.toThrow();
    });

    it('should handle errors gracefully', async () => {
      const duplicateGroups = [{
        hash: 'abc123',
        size: 100,
        files: [
          path.join(testDir, 'original.txt'),
          path.join(testDir, 'nonexistent.txt') // This doesn't exist
        ]
      }];

      await fs.writeFile(path.join(testDir, 'original.txt'), 'content');

      const result = await deleteDuplicates(duplicateGroups, false);

      expect(result.errors).toHaveLength(1);
    });
  });
});
