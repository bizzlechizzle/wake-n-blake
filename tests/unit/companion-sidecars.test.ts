/**
 * Tests for companion sidecar detection and parsing
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  findCompanionSidecars,
  shouldEmbedContent,
  exiftool,
} from '../../src/services/metadata/index.js';
import { isSidecarFile, isHiddenFile } from '../../src/services/file-type/detector.js';

describe('Companion Sidecars', () => {
  let testDir: string;

  beforeAll(async () => {
    // Create temp directory for tests
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-sidecar-test-'));
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
    await exiftool.closeExifTool();
  });

  describe('isSidecarFile', () => {
    it('should recognize all sidecar extensions', () => {
      const sidecarExtensions = [
        '.xmp', '.thm', '.srt', '.vtt', '.lrf', '.lrv',
        '.aae', '.moi', '.cpi', '.bdm', '.mpl',
        '.rmd', '.ale', '.sidecar', '.nksc', '.gpr',
      ];

      for (const ext of sidecarExtensions) {
        expect(isSidecarFile(`/path/to/file${ext}`)).toBe(true);
        expect(isSidecarFile(`/path/to/file${ext.toUpperCase()}`)).toBe(true);
      }
    });

    it('should not recognize non-sidecar extensions', () => {
      expect(isSidecarFile('/path/to/file.mp4')).toBe(false);
      expect(isSidecarFile('/path/to/file.jpg')).toBe(false);
      expect(isSidecarFile('/path/to/file.mov')).toBe(false);
    });
  });

  describe('isHiddenFile', () => {
    it('should hide proxy and thumbnail sidecars', () => {
      expect(isHiddenFile('/path/to/file.lrf')).toBe(true);
      expect(isHiddenFile('/path/to/file.lrv')).toBe(true);
      expect(isHiddenFile('/path/to/file.thm')).toBe(true);
      expect(isHiddenFile('/path/to/file.aae')).toBe(true);
    });

    it('should hide SDR duplicates', () => {
      expect(isHiddenFile('/path/to/IMG_1234_SDR.HEIC')).toBe(true);
    });

    it('should not hide XMP sidecars', () => {
      expect(isHiddenFile('/path/to/file.xmp')).toBe(false);
    });
  });

  describe('shouldEmbedContent', () => {
    it('should embed small text sidecars', () => {
      expect(shouldEmbedContent('.srt', 50000)).toBe(true);
      expect(shouldEmbedContent('.xml', 100000)).toBe(true);
      expect(shouldEmbedContent('.aae', 5000)).toBe(true);
      expect(shouldEmbedContent('.xmp', 10000)).toBe(true);
    });

    it('should not embed video proxies', () => {
      expect(shouldEmbedContent('.lrf', 50000)).toBe(false);
      expect(shouldEmbedContent('.lrv', 100000)).toBe(false);
    });

    it('should not embed files larger than 10MB', () => {
      const largeSize = 11 * 1024 * 1024; // 11 MB
      expect(shouldEmbedContent('.srt', largeSize)).toBe(false);
      expect(shouldEmbedContent('.xml', largeSize)).toBe(false);
    });

    it('should not embed binary sidecars', () => {
      expect(shouldEmbedContent('.gpr', 5000)).toBe(false);
      expect(shouldEmbedContent('.sidecar', 5000)).toBe(false);
      expect(shouldEmbedContent('.nksc', 5000)).toBe(false);
    });
  });

  describe('findCompanionSidecars', () => {
    it('should find same-basename companions', async () => {
      // Create test files
      const videoPath = path.join(testDir, 'DJI_0001.MOV');
      const srtPath = path.join(testDir, 'DJI_0001.SRT');
      const lrfPath = path.join(testDir, 'DJI_0001.LRF');

      await fs.writeFile(videoPath, 'video content');
      await fs.writeFile(srtPath, 'srt content');
      await fs.writeFile(lrfPath, 'lrf content');

      const companions = await findCompanionSidecars(videoPath);

      expect(companions.length).toBe(2);
      expect(companions.some(c => c.endsWith('.SRT'))).toBe(true);
      expect(companions.some(c => c.endsWith('.LRF'))).toBe(true);
    });

    it('should handle case-insensitive matching', async () => {
      // Create test files with mixed case
      const videoPath = path.join(testDir, 'mov001.tod');
      const moiPath = path.join(testDir, 'MOV001.MOI');

      await fs.writeFile(videoPath, 'video content');
      await fs.writeFile(moiPath, 'moi content');

      const companions = await findCompanionSidecars(videoPath);

      expect(companions.length).toBe(1);
      expect(companions[0].toLowerCase()).toContain('.moi');
    });

    it('should find Sony M01.XML suffix pattern', async () => {
      // Create test files
      const videoPath = path.join(testDir, 'A001C001.MP4');
      const xmlPath = path.join(testDir, 'A001C001M01.XML');

      await fs.writeFile(videoPath, 'video content');
      await fs.writeFile(xmlPath, 'xml content');

      const companions = await findCompanionSidecars(videoPath);

      expect(companions.length).toBe(1);
      expect(companions[0]).toContain('M01.XML');
    });

    it('should find multiple Sony XML suffixes', async () => {
      const videoPath = path.join(testDir, 'B001C001.MP4');
      const m01Path = path.join(testDir, 'B001C001M01.XML');
      const c01Path = path.join(testDir, 'B001C001C01.XML');

      await fs.writeFile(videoPath, 'video content');
      await fs.writeFile(m01Path, 'xml content');
      await fs.writeFile(c01Path, 'xml content');

      const companions = await findCompanionSidecars(videoPath);

      expect(companions.length).toBe(2);
    });

    it('should return empty array for non-media files', async () => {
      const txtPath = path.join(testDir, 'test.txt');
      await fs.writeFile(txtPath, 'text content');

      const companions = await findCompanionSidecars(txtPath);
      expect(companions.length).toBe(0);
    });

    it('should find companions for photo files', async () => {
      const jpgPath = path.join(testDir, 'IMG_0001.jpg');
      const xmpPath = path.join(testDir, 'IMG_0001.xmp');
      const aaePath = path.join(testDir, 'IMG_0001.aae');

      await fs.writeFile(jpgPath, 'jpg content');
      await fs.writeFile(xmpPath, 'xmp content');
      await fs.writeFile(aaePath, 'aae content');

      const companions = await findCompanionSidecars(jpgPath);

      expect(companions.length).toBe(2);
      expect(companions.some(c => c.endsWith('.xmp'))).toBe(true);
      expect(companions.some(c => c.endsWith('.aae'))).toBe(true);
    });
  });

  describe('DJI SRT Parser', () => {
    it('should parse GPS from SRT content', async () => {
      const srtPath = path.join(testDir, 'test_dji.srt');
      const srtContent = `1
00:00:00,000 --> 00:00:00,033
<font size="28">SrtCnt : 1, DiffTime : 33ms
2024-03-15 14:23:45.123
[iso: 100] [shutter: 1/640.0] [fnum: 2.8] [ev: 0.3] [ct: 5417]
[color_md : dlog_m] [focal_len: 24.00]
[latitude: 41.98172] [longitude: -76.24034]
[rel_alt: 45.200 abs_alt: 312.456] </font>

2
00:00:00,033 --> 00:00:00,066
<font size="28">SrtCnt : 2, DiffTime : 33ms
2024-03-15 14:23:45.156
[iso: 100] [shutter: 1/640.0] [fnum: 2.8] [ev: 0.3] [ct: 5417]
[latitude: 41.98175] [longitude: -76.24038]
[rel_alt: 45.300 abs_alt: 312.556] </font>
`;

      await fs.writeFile(srtPath, srtContent);

      // Create a mock video file to test companion detection
      const videoPath = path.join(testDir, 'test_dji.MOV');
      await fs.writeFile(videoPath, 'video');

      const result = await exiftool.extractCompanionMetadata(videoPath);

      expect(result.length).toBe(1);
      expect(result[0].metadata['GPSLatitude']).toBeCloseTo(41.98172, 4);
      expect(result[0].metadata['GPSLongitude']).toBeCloseTo(-76.24034, 4);
      expect(result[0].metadata['DJI:ISO']).toBe(100);
      expect(result[0].metadata['DJI:FNumber']).toBeCloseTo(2.8, 1);
    });
  });

  describe('Sony NonRealTimeMeta Parser', () => {
    it('should parse Sony NRT XML metadata', async () => {
      // Sony naming pattern: baseM01.XML (no underscore)
      const xmlPath = path.join(testDir, 'sonytestM01.XML');
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<NonRealTimeMeta xmlns="urn:schemas-professionalDisc:nonRealTimeMeta:ver.2.00">
  <Duration value="1234"/>
  <CreationDate value="2024-03-15T14:23:45-05:00"/>
  <Device manufacturer="Sony" modelName="ILME-FX6" serialNo="12345"/>
  <VideoFormat>
    <VideoRecPort videoCodec="AVC-I"/>
    <VideoFrame captureFps="23976/1000" numOfVerticalLine="1080" pixel="1920"/>
  </VideoFormat>
  <AcquisitionRecord>
    <Group name="CameraUnitMetadataSet">
      <Item name="CaptureGammaEquation" value="S-Log3"/>
      <Item name="CaptureColorPrimaries" value="S-Gamut3.Cine"/>
    </Group>
  </AcquisitionRecord>
</NonRealTimeMeta>`;

      await fs.writeFile(xmlPath, xmlContent);

      // Create corresponding video file
      const videoPath = path.join(testDir, 'sonytest.MP4');
      await fs.writeFile(videoPath, 'video');

      const result = await exiftool.extractCompanionMetadata(videoPath);

      expect(result.length).toBe(1);
      expect(result[0].metadata['Sony:Model']).toBe('ILME-FX6');
      expect(result[0].metadata['Sony:Manufacturer']).toBe('Sony');
      expect(result[0].metadata['Sony:GammaEquation']).toBe('S-Log3');
      expect(result[0].metadata['Sony:ColorPrimaries']).toBe('S-Gamut3.Cine');
      expect(result[0].metadata['DateTimeOriginal']).toBe('2024-03-15T14:23:45-05:00');
    });
  });

  describe('AAE Parser', () => {
    it('should detect Apple adjustments', async () => {
      const aaePath = path.join(testDir, 'test_aae.aae');
      const aaeContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN">
<plist version="1.0">
<dict>
    <key>adjustmentData</key>
    <data>YmluYXJ5ZGF0YQ==</data>
    <key>adjustmentFormatIdentifier</key>
    <string>com.apple.photo</string>
    <key>adjustmentFormatVersion</key>
    <integer>1</integer>
</dict>
</plist>`;

      await fs.writeFile(aaePath, aaeContent);

      // Create corresponding photo file
      const jpgPath = path.join(testDir, 'test_aae.jpg');
      await fs.writeFile(jpgPath, 'photo');

      const result = await exiftool.extractCompanionMetadata(jpgPath);

      expect(result.length).toBe(1);
      expect(result[0].metadata['Apple:HasAdjustments']).toBe(true);
      expect(result[0].metadata['Apple:AdjustmentFormat']).toBe('com.apple.photo');
      expect(result[0].metadata['Apple:AdjustmentVersion']).toBe(1);
    });
  });
});
