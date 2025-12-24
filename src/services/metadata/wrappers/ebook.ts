/**
 * Ebook Metadata Wrapper
 *
 * Extracts metadata from ebook files using Calibre's ebook-meta CLI.
 * Supports EPUB, MOBI, AZW, AZW3, KFX, FB2 formats.
 *
 * Install:
 *   macOS:   brew install calibre
 *   Linux:   apt install calibre
 *   Windows: Download from calibre-ebook.com
 *
 * @module services/metadata/wrappers/ebook
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';

const execFileAsync = promisify(execFile);

/**
 * Ebook metadata result
 */
export interface EbookResult {
  /** Book title */
  title?: string;
  /** Author(s) */
  authors?: string[];
  /** Publisher */
  publisher?: string;
  /** Language code */
  language?: string;
  /** ISBN identifier */
  isbn?: string;
  /** Series name */
  series?: string;
  /** Position in series */
  seriesIndex?: number;
  /** Tags/categories */
  tags?: string[];
  /** Description/synopsis */
  description?: string;
  /** Publication date */
  pubdate?: string;
  /** Ebook format */
  format: 'epub' | 'mobi' | 'azw' | 'azw3' | 'kfx' | 'fb2' | 'pdf' | 'other';
  /** Whether cover image exists */
  hasCover: boolean;
  /** File size in bytes */
  fileSize?: number;
  /** Number of pages (if available) */
  pageCount?: number;
}

// Common installation paths for ebook-meta
const EBOOK_META_PATHS = [
  process.env.EBOOK_META_PATH,
  '/Applications/calibre.app/Contents/MacOS/ebook-meta',  // macOS app bundle
  '/opt/homebrew/bin/ebook-meta',
  '/usr/local/bin/ebook-meta',
  '/usr/bin/ebook-meta',
  `${process.env.HOME}/.local/bin/ebook-meta`,
].filter(Boolean) as string[];

let ebookMetaPath: string | null | undefined = undefined;

/**
 * Find ebook-meta binary
 */
export async function findEbookMeta(): Promise<string | null> {
  if (ebookMetaPath !== undefined) return ebookMetaPath;

  for (const p of EBOOK_META_PATHS) {
    try {
      await fsp.access(p, fs.constants.X_OK);
      ebookMetaPath = p;
      return p;
    } catch {
      // Continue to next path
    }
  }

  // Fallback: search PATH
  try {
    const { stdout } = await execFileAsync('which', ['ebook-meta']);
    const foundPath = stdout.trim();
    if (foundPath) {
      ebookMetaPath = foundPath;
      return foundPath;
    }
  } catch {
    // Not in PATH
  }

  ebookMetaPath = null;
  return null;
}

/**
 * Check if ebook metadata extraction is available
 */
export async function isEbookAvailable(): Promise<boolean> {
  return (await findEbookMeta()) !== null;
}

/**
 * Parse ebook-meta output into structured result
 */
function parseEbookMetaOutput(output: string, ext: string): Partial<EbookResult> {
  const result: Partial<EbookResult> = {};

  // Parse each line
  const lines = output.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    if (!value) continue;

    switch (key) {
      case 'title':
        result.title = value;
        break;
      case 'author(s)':
      case 'authors':
        // Authors may be "Author 1 & Author 2" or "Author 1, Author 2"
        result.authors = value.split(/\s*[&,]\s*/).filter(a => a.length > 0);
        break;
      case 'publisher':
        result.publisher = value;
        break;
      case 'language':
      case 'languages':
        result.language = value.split(',')[0].trim(); // First language if multiple
        break;
      case 'identifiers': {
        // Parse identifiers like "isbn:1234567890, mobi-asin:B01234567"
        const identifiers = value.split(',').map(id => id.trim());
        for (const id of identifiers) {
          if (id.toLowerCase().startsWith('isbn:')) {
            result.isbn = id.substring(5);
            break;
          }
        }
        break;
      }
      case 'series':
        result.series = value;
        break;
      case 'series index':
        result.seriesIndex = parseFloat(value) || undefined;
        break;
      case 'tags':
        result.tags = value.split(',').map(t => t.trim()).filter(t => t.length > 0);
        break;
      case 'comments':
      case 'description':
        result.description = value;
        break;
      case 'published':
      case 'pubdate':
        result.pubdate = value;
        break;
      case 'has cover':
        result.hasCover = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
        break;
    }
  }

  // Determine format from extension
  result.format = getEbookFormat(ext);

  // Default hasCover to false if not found
  if (result.hasCover === undefined) {
    result.hasCover = false;
  }

  return result;
}

