/**
 * Metadata Extraction Tests
 *
 * Note: Some tests require external tools (exiftool, ffprobe, mediainfo).
 * Tests will skip gracefully if tools are not available.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { extractMetadata, getAvailableTools, cleanup } from '../../src/services/metadata/index.js';

// Check which tools are available
function checkToolAvailable(tool: string): boolean {
  try {
    execSync(`which ${tool}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasFfprobe = checkToolAvailable('ffprobe');
const hasMediainfo = checkToolAvailable('mediainfo');

describe('Metadata Extraction', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-meta-'));
  });

  afterEach(async () => {
    await cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('getAvailableTools', () => {
    it('should return object with tool availability', async () => {
      const tools = await getAvailableTools();

      expect(tools).toBeDefined();
      expect(typeof tools).toBe('object');
      expect(typeof tools.exiftool).toBe('boolean');
      expect(typeof tools.ffprobe).toBe('boolean');
      expect(typeof tools.mediainfo).toBe('boolean');
    });

    it('should report exiftool as available (bundled)', async () => {
      const tools = await getAvailableTools();
      expect(tools.exiftool).toBe(true);
    });

    it('should correctly detect ffprobe availability', async () => {
      const tools = await getAvailableTools();
      expect(tools.ffprobe).toBe(hasFfprobe);
    });

    it('should correctly detect mediainfo availability', async () => {
      const tools = await getAvailableTools();
      expect(tools.mediainfo).toBe(hasMediainfo);
    });
  });

  describe('extractMetadata', () => {
    it('should return MetadataResult structure', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello, World!');

      const meta = await extractMetadata(testFile);

      expect(meta).toBeDefined();
      expect(meta).toHaveProperty('errors');
      expect(meta).toHaveProperty('sources');
      expect(Array.isArray(meta.errors)).toBe(true);
      expect(Array.isArray(meta.sources)).toBe(true);
    });

    it('should populate photo metadata for images', async () => {
      const testFile = path.join(tempDir, 'test.jpg');
      // Create minimal JPEG header
      const jpegHeader = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9
      ]);
      await fs.writeFile(testFile, jpegHeader);

      const meta = await extractMetadata(testFile);

      // ExifTool should have been used
      expect(meta.sources).toContain('exiftool');
      // Photo metadata may be present (depends on file content)
      expect(meta).toHaveProperty('photo');
    });

    it('should include sources list', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'text content');

      const meta = await extractMetadata(testFile);

      // Sources is always an array
      expect(Array.isArray(meta.sources)).toBe(true);
    });

    it('should handle forceCategory option', async () => {
      const testFile = path.join(tempDir, 'test.dat');
      await fs.writeFile(testFile, 'binary data');

      const meta = await extractMetadata(testFile, { forceCategory: 'document' });

      // Document extractor should have been used
      expect(meta).toHaveProperty('document');
    });

    it('should include device info when requested', async () => {
      const testFile = path.join(tempDir, 'test.jpg');
      const jpegHeader = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9
      ]);
      await fs.writeFile(testFile, jpegHeader);

      const meta = await extractMetadata(testFile, { includeDeviceInfo: true });

      // These fields should exist (may be undefined if no data in file)
      expect(meta).toHaveProperty('cameraSerial');
      expect(meta).toHaveProperty('lensSerial');
    });
  });

  describe('Quick mode', () => {
    it('should skip slow extractors in quick mode', async () => {
      const testFile = path.join(tempDir, 'test.mp4');
      // Create minimal MP4-like file (won't be valid, but tests the routing)
      await fs.writeFile(testFile, Buffer.alloc(1000));

      const meta = await extractMetadata(testFile, {
        quick: true,
        forceCategory: 'video'
      });

      // In quick mode, only exiftool should be used
      // (ffprobe and mediainfo are skipped)
      expect(meta.sources.includes('mediainfo')).toBe(false);
      expect(meta.sources.includes('ffprobe')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should not throw when called', async () => {
      await expect(cleanup()).resolves.not.toThrow();
    });

    it('should be safe to call multiple times', async () => {
      await cleanup();
      await cleanup();
      await expect(cleanup()).resolves.not.toThrow();
    });
  });
});
