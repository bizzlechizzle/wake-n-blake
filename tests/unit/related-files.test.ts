/**
 * Related Files Detector Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  findRelatedFiles,
  isPrimaryFile,
  shouldHideFile,
  findGroupForFile,
  getPrimaryFile
} from '../../src/services/related-files/index.js';

describe('Related Files Detector', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-related-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('findRelatedFiles', () => {
    it('should return empty array for empty input', async () => {
      const groups = await findRelatedFiles([]);
      expect(groups).toEqual([]);
    });

    it('should detect RAW+JPEG pairs', async () => {
      const files = [
        path.join(tempDir, 'IMG_001.CR2'),
        path.join(tempDir, 'IMG_001.JPG'),
        path.join(tempDir, 'IMG_002.CR2'),
        path.join(tempDir, 'IMG_002.JPG')
      ];

      // Create dummy files
      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);

      expect(groups.length).toBeGreaterThanOrEqual(2);

      const rawJpegGroups = groups.filter(g => g.type === 'raw_jpeg_pair');
      expect(rawJpegGroups.length).toBe(2);
    });

    it('should detect Live Photo pairs (HEIC+MOV)', async () => {
      const files = [
        path.join(tempDir, 'IMG_1234.HEIC'),
        path.join(tempDir, 'IMG_1234.MOV')
      ];

      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);

      const livePhotoGroups = groups.filter(g => g.type === 'live_photo');
      expect(livePhotoGroups.length).toBe(1);
      expect(livePhotoGroups[0].allFiles).toHaveLength(2);
    });

    it('should detect Live Photo pairs (JPG+MOV)', async () => {
      const files = [
        path.join(tempDir, 'IMG_5678.JPG'),
        path.join(tempDir, 'IMG_5678.MOV')
      ];

      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);

      const livePhotoGroups = groups.filter(g => g.type === 'live_photo');
      expect(livePhotoGroups.length).toBe(1);
    });

    it('should handle standalone files', async () => {
      const files = [
        path.join(tempDir, 'photo1.jpg'),
        path.join(tempDir, 'photo2.jpg'),
        path.join(tempDir, 'document.pdf')
      ];

      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);

      // Standalone files shouldn't form groups
      expect(groups.every(g => g.allFiles.length >= 2)).toBe(true);
    });

    it('should detect XMP sidecar relationships', async () => {
      const files = [
        path.join(tempDir, 'photo.CR2'),
        path.join(tempDir, 'photo.CR2.xmp'),
        path.join(tempDir, 'photo.xmp')
      ];

      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);

      const sidecarGroups = groups.filter(g => g.type === 'raw_sidecar');
      expect(sidecarGroups.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle case-insensitive matching', async () => {
      const files = [
        path.join(tempDir, 'img_001.cr2'),
        path.join(tempDir, 'IMG_001.jpg')
      ];

      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);

      const rawJpegGroups = groups.filter(g => g.type === 'raw_jpeg_pair');
      expect(rawJpegGroups.length).toBe(1);
    });

    it('should detect multiple RAW formats', async () => {
      const files = [
        path.join(tempDir, 'canon.CR2'),
        path.join(tempDir, 'canon.JPG'),
        path.join(tempDir, 'nikon.NEF'),
        path.join(tempDir, 'nikon.JPG'),
        path.join(tempDir, 'sony.ARW'),
        path.join(tempDir, 'sony.JPG')
      ];

      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);

      const rawJpegGroups = groups.filter(g => g.type === 'raw_jpeg_pair');
      expect(rawJpegGroups.length).toBe(3);
    });
  });

  describe('isPrimaryFile', () => {
    it('should identify RAW as primary over JPEG', async () => {
      const files = [
        path.join(tempDir, 'IMG_001.CR2'),
        path.join(tempDir, 'IMG_001.JPG')
      ];

      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);

      expect(isPrimaryFile(files[0], groups)).toBe(true);  // CR2 is primary
      expect(isPrimaryFile(files[1], groups)).toBe(false); // JPG is not primary
    });

    it('should identify HEIC as primary in Live Photo', async () => {
      const files = [
        path.join(tempDir, 'IMG_001.HEIC'),
        path.join(tempDir, 'IMG_001.MOV')
      ];

      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);

      expect(isPrimaryFile(files[0], groups)).toBe(true);  // HEIC is primary
      expect(isPrimaryFile(files[1], groups)).toBe(false); // MOV is not primary
    });

    it('should return true for standalone files', async () => {
      const files = [path.join(tempDir, 'standalone.jpg')];
      await fs.writeFile(files[0], 'dummy');

      const groups = await findRelatedFiles(files);

      expect(isPrimaryFile(files[0], groups)).toBe(true);
    });
  });

  describe('shouldHideFile', () => {
    it('should hide Live Photo video component', async () => {
      const files = [
        path.join(tempDir, 'IMG_001.HEIC'),
        path.join(tempDir, 'IMG_001.MOV')
      ];

      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);

      expect(shouldHideFile(files[0], groups)).toBe(false); // HEIC shown
      expect(shouldHideFile(files[1], groups)).toBe(true);  // MOV hidden
    });

    it('should not hide JPEG in RAW+JPEG pairs', async () => {
      const files = [
        path.join(tempDir, 'IMG_001.CR2'),
        path.join(tempDir, 'IMG_001.JPG')
      ];

      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);

      // RAW+JPEG pairs show both files (user may want to use either)
      expect(shouldHideFile(files[0], groups)).toBe(false); // RAW shown
      expect(shouldHideFile(files[1], groups)).toBe(false); // JPEG also shown
    });

    it('should not hide standalone files', async () => {
      const files = [path.join(tempDir, 'standalone.jpg')];
      await fs.writeFile(files[0], 'dummy');

      const groups = await findRelatedFiles(files);

      expect(shouldHideFile(files[0], groups)).toBe(false);
    });
  });

  describe('findGroupForFile', () => {
    it('should find the group containing a file', async () => {
      const files = [
        path.join(tempDir, 'IMG_001.CR2'),
        path.join(tempDir, 'IMG_001.JPG')
      ];

      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);
      const group = findGroupForFile(files[0], groups);

      expect(group).toBeDefined();
      expect(group?.allFiles).toContain(files[0]);
      expect(group?.allFiles).toContain(files[1]);
    });

    it('should return undefined for file not in any group', async () => {
      const files = [path.join(tempDir, 'standalone.jpg')];
      await fs.writeFile(files[0], 'dummy');

      const groups = await findRelatedFiles(files);
      const group = findGroupForFile(files[0], groups);

      expect(group).toBeUndefined();
    });
  });

  describe('getPrimaryFile', () => {
    it('should return primary file for grouped file', async () => {
      const files = [
        path.join(tempDir, 'IMG_001.CR2'),
        path.join(tempDir, 'IMG_001.JPG')
      ];

      for (const f of files) {
        await fs.writeFile(f, 'dummy');
      }

      const groups = await findRelatedFiles(files);

      // Both should return the RAW as primary
      expect(getPrimaryFile(files[0], groups)).toBe(files[0]);
      expect(getPrimaryFile(files[1], groups)).toBe(files[0]);
    });

    it('should return same file for standalone', async () => {
      const file = path.join(tempDir, 'standalone.jpg');
      await fs.writeFile(file, 'dummy');

      const groups = await findRelatedFiles([file]);

      expect(getPrimaryFile(file, groups)).toBe(file);
    });
  });
});
