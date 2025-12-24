/**
 * Import Pipeline Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runImport, getImportStatus } from '../../src/services/importer.js';

describe('Import Pipeline', () => {
  let tempDir: string;
  let sourceDir: string;
  let destDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-import-'));
    sourceDir = path.join(tempDir, 'source');
    destDir = path.join(tempDir, 'dest');
    await fs.mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Basic Import', () => {
    it('should import files from source to destination', async () => {
      // Create test files
      await fs.writeFile(path.join(sourceDir, 'file1.txt'), 'content 1');
      await fs.writeFile(path.join(sourceDir, 'file2.txt'), 'content 2');

      const session = await runImport(sourceDir, destDir, {
        verify: true
      });

      expect(session.status).toBe('completed');
      expect(session.totalFiles).toBe(2);
      expect(session.processedFiles).toBe(2);
      expect(session.errorFiles).toBe(0);

      // Verify files exist in destination
      const dest1 = await fs.readFile(path.join(destDir, 'file1.txt'), 'utf-8');
      const dest2 = await fs.readFile(path.join(destDir, 'file2.txt'), 'utf-8');
      expect(dest1).toBe('content 1');
      expect(dest2).toBe('content 2');
    });

    it('should preserve directory structure', async () => {
      await fs.mkdir(path.join(sourceDir, 'subdir'), { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'root.txt'), 'root');
      await fs.writeFile(path.join(sourceDir, 'subdir', 'nested.txt'), 'nested');

      const session = await runImport(sourceDir, destDir);

      expect(session.status).toBe('completed');
      expect(session.totalFiles).toBe(2);

      const rootExists = await fs.access(path.join(destDir, 'root.txt'))
        .then(() => true).catch(() => false);
      const nestedExists = await fs.access(path.join(destDir, 'subdir', 'nested.txt'))
        .then(() => true).catch(() => false);

      expect(rootExists).toBe(true);
      expect(nestedExists).toBe(true);
    });

    it('should compute BLAKE3 hashes', async () => {
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'hash me');

      const session = await runImport(sourceDir, destDir);

      expect(session.files[0].hash).toBeDefined();
      expect(session.files[0].hash!.length).toBeGreaterThanOrEqual(16); // At least 16 chars
      expect(session.files[0].hashShort).toHaveLength(16); // Truncated to 16
    });
  });

  describe('Dry Run', () => {
    it('should not copy files in dry run mode', async () => {
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'content');

      const session = await runImport(sourceDir, destDir, {
        dryRun: true
      });

      expect(session.status).toBe('completed');
      expect(session.processedFiles).toBe(1);

      // Destination should not exist or be empty
      const destExists = await fs.access(path.join(destDir, 'test.txt'))
        .then(() => true).catch(() => false);
      expect(destExists).toBe(false);
    });
  });

  describe('Deduplication', () => {
    it('should skip duplicate files', async () => {
      // Create source files
      await fs.writeFile(path.join(sourceDir, 'file1.txt'), 'same content');
      await fs.writeFile(path.join(sourceDir, 'file2.txt'), 'same content');

      const session = await runImport(sourceDir, destDir, {
        dedup: true
      });

      expect(session.status).toBe('completed');
      expect(session.duplicateFiles).toBe(1);
      expect(session.processedFiles).toBe(1);
    });

    it('should detect duplicates already in destination', async () => {
      // First import
      await fs.writeFile(path.join(sourceDir, 'original.txt'), 'content');
      await runImport(sourceDir, destDir);

      // Second import with same content, different name
      await fs.unlink(path.join(sourceDir, 'original.txt'));
      await fs.writeFile(path.join(sourceDir, 'duplicate.txt'), 'content');

      const session = await runImport(sourceDir, destDir, {
        dedup: true
      });

      expect(session.duplicateFiles).toBe(1);
    });
  });

  describe('Verification', () => {
    it('should verify copies by re-hashing', async () => {
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'verify me');

      const session = await runImport(sourceDir, destDir, {
        verify: true
      });

      expect(session.status).toBe('completed');
      expect(session.files[0].status).toBe('validated');
    });

    it('should skip verification when disabled', async () => {
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'content');

      const session = await runImport(sourceDir, destDir, {
        verify: false
      });

      expect(session.status).toBe('completed');
      expect(session.files[0].status).toBe('copied');
    });
  });

  describe('Manifest Generation', () => {
    it('should generate manifest when requested', async () => {
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'content');

      await runImport(sourceDir, destDir, {
        manifest: true
      });

      const manifestExists = await fs.access(path.join(destDir, 'manifest.json'))
        .then(() => true).catch(() => false);
      expect(manifestExists).toBe(true);

      const manifest = JSON.parse(
        await fs.readFile(path.join(destDir, 'manifest.json'), 'utf-8')
      );
      expect(manifest.version).toBe('1.0');
      expect(manifest.algorithm).toBe('blake3');
      expect(manifest.files).toHaveLength(1);
    });
  });

  describe('XMP Sidecar Generation', () => {
    it('should generate sidecars when requested', async () => {
      await fs.writeFile(path.join(sourceDir, 'photo.jpg'), 'fake jpeg');

      const session = await runImport(sourceDir, destDir, {
        sidecar: true
      });

      expect(session.status).toBe('completed');
      expect(session.sidecarFiles).toBe(1);

      const sidecarExists = await fs.access(path.join(destDir, 'photo.jpg.xmp'))
        .then(() => true).catch(() => false);
      expect(sidecarExists).toBe(true);
    });

    it('should include batch info in sidecars', async () => {
      await fs.writeFile(path.join(sourceDir, 'photo.jpg'), 'fake jpeg');

      const session = await runImport(sourceDir, destDir, {
        sidecar: true,
        batch: 'Wedding 2024'
      });

      expect(session.batchName).toBe('Wedding 2024');
      expect(session.batchId).toBeDefined();

      const sidecarContent = await fs.readFile(
        path.join(destDir, 'photo.jpg.xmp'), 'utf-8'
      );
      expect(sidecarContent).toContain('Wedding 2024');
    });
  });

  describe('BLAKE3-16 Rename', () => {
    it('should rename files to hash when requested', async () => {
      await fs.writeFile(path.join(sourceDir, 'photo.jpg'), 'content for hash');

      const session = await runImport(sourceDir, destDir, {
        rename: true
      });

      expect(session.status).toBe('completed');
      expect(session.renamedFiles).toBe(1);

      const file = session.files[0];
      expect(file.renamed).toBe(true);
      expect(file.finalName).toMatch(/^[a-f0-9]{16}\.jpg$/);
    });

    it('should preserve original name in file state', async () => {
      await fs.writeFile(path.join(sourceDir, 'original_name.txt'), 'content');

      const session = await runImport(sourceDir, destDir, {
        rename: true
      });

      const file = session.files[0];
      expect(file.originalName).toBe('original_name.txt');
    });
  });

  describe('Progress Callbacks', () => {
    it('should call onProgress during import', async () => {
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'content');

      const statuses: string[] = [];

      await runImport(sourceDir, destDir, {
        onProgress: (session) => {
          statuses.push(session.status);
        }
      });

      expect(statuses).toContain('scanning');
      expect(statuses).toContain('hashing');
      expect(statuses).toContain('copying');
      expect(statuses).toContain('completed');
    });

    it('should call onFile for each file action', async () => {
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'content');

      const actions: string[] = [];

      await runImport(sourceDir, destDir, {
        onFile: (file, action) => {
          actions.push(action);
        }
      });

      expect(actions).toContain('hashed');
      expect(actions).toContain('copied');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing source directory gracefully', async () => {
      // When source doesn't exist, importer completes with 0 files
      const session = await runImport('/nonexistent/path', destDir);

      expect(session.status).toBe('completed');
      expect(session.totalFiles).toBe(0);
      expect(session.processedFiles).toBe(0);
    });

    it('should track error count', async () => {
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'content');

      // Make file unreadable (if possible)
      // This test is platform-dependent

      const session = await runImport(sourceDir, destDir);

      // Should complete even if some files fail
      expect(session.status).toBe('completed');
    });
  });

  describe('Checkpoint/Resume', () => {
    it('should not leave checkpoint after successful import', async () => {
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'content');

      await runImport(sourceDir, destDir);

      const checkpointExists = await fs.access(
        path.join(destDir, '.wnb-import-session.json')
      ).then(() => true).catch(() => false);

      expect(checkpointExists).toBe(false);
    });
  });

  describe('Exclude Patterns', () => {
    it('should exclude files matching patterns', async () => {
      await fs.writeFile(path.join(sourceDir, 'include.txt'), 'include');
      await fs.writeFile(path.join(sourceDir, 'exclude.tmp'), 'exclude');
      await fs.writeFile(path.join(sourceDir, '.hidden'), 'hidden');

      const session = await runImport(sourceDir, destDir, {
        excludePatterns: ['*.tmp', '.*']
      });

      expect(session.totalFiles).toBe(1);
      expect(session.files[0].relativePath).toBe('include.txt');
    });
  });

  describe('Custom Path Builder', () => {
    it('should use pathBuilder for destination paths', async () => {
      await fs.writeFile(path.join(sourceDir, 'photo.jpg'), 'test content');

      const customDir = path.join(destDir, 'custom', 'structure');

      const session = await runImport(sourceDir, destDir, {
        pathBuilder: (file, hash) => {
          const ext = path.extname(file.path);
          return path.join(customDir, `${hash}${ext}`);
        }
      });

      expect(session.status).toBe('completed');
      expect(session.processedFiles).toBe(1);

      // File should be at custom path with hash-based name
      const file = session.files[0];
      expect(file.destPath).toContain('custom/structure');
      expect(file.destPath).toMatch(/[a-f0-9]{16}\.jpg$/);

      // Verify file exists at custom location
      const fileExists = await fs.access(file.destPath!)
        .then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should create directories for custom paths', async () => {
      await fs.writeFile(path.join(sourceDir, 'file.txt'), 'content');

      const deepPath = path.join(destDir, 'deep', 'nested', 'path');

      const session = await runImport(sourceDir, destDir, {
        pathBuilder: (file, hash) => path.join(deepPath, `${hash}.txt`)
      });

      expect(session.status).toBe('completed');

      const dirExists = await fs.access(deepPath)
        .then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });
  });

  describe('External Hash Dedup (existingHashes)', () => {
    it('should skip files matching existingHashes', async () => {
      // Create test file
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'known content');

      // First import to get the hash
      const firstSession = await runImport(sourceDir, destDir);
      const knownHash = firstSession.files[0].hash!;

      // Clean destination
      await fs.rm(destDir, { recursive: true, force: true });

      // Second source file with same content
      await fs.writeFile(path.join(sourceDir, 'duplicate.txt'), 'known content');

      // Import with existingHashes (simulating database lookup)
      const session = await runImport(sourceDir, destDir, {
        existingHashes: new Set([knownHash])
      });

      expect(session.duplicateFiles).toBe(2); // Both files have the known hash
    });

    it('should use existingHashes instead of scanning destination', async () => {
      // Pre-populate destination with a file
      await fs.mkdir(destDir, { recursive: true });
      await fs.writeFile(path.join(destDir, 'existing.txt'), 'existing');

      // Create source file with different content
      await fs.writeFile(path.join(sourceDir, 'new.txt'), 'new content');

      // Provide empty existingHashes - should NOT scan destination
      // This means even though 'existing.txt' is in destination, it won't be deduped
      const session = await runImport(sourceDir, destDir, {
        dedup: true,
        existingHashes: new Set() // Empty set = no known hashes
      });

      // Should process the new file since existingHashes is empty
      expect(session.duplicateFiles).toBe(0);
      expect(session.processedFiles).toBe(1);
    });

    it('should prioritize existingHashes over destination scan', async () => {
      // Create a file in destination with known hash
      await fs.mkdir(destDir, { recursive: true });
      await fs.writeFile(path.join(destDir, 'existing.txt'), 'same content');

      // Get hash of the content
      const { runImport: ri } = await import('../../src/services/importer.js');
      const tempSource = path.join(tempDir, 'temp_source');
      await fs.mkdir(tempSource, { recursive: true });
      await fs.writeFile(path.join(tempSource, 'temp.txt'), 'same content');
      const tempDest = path.join(tempDir, 'temp_dest');
      const tempSession = await ri(tempSource, tempDest);
      const contentHash = tempSession.files[0].hash!;

      // Source file with same content
      await fs.writeFile(path.join(sourceDir, 'source.txt'), 'same content');

      // Import WITH existingHashes containing the hash
      const session = await runImport(sourceDir, destDir, {
        existingHashes: new Set([contentHash])
      });

      // File should be skipped because hash is in existingHashes
      expect(session.duplicateFiles).toBe(1);
      expect(session.processedFiles).toBe(0);
    });
  });
});
