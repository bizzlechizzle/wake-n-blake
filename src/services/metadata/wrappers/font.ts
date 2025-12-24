/**
 * Font Metadata Wrapper
 *
 * Extracts metadata from font files (TTF, OTF, WOFF, WOFF2).
 * Uses Python fonttools library.
 *
 * Install:
 *   pip install fonttools brotli  # brotli for WOFF2 support
 *
 * @module services/metadata/wrappers/font
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Font metadata result
 */
export interface FontResult {
  /** Font format */
  format: 'ttf' | 'otf' | 'woff' | 'woff2' | 'other';
  /** Font family name */
  fontFamily: string;
  /** Font subfamily (Regular, Bold, Italic, etc.) */
  fontSubfamily?: string;
  /** Full font name */
  fullName?: string;
  /** Postscript name */
  postscriptName?: string;
  /** Font version */
  version?: string;
  /** Copyright notice */
  copyright?: string;
  /** Trademark */
  trademark?: string;
  /** Manufacturer */
  manufacturer?: string;
  /** Designer */
  designer?: string;
  /** Designer URL */
  designerUrl?: string;
  /** Vendor URL */
  vendorUrl?: string;
  /** License description */
  license?: string;
  /** License URL */
  licenseUrl?: string;
  /** Number of glyphs */
  glyphCount: number;
  /** Whether font has kerning data */
  hasKerning: boolean;
  /** Whether font is variable (OpenType variable font) */
  isVariable: boolean;
  /** Variable font axes (if variable) */
  variableAxes?: string[];
  /** Unicode ranges covered */
  unicodeRanges?: string[];
  /** Font tables present */
  tables?: string[];
}

