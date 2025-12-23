/**
 * MHL Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generateMhl,
  mhlToXml,
  writeMhl,
  parseMhlXml,
  verifyMhl,
  generateMhlFilename
} from '../../src/services/mhl/index.js';

describe('MHL Service', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `wnb-mhl-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('generateMhl', () => {
    it('should generate MHL document from directory', async () => {
      // Create test files
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'content2');

      const doc = await generateMhl(tempDir);

      expect(doc.version).toBe('2.0');
      expect(doc.creatorInfo.name).toBe('wake-n-blake');
      expect(doc.hashes).toHaveLength(2);
      expect(doc.hashes[0].file).toBeDefined();
      expect(doc.hashes[0].size).toBeGreaterThan(0);
    });

    it('should generate xxhash64 by default', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');

      const doc = await generateMhl(tempDir);

      expect(doc.hashes[0].xxhash64).toBeDefined();
      expect(doc.hashes[0].xxhash64).toHaveLength(16);
    });

    it('should generate md5 when requested', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');

      const doc = await generateMhl(tempDir, { algorithm: 'md5' });

      expect(doc.hashes[0].md5).toBeDefined();
      expect(doc.hashes[0].md5).toHaveLength(32);
    });

    it('should generate both algorithms when requested', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');

      const doc = await generateMhl(tempDir, { algorithm: 'both' });

      expect(doc.hashes[0].xxhash64).toBeDefined();
      expect(doc.hashes[0].md5).toBeDefined();
    });

    it('should call progress callback', async () => {
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'content2');

      const progressCalls: number[] = [];
      await generateMhl(tempDir, {
        onProgress: (current, total) => {
          progressCalls.push(current);
        }
      });

      expect(progressCalls).toEqual([1, 2]);
    });
  });

  describe('mhlToXml', () => {
    it('should generate valid XML', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');

      const doc = await generateMhl(tempDir);
      const xml = mhlToXml(doc);

      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<hashlist version="2.0">');
      expect(xml).toContain('<creatorinfo>');
      expect(xml).toContain('<hash>');
      expect(xml).toContain('</hashlist>');
    });

    it('should escape XML special characters', async () => {
      const subDir = path.join(tempDir, 'dir&name');
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(subDir, 'file<test>.txt'), 'content');

      const doc = await generateMhl(tempDir);
      const xml = mhlToXml(doc);

      expect(xml).toContain('&amp;');
      expect(xml).toContain('&lt;');
      expect(xml).toContain('&gt;');
    });
  });

  describe('writeMhl', () => {
    it('should write MHL file to disk', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');

      const doc = await generateMhl(tempDir);
      const mhlPath = path.join(tempDir, 'output.mhl');
      await writeMhl(doc, mhlPath);

      const content = await fs.readFile(mhlPath, 'utf-8');
      expect(content).toContain('<?xml version="1.0"');
    });
  });

  describe('parseMhlXml', () => {
    it('should parse MHL XML correctly', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<hashlist version="2.0">
  <creatorinfo>
    <name>wake-n-blake</name>
    <version>0.1.0</version>
    <host>testhost</host>
    <startdate>2024-01-01T00:00:00.000Z</startdate>
    <finishdate>2024-01-01T00:00:01.000Z</finishdate>
  </creatorinfo>
  <hash>
    <file>test.txt</file>
    <size>100</size>
    <lastmodificationdate>2024-01-01T00:00:00.000Z</lastmodificationdate>
    <xxhash64>abc123def4567890</xxhash64>
    <hashdate>2024-01-01T00:00:00.500Z</hashdate>
  </hash>
</hashlist>`;

      const doc = parseMhlXml(xml);

      expect(doc.version).toBe('2.0');
      expect(doc.creatorInfo.name).toBe('wake-n-blake');
      expect(doc.hashes).toHaveLength(1);
      expect(doc.hashes[0].file).toBe('test.txt');
      expect(doc.hashes[0].size).toBe(100);
      expect(doc.hashes[0].xxhash64).toBe('abc123def4567890');
    });
  });

  describe('verifyMhl', () => {
    it('should verify valid MHL', async () => {
      // Create test file
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');

      // Generate and write MHL
      const doc = await generateMhl(tempDir);
      const mhlPath = path.join(tempDir, 'test.mhl');
      await writeMhl(doc, mhlPath);

      // Verify
      const result = await verifyMhl(mhlPath);

      expect(result.valid).toBe(true);
      expect(result.matched).toBe(1);
      expect(result.mismatched).toHaveLength(0);
      expect(result.missing).toHaveLength(0);
    });

    it('should detect missing files', async () => {
      // Create and hash file
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');
      const doc = await generateMhl(tempDir);
      const mhlPath = path.join(tempDir, 'test.mhl');
      await writeMhl(doc, mhlPath);

      // Delete the file
      await fs.unlink(path.join(tempDir, 'test.txt'));

      // Verify
      const result = await verifyMhl(mhlPath);

      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(1);
    });

    it('should detect modified files', async () => {
      // Create and hash file
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'original content');
      const doc = await generateMhl(tempDir);
      const mhlPath = path.join(tempDir, 'test.mhl');
      await writeMhl(doc, mhlPath);

      // Modify the file
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'modified content');

      // Verify
      const result = await verifyMhl(mhlPath);

      expect(result.valid).toBe(false);
      expect(result.mismatched).toHaveLength(1);
    });
  });

  describe('generateMhlFilename', () => {
    it('should generate filename with timestamp', () => {
      const filename = generateMhlFilename('/path/to/myproject');

      expect(filename).toMatch(/^myproject_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.mhl$/);
    });
  });
});
