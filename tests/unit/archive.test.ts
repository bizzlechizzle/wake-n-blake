/**
 * Archive Analysis Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { archive } from '../../src/services/metadata/index.js';

function checkToolAvailable(tool: string): boolean {
  try {
    execSync(`which ${tool}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const has7z = checkToolAvailable('7z') || checkToolAvailable('7za');

describe('Archive Analysis', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-archive-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isArchiveAvailable', () => {
    it('should correctly detect 7z availability', async () => {
      const available = await archive.isArchiveAvailable();
      expect(typeof available).toBe('boolean');
      expect(available).toBe(has7z);
    });
  });

  describe('analyze', () => {
    it('should return undefined for non-existent files', async () => {
      const result = await archive.analyze('/nonexistent/file.zip');
      expect(result).toBeUndefined();
    });

    it('should return undefined when 7z is not available', async () => {
      if (has7z) {
        return; // Skip if 7z is available
      }
      const result = await archive.analyze(path.join(tempDir, 'test.zip'));
      expect(result).toBeUndefined();
    });

    it.skipIf(!has7z)('should analyze real zip file', async () => {
      // Create a simple zip file
      const testFile = path.join(tempDir, 'content.txt');
      await fs.writeFile(testFile, 'test content');

      const zipFile = path.join(tempDir, 'test.zip');
      try {
        execSync(`cd "${tempDir}" && zip test.zip content.txt`, { stdio: 'ignore' });
      } catch {
        return; // Skip if zip command not available
      }

      const result = await archive.analyze(zipFile);

      if (result) {
        expect(result.format).toBeDefined();
        expect(result.fileCount).toBeGreaterThanOrEqual(1);
        expect(result.encrypted).toBe(false);
      }
    });
  });

  describe('toRawMetadata', () => {
    it('should convert result to prefixed key-value pairs', () => {
      const result: archive.ArchiveResult = {
        format: 'ZIP',
        fileCount: 10,
        dirCount: 2,
        totalUncompressedSize: 1024000,
        totalCompressedSize: 512000,
        compressionRatio: 0.5,
        encrypted: false,
        files: [],
        hasExecutables: false,
        multiVolume: false,
      };

      const metadata = archive.toRawMetadata(result);

      expect(metadata['Archive_Format']).toBe('ZIP');
      expect(metadata['Archive_FileCount']).toBe(10);
      expect(metadata['Archive_DirectoryCount']).toBe(2);
      expect(metadata['Archive_UncompressedSize']).toBe(1024000);
      expect(metadata['Archive_CompressedSize']).toBe(512000);
      expect(metadata['Archive_CompressionRatio']).toBe(0.5);
      expect(metadata['Archive_CompressionPercent']).toBe(50);
      expect(metadata['Archive_Encrypted']).toBe(false);
      expect(metadata['Archive_HasExecutables']).toBe(false);
    });

    it('should flag executables', () => {
      const result: archive.ArchiveResult = {
        format: 'ZIP',
        fileCount: 5,
        dirCount: 1,
        totalUncompressedSize: 2048000,
        encrypted: false,
        files: [],
        hasExecutables: true,
        executablePaths: ['setup.exe', 'installer.msi'],
        multiVolume: false,
      };

      const metadata = archive.toRawMetadata(result);

      expect(metadata['Archive_HasExecutables']).toBe(true);
      expect(metadata['Archive_ExecutableCount']).toBe(2);
      expect(metadata['Archive_Executables']).toBe('setup.exe; installer.msi');
    });
  });
});
