/**
 * XMP Reader Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { readSidecar, parseSidecarContent, verifySidecar, sidecarExists } from '../../src/services/xmp/reader.js';
import { writeSidecar, generateXmpContent } from '../../src/services/xmp/writer.js';
import { SCHEMA_VERSION } from '../../src/services/xmp/schema.js';
import type { XmpSidecarData } from '../../src/services/xmp/schema.js';

describe('XMP Reader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createMinimalSidecarData = (): XmpSidecarData => ({
    schemaVersion: SCHEMA_VERSION,
    sidecarCreated: '2024-01-15T10:30:00.000Z',
    sidecarUpdated: '2024-01-15T10:30:00.000Z',
    contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    hashAlgorithm: 'blake3',
    fileSize: 2048,
    verified: true,
    fileCategory: 'image',
    detectedMimeType: 'image/jpeg',
    declaredExtension: '.jpg',
    sourcePath: '/original/path/photo.jpg',
    sourceFilename: 'photo.jpg',
    sourceHost: 'workstation',
    sourceType: 'memory_card',
    originalMtime: '2024-01-14T08:00:00.000Z',
    importTimestamp: '2024-01-15T10:30:00.000Z',
    sessionId: 'session-abc123',
    toolVersion: '0.1.0',
    importUser: 'photographer',
    importHost: 'workstation',
    importPlatform: 'darwin',
    custodyChain: [{
      eventId: 'evt-001',
      eventTimestamp: '2024-01-15T10:30:00.000Z',
      eventAction: 'ingestion',
      eventOutcome: 'success',
      eventTool: 'wake-n-blake v0.1.0',
      eventHost: 'workstation'
    }],
    firstSeen: '2024-01-15T10:30:00.000Z',
    eventCount: 1
  });

  describe('sidecarExists', () => {
    it('should return true when sidecar exists', async () => {
      const testFile = path.join(tempDir, 'test.jpg');
      await fs.writeFile(testFile, 'fake image');
      await fs.writeFile(`${testFile}.xmp`, '<xmp>test</xmp>');

      const exists = await sidecarExists(testFile);
      expect(exists).toBe(true);
    });

    it('should return false when sidecar does not exist', async () => {
      const testFile = path.join(tempDir, 'test.jpg');
      await fs.writeFile(testFile, 'fake image');

      const exists = await sidecarExists(testFile);
      expect(exists).toBe(false);
    });
  });

  describe('readSidecar', () => {
    it('should read and parse a valid sidecar file', async () => {
      const testFile = path.join(tempDir, 'test.jpg');
      await fs.writeFile(testFile, 'fake image data');

      const data = createMinimalSidecarData();
      const sidecarPath = await writeSidecar(testFile, data);

      const result = await readSidecar(sidecarPath);

      expect(result.isValid).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.contentHash).toBe(data.contentHash);
      expect(result.data.fileSize).toBe(data.fileSize);
      expect(result.data.sourceFilename).toBe(data.sourceFilename);
    });

    it('should extract custody chain events', async () => {
      const testFile = path.join(tempDir, 'test.jpg');
      await fs.writeFile(testFile, 'fake image data');

      const data = createMinimalSidecarData();
      data.custodyChain = [
        {
          eventId: 'evt-001',
          eventTimestamp: '2024-01-15T10:30:00.000Z',
          eventAction: 'ingestion',
          eventOutcome: 'success',
          eventTool: 'wake-n-blake v0.1.0'
        },
        {
          eventId: 'evt-002',
          eventTimestamp: '2024-01-16T14:00:00.000Z',
          eventAction: 'fixity_check',
          eventOutcome: 'success',
          eventTool: 'wake-n-blake v0.1.0'
        }
      ];
      data.eventCount = 2;

      const sidecarPath = await writeSidecar(testFile, data);
      const result = await readSidecar(sidecarPath);

      expect(result.isValid).toBe(true);
      expect(result.data.custodyChain).toHaveLength(2);
      expect(result.data.eventCount).toBe(2);
    });

    it('should throw for non-existent file', async () => {
      await expect(readSidecar('/nonexistent/path.xmp')).rejects.toThrow();
    });
  });

  describe('parseSidecarContent', () => {
    it('should parse XMP content string', () => {
      const data = createMinimalSidecarData();
      const content = generateXmpContent(data);

      const result = parseSidecarContent(content);

      expect(result.isValid).toBe(true);
      expect(result.data.contentHash).toBe(data.contentHash);
      expect(result.data.schemaVersion).toBe(SCHEMA_VERSION);
    });

    it('should extract photo metadata', () => {
      const data = createMinimalSidecarData();
      data.photo = {
        creationDevice: 'Sony A7IV',
        iso: 800,
        aperture: 'f/4',
        shutterSpeed: '1/500',
        lensModel: 'FE 24-70mm F2.8 GM II'
      };
      const content = generateXmpContent(data);

      const result = parseSidecarContent(content);

      expect(result.isValid).toBe(true);
      expect(result.data.photo?.creationDevice).toBe('Sony A7IV');
      expect(result.data.photo?.iso).toBe(800);
    });

    it('should handle missing optional fields', () => {
      const data = createMinimalSidecarData();
      // No photo, video, audio, or document metadata
      const content = generateXmpContent(data);

      const result = parseSidecarContent(content);

      expect(result.isValid).toBe(true);
      expect(result.data.photo).toBeUndefined();
      expect(result.data.video).toBeUndefined();
    });

    it('should report errors for missing required fields', () => {
      // Minimal XMP with missing fields
      const badContent = `<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:wnb="http://wake-n-blake.dev/xmp/1.0/">
    <rdf:Description rdf:about="">
      <wnb:SchemaVersion>2</wnb:SchemaVersion>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;

      const result = parseSidecarContent(badContent);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle non-XMP XML gracefully', () => {
      const result = parseSidecarContent('<root><child>value</child></root>');

      // Should parse but have missing fields
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('verifySidecar', () => {
    it('should verify sidecar integrity', async () => {
      const testFile = path.join(tempDir, 'test.jpg');
      await fs.writeFile(testFile, 'fake image data');

      const data = createMinimalSidecarData();
      const sidecarPath = await writeSidecar(testFile, data);

      const result = await verifySidecar(sidecarPath);

      expect(result.valid).toBe(true);
      expect(result.hashMatch).toBe(true);
    });

    it('should detect tampered sidecar', async () => {
      const testFile = path.join(tempDir, 'test.jpg');
      await fs.writeFile(testFile, 'fake image data');

      const data = createMinimalSidecarData();
      const sidecarPath = await writeSidecar(testFile, data);

      // Tamper with the file
      let content = await fs.readFile(sidecarPath, 'utf-8');
      content = content.replace('workstation', 'hacked-host');
      await fs.writeFile(sidecarPath, content);

      const result = await verifySidecar(sidecarPath);

      expect(result.valid).toBe(false);
      expect(result.hashMatch).toBe(false);
    });
  });
});
