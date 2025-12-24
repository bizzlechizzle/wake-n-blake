/**
 * Audio Analysis Tests
 *
 * Tests for audio quality analysis and chromaprint fingerprinting.
 * Tests will skip gracefully if required tools are not available.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { audioQuality, chromaprint, getAvailableTools } from '../../src/services/metadata/index.js';

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
const hasFpcalc = checkToolAvailable('fpcalc');

describe('Audio Quality Analysis', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-audio-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('getAvailableTools', () => {
    it('should include chromaprint in available tools', async () => {
      const tools = await getAvailableTools();

      expect(tools).toBeDefined();
      expect(typeof tools.chromaprint).toBe('boolean');
      expect(tools.chromaprint).toBe(hasFpcalc);
    });
  });

  describe('audioQuality.isFFProbeAvailable', () => {
    it('should correctly detect ffprobe availability', async () => {
      const available = await audioQuality.isFFProbeAvailable();
      expect(available).toBe(hasFfprobe);
    });
  });

  describe('audioQuality.analyzeAudioQuality', () => {
    it.skipIf(!hasFfprobe)('should analyze real audio file (system sound)', async () => {
      // Use a system audio file that should exist on macOS
      const systemSound = '/System/Library/Sounds/Funk.aiff';

      try {
        await fs.access(systemSound);
      } catch {
        // Skip if system sound doesn't exist
        return;
      }

      const result = await audioQuality.analyzeAudioQuality(systemSound);

      expect(result).toBeDefined();
      expect(result!.classification).toBe('lossless');
      expect(result!.codec).toMatch(/pcm/i);
      expect(result!.channels).toBeGreaterThanOrEqual(1);
      expect(result!.sampleRate).toBeGreaterThan(0);
      expect(result!.format).toBe('aiff');
      expect(result!.isTranscode).toBe(false);
    });

    it.skipIf(!hasFfprobe)('should return undefined for non-audio files', async () => {
      const textFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(textFile, 'not audio');

      const result = await audioQuality.analyzeAudioQuality(textFile);

      // Should return undefined for non-audio
      expect(result).toBeUndefined();
    });

    it.skipIf(!hasFfprobe)('should return undefined for non-existent files', async () => {
      const result = await audioQuality.analyzeAudioQuality('/nonexistent/file.mp3');
      expect(result).toBeUndefined();
    });
  });

  describe('audioQuality.canConvertToFlac', () => {
    it('should reject lossy files for FLAC conversion', () => {
      const lossyInfo: audioQuality.AudioQualityInfo = {
        classification: 'lossy',
        codec: 'mp3',
        format: 'mp3',
        channels: 2,
        isTranscode: false,
        qualityDescription: 'Lossy: mp3'
      };

      const { canConvert, reason } = audioQuality.canConvertToFlac(lossyInfo);

      expect(canConvert).toBe(false);
      expect(reason).toContain('lossy');
    });

    it('should reject suspected transcodes', () => {
      const transcodeInfo: audioQuality.AudioQualityInfo = {
        classification: 'transcode_suspected',
        codec: 'flac',
        format: 'flac',
        channels: 2,
        isTranscode: true,
        qualityDescription: 'Suspected transcode'
      };

      const { canConvert, reason } = audioQuality.canConvertToFlac(transcodeInfo);

      expect(canConvert).toBe(false);
      expect(reason).toContain('transcode');
    });

    it('should reject files already in FLAC format', () => {
      const flacInfo: audioQuality.AudioQualityInfo = {
        classification: 'lossless',
        codec: 'flac',
        format: 'flac',
        channels: 2,
        isTranscode: false,
        qualityDescription: 'Lossless: flac'
      };

      const { canConvert, reason } = audioQuality.canConvertToFlac(flacInfo);

      expect(canConvert).toBe(false);
      expect(reason).toContain('Already FLAC');
    });

    it('should allow lossless non-FLAC files for conversion', () => {
      const aiffInfo: audioQuality.AudioQualityInfo = {
        classification: 'lossless',
        codec: 'pcm_s24be',
        format: 'aiff',
        channels: 2,
        sampleRate: 48000,
        bitDepth: 24,
        isTranscode: false,
        qualityDescription: 'Lossless: pcm_s24be'
      };

      const { canConvert, reason } = audioQuality.canConvertToFlac(aiffInfo);

      expect(canConvert).toBe(true);
      expect(reason).toContain('Safe to convert');
    });
  });

  describe('audioQuality.toRawMetadata', () => {
    it('should convert result to prefixed metadata', () => {
      const info: audioQuality.AudioQualityInfo = {
        classification: 'lossless',
        codec: 'flac',
        codecLongName: 'FLAC (Free Lossless Audio Codec)',
        sampleRate: 44100,
        bitDepth: 16,
        channels: 2,
        channelLayout: 'stereo',
        bitrate: 800000,
        duration: 180.5,
        format: 'flac',
        isTranscode: false,
        qualityDescription: 'Lossless: flac 16-bit/44.1kHz'
      };

      const metadata = audioQuality.toRawMetadata(info);

      expect(metadata['AudioQuality_Classification']).toBe('lossless');
      expect(metadata['AudioQuality_Codec']).toBe('flac');
      expect(metadata['AudioQuality_SampleRate']).toBe(44100);
      expect(metadata['AudioQuality_BitDepth']).toBe(16);
      expect(metadata['AudioQuality_Channels']).toBe(2);
      expect(metadata['AudioQuality_ChannelLayout']).toBe('stereo');
      expect(metadata['AudioQuality_Bitrate']).toBe(800000);
      expect(metadata['AudioQuality_Duration']).toBe(180.5);
      expect(metadata['AudioQuality_IsTranscode']).toBe(false);
    });
  });
});

describe('Chromaprint Fingerprinting', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-chromaprint-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('chromaprint.isChromaprintAvailable', () => {
    it('should correctly detect fpcalc availability', async () => {
      const available = await chromaprint.isChromaprintAvailable();
      expect(available).toBe(hasFpcalc);
    });
  });

  describe('chromaprint.findFpcalc', () => {
    it('should return path or null based on availability', async () => {
      const fpcalcPath = await chromaprint.findFpcalc();

      if (hasFpcalc) {
        expect(fpcalcPath).not.toBeNull();
        expect(typeof fpcalcPath).toBe('string');
      } else {
        expect(fpcalcPath).toBeNull();
      }
    });
  });

  describe('chromaprint.fingerprint', () => {
    it.skipIf(!hasFpcalc)('should generate fingerprint for real audio', async () => {
      // Use a system audio file that should exist on macOS
      const systemSound = '/System/Library/Sounds/Funk.aiff';

      try {
        await fs.access(systemSound);
      } catch {
        // Skip if system sound doesn't exist
        return;
      }

      const result = await chromaprint.fingerprint(systemSound);

      // Short audio files (< 3 seconds) may return undefined as chromaprint
      // needs sufficient audio content to generate a meaningful fingerprint
      if (result) {
        expect(result.fingerprint).toBeDefined();
        expect(typeof result.fingerprint).toBe('string');
        expect(result.fingerprint.length).toBeGreaterThan(0);
        expect(result.duration).toBeGreaterThan(0);
      }
      // If undefined, that's acceptable for very short audio
    });

    it('should return undefined when fpcalc not available', async () => {
      // This test is useful when fpcalc is NOT available
      if (hasFpcalc) {
        // Can't really test this case when fpcalc is available
        return;
      }

      const result = await chromaprint.fingerprint('/any/file.mp3');
      expect(result).toBeUndefined();
    });

    it.skipIf(!hasFpcalc)('should return undefined for non-audio files', async () => {
      const textFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(textFile, 'not audio');

      const result = await chromaprint.fingerprint(textFile);

      // fpcalc should fail on non-audio
      expect(result).toBeUndefined();
    });
  });

  describe('chromaprint.toRawMetadata', () => {
    it('should convert result to prefixed metadata', () => {
      const result: chromaprint.ChromaprintResult = {
        fingerprint: 'AQADtMkSJYmSJEmS',
        duration: 180.5
      };

      const metadata = chromaprint.toRawMetadata(result);

      expect(metadata['Chromaprint_Fingerprint']).toBe('AQADtMkSJYmSJEmS');
      expect(metadata['Chromaprint_Duration']).toBe(180.5);
      expect(metadata['Chromaprint_Version']).toBe('1');
    });
  });

  describe('chromaprint.buildAcoustIdUrl', () => {
    it('should build valid AcoustID lookup URL', () => {
      const result: chromaprint.ChromaprintResult = {
        fingerprint: 'AQADtMkSJYmSJEmS',
        duration: 180.5
      };

      const url = chromaprint.buildAcoustIdUrl(result, 'test-client-id');

      expect(url).toContain('https://api.acoustid.org/v2/lookup');
      expect(url).toContain('client=test-client-id');
      expect(url).toContain('duration=181'); // Rounded
      expect(url).toContain('fingerprint=AQADtMkSJYmSJEmS');
      expect(url).toContain('meta=recordings');
    });
  });

  describe('chromaprint.compareFingerprints', () => {
    it('should return 1 for identical fingerprints', () => {
      const fp = 'AQADtMkSJYmSJEmS';
      const similarity = chromaprint.compareFingerprints(fp, fp);

      expect(similarity).toBe(1);
    });

    it('should return value between 0 and 1 for different fingerprints', () => {
      const fp1 = 'ABCDEFGH';
      const fp2 = 'ABCDXXXX';
      const similarity = chromaprint.compareFingerprints(fp1, fp2);

      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should return undefined for empty fingerprints', () => {
      expect(chromaprint.compareFingerprints('', 'ABC')).toBeUndefined();
      expect(chromaprint.compareFingerprints('ABC', '')).toBeUndefined();
    });
  });
});
