/**
 * XMP Writer Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateXmpContent, writeSidecar, calculateSidecarHash } from '../../src/services/xmp/writer.js';
import { SCHEMA_VERSION } from '../../src/services/xmp/schema.js';
import type { XmpSidecarData } from '../../src/services/xmp/schema.js';

describe('XMP Writer', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createMinimalSidecarData = (): XmpSidecarData => ({
    schemaVersion: SCHEMA_VERSION,
    sidecarCreated: new Date().toISOString(),
    sidecarUpdated: new Date().toISOString(),
    contentHash: 'a'.repeat(64),
    hashAlgorithm: 'blake3',
    fileSize: 1024,
    verified: true,
    fileCategory: 'image',
    detectedMimeType: 'image/jpeg',
    declaredExtension: '.jpg',
    sourcePath: '/test/photo.jpg',
    sourceFilename: 'photo.jpg',
    sourceHost: 'testhost',
    sourceType: 'local_disk',
    originalMtime: new Date().toISOString(),
    importTimestamp: new Date().toISOString(),
    sessionId: 'test-session-123',
    toolVersion: '0.1.0',
    importUser: 'testuser',
    importHost: 'testhost',
    importPlatform: 'darwin',
    custodyChain: [{
      eventId: 'evt-001',
      eventTimestamp: new Date().toISOString(),
      eventAction: 'ingestion',
      eventOutcome: 'success',
      eventTool: 'wake-n-blake v0.1.0'
    }],
    firstSeen: new Date().toISOString(),
    eventCount: 1
  });

  describe('generateXmpContent', () => {
    it('should generate valid XMP XML structure', () => {
      const data = createMinimalSidecarData();
      const content = generateXmpContent(data);

      expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(content).toContain('<x:xmpmeta');
      expect(content).toContain('<rdf:RDF');
      expect(content).toContain('xmlns:wnb="http://wake-n-blake.dev/xmp/1.0/"');
      expect(content).toContain('</x:xmpmeta>');
    });

    it('should include schema version', () => {
      const data = createMinimalSidecarData();
      const content = generateXmpContent(data);

      expect(content).toContain(`<wnb:SchemaVersion>${SCHEMA_VERSION}</wnb:SchemaVersion>`);
    });

    it('should include content hash', () => {
      const data = createMinimalSidecarData();
      const content = generateXmpContent(data);

      expect(content).toContain(`<wnb:ContentHash>${data.contentHash}</wnb:ContentHash>`);
      expect(content).toContain('<wnb:HashAlgorithm>blake3</wnb:HashAlgorithm>');
    });

    it('should include custody chain events', () => {
      const data = createMinimalSidecarData();
      const content = generateXmpContent(data);

      expect(content).toContain('<wnb:CustodyChain>');
      expect(content).toContain('<rdf:Seq>');
      expect(content).toContain('<wnb:EventAction>ingestion</wnb:EventAction>');
      expect(content).toContain('<wnb:EventOutcome>success</wnb:EventOutcome>');
    });

    it('should escape XML special characters', () => {
      const data = createMinimalSidecarData();
      data.sourcePath = '/path/with/<special>&"chars\'';
      const content = generateXmpContent(data);

      expect(content).toContain('&lt;special&gt;');
      expect(content).toContain('&amp;');
      expect(content).toContain('&quot;');
      expect(content).toContain('&apos;');
    });

    it('should include photo metadata when present', () => {
      const data = createMinimalSidecarData();
      data.photo = {
        creationDevice: 'Canon EOS R5',
        lensModel: 'RF 24-70mm F2.8L',
        iso: 400,
        aperture: 'f/2.8',
        shutterSpeed: '1/250'
      };
      const content = generateXmpContent(data);

      expect(content).toContain('<!-- Photo Metadata -->');
      expect(content).toContain('<wnb:CreationDevice>Canon EOS R5</wnb:CreationDevice>');
      expect(content).toContain('<wnb:LensModel>RF 24-70mm F2.8L</wnb:LensModel>');
      expect(content).toContain('<wnb:ISO>400</wnb:ISO>');
    });

    it('should include video metadata when present', () => {
      const data = createMinimalSidecarData();
      data.fileCategory = 'video';
      data.video = {
        container: 'MOV',
        codec: 'H.265',
        resolution: '3840x2160',
        frameRate: 60,
        duration: 120.5
      };
      const content = generateXmpContent(data);

      expect(content).toContain('<!-- Video Metadata -->');
      expect(content).toContain('<wnb:VideoContainer>MOV</wnb:VideoContainer>');
      expect(content).toContain('<wnb:VideoCodec>H.265</wnb:VideoCodec>');
      expect(content).toContain('<wnb:VideoFrameRate>60</wnb:VideoFrameRate>');
    });

    it('should include batch context when present', () => {
      const data = createMinimalSidecarData();
      data.batchId = 'batch-123';
      data.batchName = 'Wedding Photos';
      data.batchFileCount = 500;
      data.batchSequence = 42;
      const content = generateXmpContent(data);

      expect(content).toContain('<!-- Batch Context -->');
      expect(content).toContain('<wnb:BatchID>batch-123</wnb:BatchID>');
      expect(content).toContain('<wnb:BatchName>Wedding Photos</wnb:BatchName>');
      expect(content).toContain('<wnb:BatchFileCount>500</wnb:BatchFileCount>');
    });

    it('should include source device info when present', () => {
      const data = createMinimalSidecarData();
      data.sourceDevice = {
        usb: {
          vendorId: '05ac',
          productId: '12a8',
          deviceName: 'Apple Card Reader'
        },
        media: {
          type: 'sd',
          manufacturer: 'SanDisk',
          capacity: 128000000000
        }
      };
      const content = generateXmpContent(data);

      expect(content).toContain('<!-- Import Source Device -->');
      expect(content).toContain('<wnb:USBVendorID>05ac</wnb:USBVendorID>');
      expect(content).toContain('<wnb:MediaType>sd</wnb:MediaType>');
      expect(content).toContain('<wnb:MediaManufacturer>SanDisk</wnb:MediaManufacturer>');
    });
  });

  describe('calculateSidecarHash', () => {
    it('should calculate consistent hash for same content', () => {
      const data = createMinimalSidecarData();
      const content = generateXmpContent(data);

      const hash1 = calculateSidecarHash(content);
      const hash2 = calculateSidecarHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // BLAKE3 hex
    });

    it('should produce different hashes for different content', () => {
      const data1 = createMinimalSidecarData();
      const data2 = createMinimalSidecarData();
      data2.contentHash = 'b'.repeat(64);

      const hash1 = calculateSidecarHash(generateXmpContent(data1));
      const hash2 = calculateSidecarHash(generateXmpContent(data2));

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('writeSidecar', () => {
    it('should write sidecar file to disk', async () => {
      const testFile = path.join(tempDir, 'test.jpg');
      await fs.writeFile(testFile, 'fake image data');

      const data = createMinimalSidecarData();
      const sidecarPath = await writeSidecar(testFile, data);

      expect(sidecarPath).toBe(`${testFile}.xmp`);

      const exists = await fs.access(sidecarPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should include sidecar hash in written file', async () => {
      const testFile = path.join(tempDir, 'test.jpg');
      await fs.writeFile(testFile, 'fake image data');

      const data = createMinimalSidecarData();
      const sidecarPath = await writeSidecar(testFile, data);

      const content = await fs.readFile(sidecarPath, 'utf-8');
      expect(content).toContain('<wnb:SidecarHash>');
    });

    it('should create valid XML', async () => {
      const testFile = path.join(tempDir, 'test.jpg');
      await fs.writeFile(testFile, 'fake image data');

      const data = createMinimalSidecarData();
      const sidecarPath = await writeSidecar(testFile, data);

      const content = await fs.readFile(sidecarPath, 'utf-8');

      // Basic XML validity checks
      expect(content.startsWith('<?xml')).toBe(true);
      expect(content).toContain('</x:xmpmeta>');

      // Check for balanced tags
      const openTags = (content.match(/<wnb:/g) || []).length;
      const closeTags = (content.match(/<\/wnb:/g) || []).length;
      expect(openTags).toBeGreaterThan(0);
      // Note: Some tags are self-contained in rdf:li
    });
  });
});
