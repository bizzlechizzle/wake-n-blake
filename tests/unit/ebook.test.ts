/**
 * Ebook Metadata Extraction Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { ebook } from '../../src/services/metadata/index.js';

function checkToolAvailable(tool: string): boolean {
  try {
    execSync(`which ${tool}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasEbookMeta = checkToolAvailable('ebook-meta');

describe('Ebook Metadata Extraction', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-ebook-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isEbookAvailable', () => {
    it('should correctly detect calibre availability', async () => {
      const available = await ebook.isEbookAvailable();
      expect(typeof available).toBe('boolean');
      expect(available).toBe(hasEbookMeta);
    });
  });

  describe('extract', () => {
    it('should return undefined for non-existent files', async () => {
      const result = await ebook.extract('/nonexistent/file.epub');
      expect(result).toBeUndefined();
    });

    it('should return undefined when calibre is not available', async () => {
      if (hasEbookMeta) {
        return; // Skip if calibre is available
      }
      const result = await ebook.extract(path.join(tempDir, 'test.epub'));
      expect(result).toBeUndefined();
    });
  });

  describe('toRawMetadata', () => {
    it('should convert result to prefixed key-value pairs', () => {
      const result: ebook.EbookResult = {
        format: 'epub',
        title: 'Test Book',
        authors: ['Author One', 'Author Two'],
        publisher: 'Test Publisher',
        language: 'en',
        isbn: '978-0123456789',
        hasCover: true,
      };

      const metadata = ebook.toRawMetadata(result);

      expect(metadata['Ebook_Format']).toBe('EPUB');
      expect(metadata['Ebook_Title']).toBe('Test Book');
      expect(metadata['Ebook_Authors']).toBe('Author One; Author Two');
      expect(metadata['Ebook_Publisher']).toBe('Test Publisher');
      expect(metadata['Ebook_Language']).toBe('en');
      expect(metadata['Ebook_ISBN']).toBe('978-0123456789');
      expect(metadata['Ebook_HasCover']).toBe(true);
    });

    it('should handle series information', () => {
      const result: ebook.EbookResult = {
        format: 'mobi',
        title: 'Book 2',
        series: 'My Series',
        seriesIndex: 2,
        hasCover: false,
      };

      const metadata = ebook.toRawMetadata(result);

      expect(metadata['Ebook_Format']).toBe('MOBI');
      expect(metadata['Ebook_Series']).toBe('My Series');
      expect(metadata['Ebook_SeriesIndex']).toBe(2);
    });

    it('should handle tags', () => {
      const result: ebook.EbookResult = {
        format: 'epub',
        title: 'Tagged Book',
        tags: ['fiction', 'fantasy', 'adventure'],
        hasCover: false,
      };

      const metadata = ebook.toRawMetadata(result);

      expect(metadata['Ebook_Tags']).toBe('fiction; fantasy; adventure');
    });
  });
});
