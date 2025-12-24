/**
 * Subtitle Parsing Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { subtitle } from '../../src/services/metadata/index.js';

describe('Subtitle Parsing', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-subtitle-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('extract', () => {
    it('should parse SRT file', async () => {
      const srtContent = `1
00:00:01,000 --> 00:00:04,000
Hello, world!

2
00:00:05,000 --> 00:00:08,000
This is a test subtitle.
`;
      const srtFile = path.join(tempDir, 'test.srt');
      await fs.writeFile(srtFile, srtContent);

      const result = await subtitle.extract(srtFile);

      expect(result).toBeDefined();
      expect(result!.format).toBe('srt');
      expect(result!.cueCount).toBe(2);
      expect(result!.wordCount).toBeGreaterThan(0);
    });

    it('should parse VTT file', async () => {
      const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello, world!

00:00:05.000 --> 00:00:08.000
This is a VTT test.
`;
      const vttFile = path.join(tempDir, 'test.vtt');
      await fs.writeFile(vttFile, vttContent);

      const result = await subtitle.extract(vttFile);

      expect(result).toBeDefined();
      expect(result!.format).toBe('vtt');
      expect(result!.cueCount).toBe(2);
    });

    it('should calculate total duration', async () => {
      const srtContent = `1
00:00:00,000 --> 00:00:10,000
First cue

2
00:01:00,000 --> 00:01:30,000
Last cue
`;
      const srtFile = path.join(tempDir, 'duration.srt');
      await fs.writeFile(srtFile, srtContent);

      const result = await subtitle.extract(srtFile);

      expect(result).toBeDefined();
      expect(result!.totalDuration).toBeGreaterThanOrEqual(90); // At least 1:30
    });

    it('should return undefined for non-existent files', async () => {
      const result = await subtitle.extract('/nonexistent/file.srt');
      expect(result).toBeUndefined();
    });

    it('should return undefined for invalid files', async () => {
      const invalidFile = path.join(tempDir, 'invalid.srt');
      await fs.writeFile(invalidFile, 'not valid subtitle content');

      const result = await subtitle.extract(invalidFile);

      // Should either return undefined or have 0 cues
      if (result) {
        expect(result.cueCount).toBe(0);
      }
    });
  });

  describe('toRawMetadata', () => {
    it('should convert result to prefixed key-value pairs', () => {
      const result: subtitle.SubtitleResult = {
        format: 'srt',
        cueCount: 100,
        totalDuration: 3600,
        textContent: 'Sample text content',
        wordCount: 500,
        charCount: 3000,
        hasStyles: false,
      };

      const metadata = subtitle.toRawMetadata(result);

      expect(metadata['Subtitle_Format']).toBe('SRT');
      expect(metadata['Subtitle_CueCount']).toBe(100);
      expect(metadata['Subtitle_Duration']).toBe(3600);
      expect(metadata['Subtitle_WordCount']).toBe(500);
      expect(metadata['Subtitle_CharCount']).toBe(3000);
      expect(metadata['Subtitle_HasStyles']).toBe(false);
    });

    it('should include text content', () => {
      const result: subtitle.SubtitleResult = {
        format: 'vtt',
        cueCount: 50,
        totalDuration: 5400, // 1h 30m
        textContent: 'Some subtitle text',
        wordCount: 200,
        charCount: 1000,
        hasStyles: true,
      };

      const metadata = subtitle.toRawMetadata(result);

      expect(metadata['Subtitle_Duration']).toBe(5400);
      expect(metadata['Subtitle_HasStyles']).toBe(true);
      expect(metadata['Subtitle_TextContent']).toBeDefined();
    });
  });
});
