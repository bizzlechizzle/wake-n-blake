/**
 * Office Document Text Extraction Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { officeText } from '../../src/services/metadata/index.js';

describe('Office Text Extraction', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-office-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isOfficeTextAvailable', () => {
    it('should correctly detect tool availability', async () => {
      const available = await officeText.isOfficeTextAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('getAvailablePackages', () => {
    it('should return array of available packages', async () => {
      const packages = await officeText.getAvailablePackages();
      expect(Array.isArray(packages)).toBe(true);
    });
  });

  describe('extract', () => {
    it('should return undefined for non-existent files', async () => {
      const result = await officeText.extract('/nonexistent/file.docx');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-Office files', async () => {
      const textFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(textFile, 'not an office doc');
      const result = await officeText.extract(textFile);
      expect(result).toBeUndefined();
    });
  });

  describe('toRawMetadata', () => {
    it('should convert DOCX result to prefixed key-value pairs', () => {
      const result: officeText.OfficeTextResult = {
        format: 'docx',
        text: 'Hello World',
        wordCount: 2,
        charCount: 11,
        paragraphCount: 1,
      };

      const metadata = officeText.toRawMetadata(result);

      expect(metadata['Office_Format']).toBe('DOCX');
      expect(metadata['Office_WordCount']).toBe(2);
      expect(metadata['Office_CharCount']).toBe(11);
      expect(metadata['Office_ParagraphCount']).toBe(1);
    });

    it('should convert XLSX result with sheet info', () => {
      const result: officeText.OfficeTextResult = {
        format: 'xlsx',
        text: 'data',
        wordCount: 1,
        charCount: 4,
        sheetCount: 3,
        sheetNames: ['Sheet1', 'Sheet2', 'Data'],
      };

      const metadata = officeText.toRawMetadata(result);

      expect(metadata['Office_Format']).toBe('XLSX');
      expect(metadata['Office_SheetCount']).toBe(3);
      expect(metadata['Office_SheetNames']).toBe('Sheet1; Sheet2; Data');
    });

    it('should convert PPTX result with slide info', () => {
      const result: officeText.OfficeTextResult = {
        format: 'pptx',
        text: 'slide content',
        wordCount: 2,
        charCount: 13,
        slideCount: 5,
      };

      const metadata = officeText.toRawMetadata(result);

      expect(metadata['Office_Format']).toBe('PPTX');
      expect(metadata['Office_SlideCount']).toBe(5);
    });
  });
});
