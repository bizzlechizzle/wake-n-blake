/**
 * Font Metadata Extraction Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { font } from '../../src/services/metadata/index.js';

function checkPythonLibAvailable(lib: string): boolean {
  try {
    execSync(`python3 -c "import ${lib}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasFonttools = checkPythonLibAvailable('fontTools');

describe('Font Metadata Extraction', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-font-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isFontAvailable', () => {
    it('should correctly detect fonttools availability', async () => {
      const available = await font.isFontAvailable();
      expect(typeof available).toBe('boolean');
      expect(available).toBe(hasFonttools);
    });
  });

  describe('extract', () => {
    it('should return undefined for non-existent files', async () => {
      const result = await font.extract('/nonexistent/file.ttf');
      expect(result).toBeUndefined();
    });

    it('should return undefined when fonttools is not available', async () => {
      if (hasFonttools) {
        return; // Skip if fonttools is available
      }
      const result = await font.extract(path.join(tempDir, 'test.ttf'));
      expect(result).toBeUndefined();
    });

    it.skipIf(!hasFonttools)('should extract from system font', async () => {
      // Try to find a system font
      const systemFonts = [
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/Geneva.ttf',
        '/Library/Fonts/Arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      ];

      let testFont: string | null = null;
      for (const f of systemFonts) {
        try {
          await fs.access(f);
          testFont = f;
          break;
        } catch {
          continue;
        }
      }

      if (!testFont) {
        return; // Skip if no test font available
      }

      const result = await font.extract(testFont);

      if (result) {
        expect(result.fontFamily).toBeDefined();
        expect(result.glyphCount).toBeGreaterThan(0);
      }
    });
  });

  describe('toRawMetadata', () => {
    it('should convert result to prefixed key-value pairs', () => {
      const result: font.FontResult = {
        format: 'ttf',
        fontFamily: 'Test Font',
        fontSubfamily: 'Regular',
        fullName: 'Test Font Regular',
        postscriptName: 'TestFont-Regular',
        version: 'Version 1.0',
        copyright: 'Copyright 2024 Test',
        manufacturer: 'Test Foundry',
        designer: 'Test Designer',
        glyphCount: 256,
        hasKerning: true,
        isVariable: false,
        tables: ['cmap', 'glyf', 'head', 'hhea', 'hmtx', 'kern', 'name', 'post'],
      };

      const metadata = font.toRawMetadata(result);

      expect(metadata['Font_Format']).toBe('TTF');
      expect(metadata['Font_Family']).toBe('Test Font');
      expect(metadata['Font_Subfamily']).toBe('Regular');
      expect(metadata['Font_FullName']).toBe('Test Font Regular');
      expect(metadata['Font_PostScriptName']).toBe('TestFont-Regular');
      expect(metadata['Font_Version']).toBe('Version 1.0');
      expect(metadata['Font_GlyphCount']).toBe(256);
      expect(metadata['Font_HasKerning']).toBe(true);
      expect(metadata['Font_IsVariable']).toBe(false);
      expect(metadata['Font_TableCount']).toBe(8);
    });

    it('should handle variable font axes', () => {
      const result: font.FontResult = {
        format: 'otf',
        fontFamily: 'Variable Font',
        glyphCount: 500,
        hasKerning: true,
        isVariable: true,
        variableAxes: ['wght: 100-900', 'wdth: 75-125', 'ital: 0-1'],
      };

      const metadata = font.toRawMetadata(result);

      expect(metadata['Font_IsVariable']).toBe(true);
      expect(metadata['Font_VariableAxes']).toBe('wght: 100-900; wdth: 75-125; ital: 0-1');
      expect(metadata['Font_AxisCount']).toBe(3);
    });

    it('should include unicode ranges', () => {
      const result: font.FontResult = {
        format: 'woff2',
        fontFamily: 'Web Font',
        glyphCount: 1000,
        hasKerning: false,
        isVariable: false,
        unicodeRanges: ['Basic Latin', 'Latin-1 Supplement', 'Cyrillic'],
      };

      const metadata = font.toRawMetadata(result);

      expect(metadata['Font_UnicodeRanges']).toBe('Basic Latin; Latin-1 Supplement; Cyrillic');
    });
  });
});