// Python script for font parsing
const FONT_SCRIPT = `
import sys
import json
from fontTools.ttLib import TTFont
from fontTools.unicodedata import script_name

def get_name(font, name_id):
    """Get name table entry by ID"""
    if 'name' not in font:
        return None
    name_table = font['name']
    for record in name_table.names:
        if record.nameID == name_id:
            try:
                return record.toUnicode()
            except:
                return str(record)
    return None

try:
    font = TTFont(sys.argv[1])

    # Name table IDs
    # 0 = Copyright, 1 = Family, 2 = Subfamily, 4 = Full name
    # 5 = Version, 6 = PostScript, 7 = Trademark
    # 8 = Manufacturer, 9 = Designer, 11 = Vendor URL
    # 12 = Designer URL, 13 = License, 14 = License URL

    result = {
        'fontFamily': get_name(font, 1) or 'Unknown',
        'fontSubfamily': get_name(font, 2),
        'fullName': get_name(font, 4),
        'postscriptName': get_name(font, 6),
        'version': get_name(font, 5),
        'copyright': get_name(font, 0),
        'trademark': get_name(font, 7),
        'manufacturer': get_name(font, 8),
        'designer': get_name(font, 9),
        'designerUrl': get_name(font, 12),
        'vendorUrl': get_name(font, 11),
        'license': get_name(font, 13),
        'licenseUrl': get_name(font, 14),
        'glyphCount': len(font.getGlyphOrder()) if hasattr(font, 'getGlyphOrder') else 0,
        'hasKerning': 'kern' in font or 'GPOS' in font,
        'isVariable': 'fvar' in font,
        'tables': list(font.keys())
    }

    # Get variable font axes
    if 'fvar' in font:
        axes = []
        for axis in font['fvar'].axes:
            axes.append(f"{axis.axisTag}: {axis.minValue}-{axis.maxValue}")
        result['variableAxes'] = axes

    # Get unicode ranges (simplified)
    if 'cmap' in font:
        cmap = font.getBestCmap()
        if cmap:
            chars = list(cmap.keys())
            if chars:
                # Group into ranges
                ranges = []
                if any(c < 0x80 for c in chars):
                    ranges.append('Basic Latin')
                if any(0x80 <= c < 0x100 for c in chars):
                    ranges.append('Latin-1 Supplement')
                if any(0x100 <= c < 0x180 for c in chars):
                    ranges.append('Latin Extended-A')
                if any(0x400 <= c < 0x500 for c in chars):
                    ranges.append('Cyrillic')
                if any(0x4E00 <= c < 0x9FFF for c in chars):
                    ranges.append('CJK Unified Ideographs')
                if any(0x3040 <= c < 0x30A0 for c in chars):
                    ranges.append('Hiragana')
                if any(0x30A0 <= c < 0x3100 for c in chars):
                    ranges.append('Katakana')
                if any(0xAC00 <= c < 0xD7A4 for c in chars):
                    ranges.append('Hangul')
                if any(0x0600 <= c < 0x06FF for c in chars):
                    ranges.append('Arabic')
                if any(0x0590 <= c < 0x0600 for c in chars):
                    ranges.append('Hebrew')
                if any(0x0900 <= c < 0x097F for c in chars):
                    ranges.append('Devanagari')
                if ranges:
                    result['unicodeRanges'] = ranges

    font.close()
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

let hasFonttools: boolean | undefined;

/**
 * Check if fonttools is available
 */
export async function isFontAvailable(): Promise<boolean> {
  if (hasFonttools !== undefined) return hasFonttools;

  try {
    await execFileAsync('python3', ['-c', 'from fontTools.ttLib import TTFont'], {
      timeout: 5000
    });
    hasFonttools = true;
  } catch {
    hasFonttools = false;
  }
  return hasFonttools;
}

/**
 * Get font format from extension
 */
function getFormat(ext: string): FontResult['format'] {
  switch (ext.toLowerCase()) {
    case '.ttf': return 'ttf';
    case '.otf': return 'otf';
    case '.woff': return 'woff';
    case '.woff2': return 'woff2';
    default: return 'other';
  }
}

/**
 * Extract metadata from a font file
 *
 * @param filePath - Path to font file
 * @returns Extraction result or undefined if extraction failed
 */
export async function extract(filePath: string): Promise<FontResult | undefined> {
  if (!(await isFontAvailable())) return undefined;

  const ext = path.extname(filePath);
  const format = getFormat(ext);

  try {
    const { stdout } = await execFileAsync('python3', ['-c', FONT_SCRIPT, filePath], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.error) return undefined;

    return {
      format,
      fontFamily: result.fontFamily,
      fontSubfamily: result.fontSubfamily,
      fullName: result.fullName,
      postscriptName: result.postscriptName,
      version: result.version,
      copyright: result.copyright,
      trademark: result.trademark,
      manufacturer: result.manufacturer,
      designer: result.designer,
      designerUrl: result.designerUrl,
      vendorUrl: result.vendorUrl,
      license: result.license,
      licenseUrl: result.licenseUrl,
      glyphCount: result.glyphCount,
      hasKerning: result.hasKerning,
      isVariable: result.isVariable,
      variableAxes: result.variableAxes,
      unicodeRanges: result.unicodeRanges,
      tables: result.tables,
    };
  } catch {
    return undefined;
  }
}

/**
 * Convert result to XMP rawMetadata format with Font_ prefix
 */
export function toRawMetadata(result: FontResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'Font_Format': result.format.toUpperCase(),
    'Font_Family': result.fontFamily,
    'Font_GlyphCount': result.glyphCount,
    'Font_HasKerning': result.hasKerning,
    'Font_IsVariable': result.isVariable,
  };

  if (result.fontSubfamily) {
    metadata['Font_Subfamily'] = result.fontSubfamily;
  }

  if (result.fullName) {
    metadata['Font_FullName'] = result.fullName;
  }

  if (result.postscriptName) {
    metadata['Font_PostScriptName'] = result.postscriptName;
  }

  if (result.version) {
    metadata['Font_Version'] = result.version;
  }

  if (result.copyright) {
    // Truncate long copyright notices
    const maxLength = 1000;
    metadata['Font_Copyright'] = result.copyright.length > maxLength
      ? result.copyright.substring(0, maxLength) + '...'
      : result.copyright;
  }

  if (result.manufacturer) {
    metadata['Font_Manufacturer'] = result.manufacturer;
  }

  if (result.designer) {
    metadata['Font_Designer'] = result.designer;
  }

  if (result.license) {
    // Truncate long licenses
    const maxLength = 500;
    metadata['Font_License'] = result.license.length > maxLength
      ? result.license.substring(0, maxLength) + '...'
      : result.license;
  }

  if (result.licenseUrl) {
    metadata['Font_LicenseURL'] = result.licenseUrl;
  }

  if (result.variableAxes && result.variableAxes.length > 0) {
    metadata['Font_VariableAxes'] = result.variableAxes.join('; ');
    metadata['Font_AxisCount'] = result.variableAxes.length;
  }

  if (result.unicodeRanges && result.unicodeRanges.length > 0) {
    metadata['Font_UnicodeRanges'] = result.unicodeRanges.join('; ');
  }

  if (result.tables && result.tables.length > 0) {
    metadata['Font_TableCount'] = result.tables.length;
    metadata['Font_Tables'] = result.tables.join(', ');
  }

  return metadata;
}

/**
 * Get fonttools version information
 */
export async function getVersion(): Promise<string | undefined> {
  if (!(await isFontAvailable())) return undefined;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', 'import fontTools; print(fontTools.__version__)'], {
      timeout: 5000
    });
    return `fonttools ${stdout.trim()}`;
  } catch {
    return 'fonttools (version unknown)';
  }
}