/**
 * Get ebook format from extension
 */
function getEbookFormat(ext: string): EbookResult['format'] {
  switch (ext.toLowerCase()) {
    case '.epub': return 'epub';
    case '.mobi': return 'mobi';
    case '.azw': return 'azw';
    case '.azw3': return 'azw3';
    case '.kfx': return 'kfx';
    case '.fb2': return 'fb2';
    case '.pdf': return 'pdf';
    default: return 'other';
  }
}

/**
 * Extract metadata from an ebook file
 *
 * @param filePath - Path to ebook file
 * @returns Extraction result or undefined if extraction failed
 */
export async function extract(filePath: string): Promise<EbookResult | undefined> {
  const ebookMeta = await findEbookMeta();
  if (!ebookMeta) return undefined;

  try {
    // Get file stats
    const stats = await fsp.stat(filePath);
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();

    // Run ebook-meta
    const { stdout } = await execFileAsync(ebookMeta, [filePath], {
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024
    });

    const parsed = parseEbookMetaOutput(stdout, ext);

    return {
      title: parsed.title,
      authors: parsed.authors,
      publisher: parsed.publisher,
      language: parsed.language,
      isbn: parsed.isbn,
      series: parsed.series,
      seriesIndex: parsed.seriesIndex,
      tags: parsed.tags,
      description: parsed.description,
      pubdate: parsed.pubdate,
      format: parsed.format ?? 'other',
      hasCover: parsed.hasCover ?? false,
      fileSize: stats.size,
    };
  } catch {
    return undefined;
  }
}

/**
 * Convert result to XMP rawMetadata format with Ebook_ prefix
 */
export function toRawMetadata(result: EbookResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'Ebook_Format': result.format.toUpperCase(),
    'Ebook_HasCover': result.hasCover,
  };

  if (result.title) {
    metadata['Ebook_Title'] = result.title;
  }

  if (result.authors && result.authors.length > 0) {
    metadata['Ebook_Authors'] = result.authors.join('; ');
    metadata['Ebook_AuthorCount'] = result.authors.length;
  }

  if (result.publisher) {
    metadata['Ebook_Publisher'] = result.publisher;
  }

  if (result.language) {
    metadata['Ebook_Language'] = result.language;
  }

  if (result.isbn) {
    metadata['Ebook_ISBN'] = result.isbn;
  }

  if (result.series) {
    metadata['Ebook_Series'] = result.series;
    if (result.seriesIndex !== undefined) {
      metadata['Ebook_SeriesIndex'] = result.seriesIndex;
    }
  }

  if (result.tags && result.tags.length > 0) {
    metadata['Ebook_Tags'] = result.tags.join('; ');
    metadata['Ebook_TagCount'] = result.tags.length;
  }

  if (result.description) {
    // Truncate long descriptions
    const maxLength = 10000;
    if (result.description.length > maxLength) {
      metadata['Ebook_Description'] = result.description.substring(0, maxLength);
      metadata['Ebook_DescriptionTruncated'] = true;
    } else {
      metadata['Ebook_Description'] = result.description;
    }
  }

  if (result.pubdate) {
    metadata['Ebook_PublishedDate'] = result.pubdate;
  }

  if (result.fileSize) {
    metadata['Ebook_FileSize'] = result.fileSize;
  }

  if (result.pageCount) {
    metadata['Ebook_PageCount'] = result.pageCount;
  }

  return metadata;
}

/**
 * Get tool version information
 */
export async function getVersion(): Promise<string | undefined> {
  const ebookMeta = await findEbookMeta();
  if (!ebookMeta) return undefined;

  try {
    const { stdout } = await execFileAsync(ebookMeta, ['--version'], { timeout: 5000 });
    const match = stdout.match(/ebook-meta.*?(\d+\.\d+(?:\.\d+)?)/i);
    return match ? `calibre ${match[1]}` : 'calibre (version unknown)';
  } catch {
    return 'calibre (version check failed)';
  }
}
