/**
 * PDF Text Extraction Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { pdfText } from '../../src/services/metadata/index.js';

function checkToolAvailable(tool: string): boolean {
  try {
    execSync(`which ${tool}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasPdftotext = checkToolAvailable('pdftotext');

describe('PDF Text Extraction', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-pdf-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isPdfTextAvailable', () => {
    it('should correctly detect tool availability', async () => {
      const available = await pdfText.isPdfTextAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('getAvailableTools', () => {
    it('should return array of available tools', async () => {
      const tools = await pdfText.getAvailableTools();
      expect(Array.isArray(tools)).toBe(true);
      // If pdftotext is available, should be in the list
      if (hasPdftotext) {
        expect(tools).toContain('pdftotext');
      }
    });
  });

  describe('extract', () => {
    it('should return undefined for non-existent files', async () => {
      const result = await pdfText.extract('/nonexistent/file.pdf');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-PDF files', async () => {
      const textFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(textFile, 'not a pdf');
      const result = await pdfText.extract(textFile);
      expect(result).toBeUndefined();
    });
  });

  describe('toRawMetadata', () => {
    it('should convert result to prefixed key-value pairs', () => {
      const result: pdfText.PdfTextResult = {
        text: 'Hello World',
        pageCount: 1,
        wordCount: 2,
        charCount: 11,
        hasText: true,
        extractionMethod: 'pdftotext',
      };

      const metadata = pdfText.toRawMetadata(result);

      expect(metadata['PDFText_HasText']).toBe(true);
      expect(metadata['PDFText_PageCount']).toBe(1);
      expect(metadata['PDFText_WordCount']).toBe(2);
      expect(metadata['PDFText_CharCount']).toBe(11);
      expect(metadata['PDFText_ExtractionMethod']).toBe('pdftotext');
    });

    it('should truncate long text content', () => {
      const longText = 'a'.repeat(150000); // Exceeds 100KB limit
      const result: pdfText.PdfTextResult = {
        text: longText,
        pageCount: 1,
        wordCount: 1,
        charCount: 150000,
        hasText: true,
        extractionMethod: 'pdftotext',
      };

      const metadata = pdfText.toRawMetadata(result);

      expect(typeof metadata['PDFText_Content']).toBe('string');
      expect((metadata['PDFText_Content'] as string).length).toBeLessThanOrEqual(100000);
      expect(metadata['PDFText_Truncated']).toBe(true);
    });

    it('should not truncate short text content', () => {
      const shortText = 'Hello World';
      const result: pdfText.PdfTextResult = {
        text: shortText,
        pageCount: 1,
        wordCount: 2,
        charCount: 11,
        hasText: true,
        extractionMethod: 'pdftotext',
      };

      const metadata = pdfText.toRawMetadata(result);

      expect(metadata['PDFText_Content']).toBe('Hello World');
      expect(metadata['PDFText_Truncated']).toBe(false);
    });
  });
});
