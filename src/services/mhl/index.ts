/**
 * MHL (Media Hash List) Service
 * Generates MHL files compatible with professional post-production tools
 * Spec: https://mediahashlist.org/
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { hashMd5, hashXxhash64 } from '../../core/hasher.js';
import { scanDirectory } from '../scanner.js';

// MHL version supported
const MHL_VERSION = '2.0';

export interface MhlHashEntry {
  file: string;
  size: number;
  lastModificationDate: string;
  xxhash64?: string;
  md5?: string;
  hashDate: string;
}

export interface MhlCreatorInfo {
  name: string;
  version: string;
  host: string;
  startDate: string;
  finishDate?: string;
}

export interface MhlDocument {
  version: string;
  creatorInfo: MhlCreatorInfo;
  hashes: MhlHashEntry[];
}

export type MhlAlgorithm = 'xxhash64' | 'md5' | 'both';

export interface MhlGenerateOptions {
  algorithm?: MhlAlgorithm;
  excludePatterns?: string[];
  onProgress?: (current: number, total: number, file: string) => void;
}

/**
 * Generate MHL document from directory
 */
export async function generateMhl(
  sourcePath: string,
  options: MhlGenerateOptions = {}
): Promise<MhlDocument> {
  const { algorithm = 'xxhash64', excludePatterns = [], onProgress } = options;

  const startDate = new Date().toISOString();
  const creatorInfo: MhlCreatorInfo = {
    name: 'wake-n-blake',
    version: '0.1.0',
    host: os.hostname(),
    startDate
  };

  const stats = await fsp.stat(sourcePath);
  let files: string[];

  if (stats.isDirectory()) {
    const scanResult = await scanDirectory(sourcePath, {
      recursive: true,
      excludePatterns
    });
    files = scanResult.files;
  } else {
    files = [sourcePath];
  }

  const hashes: MhlHashEntry[] = [];
  const basePath = stats.isDirectory() ? sourcePath : path.dirname(sourcePath);

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const relativePath = path.relative(basePath, filePath);

    if (onProgress) {
      onProgress(i + 1, files.length, relativePath);
    }

    const fileStats = await fsp.stat(filePath);
    const hashDate = new Date().toISOString();

    const entry: MhlHashEntry = {
      file: relativePath,
      size: fileStats.size,
      lastModificationDate: fileStats.mtime.toISOString(),
      hashDate
    };

    // Compute requested hashes
    if (algorithm === 'xxhash64' || algorithm === 'both') {
      entry.xxhash64 = await hashXxhash64(filePath);
    }

    if (algorithm === 'md5' || algorithm === 'both') {
      entry.md5 = await hashMd5(filePath);
    }

    hashes.push(entry);
  }

  creatorInfo.finishDate = new Date().toISOString();

  return {
    version: MHL_VERSION,
    creatorInfo,
    hashes
  };
}

/**
 * Convert MHL document to XML string
 */
export function mhlToXml(doc: MhlDocument): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<hashlist version="${doc.version}">`
  ];

  // Creator info
  lines.push('  <creatorinfo>');
  lines.push(`    <name>${escapeXml(doc.creatorInfo.name)}</name>`);
  lines.push(`    <version>${escapeXml(doc.creatorInfo.version)}</version>`);
  lines.push(`    <host>${escapeXml(doc.creatorInfo.host)}</host>`);
  lines.push(`    <startdate>${doc.creatorInfo.startDate}</startdate>`);
  if (doc.creatorInfo.finishDate) {
    lines.push(`    <finishdate>${doc.creatorInfo.finishDate}</finishdate>`);
  }
  lines.push('  </creatorinfo>');

  // Hash entries
  for (const hash of doc.hashes) {
    lines.push('  <hash>');
    lines.push(`    <file>${escapeXml(hash.file)}</file>`);
    lines.push(`    <size>${hash.size}</size>`);
    lines.push(`    <lastmodificationdate>${hash.lastModificationDate}</lastmodificationdate>`);
    if (hash.xxhash64) {
      lines.push(`    <xxhash64>${hash.xxhash64}</xxhash64>`);
    }
    if (hash.md5) {
      lines.push(`    <md5>${hash.md5}</md5>`);
    }
    lines.push(`    <hashdate>${hash.hashDate}</hashdate>`);
    lines.push('  </hash>');
  }

  lines.push('</hashlist>');
  return lines.join('\n');
}

/**
 * Write MHL document to file
 */
export async function writeMhl(
  doc: MhlDocument,
  outputPath: string
): Promise<void> {
  const xml = mhlToXml(doc);
  await fsp.writeFile(outputPath, xml, 'utf-8');
}

/**
 * Parse MHL XML file
 */
export async function parseMhl(filePath: string): Promise<MhlDocument> {
  const content = await fsp.readFile(filePath, 'utf-8');
  return parseMhlXml(content);
}

/**
 * Parse MHL XML string
 */
export function parseMhlXml(xml: string): MhlDocument {
  // Extract version
  const versionMatch = xml.match(/<hashlist\s+version="([^"]+)"/);
  const version = versionMatch ? versionMatch[1] : '2.0';

  // Extract creator info
  const creatorInfo: MhlCreatorInfo = {
    name: extractTag(xml, 'name') || 'unknown',
    version: extractTag(xml, 'version') || 'unknown',
    host: extractTag(xml, 'host') || 'unknown',
    startDate: extractTag(xml, 'startdate') || new Date().toISOString()
  };

  const finishDate = extractTag(xml, 'finishdate');
  if (finishDate) {
    creatorInfo.finishDate = finishDate;
  }

  // Extract hash entries
  const hashes: MhlHashEntry[] = [];
  const hashMatches = xml.matchAll(/<hash>([\s\S]*?)<\/hash>/g);

  for (const match of hashMatches) {
    const hashXml = match[1];
    const entry: MhlHashEntry = {
      file: extractTag(hashXml, 'file') || '',
      size: parseInt(extractTag(hashXml, 'size') || '0', 10),
      lastModificationDate: extractTag(hashXml, 'lastmodificationdate') || '',
      hashDate: extractTag(hashXml, 'hashdate') || ''
    };

    const xxhash64 = extractTag(hashXml, 'xxhash64');
    if (xxhash64) entry.xxhash64 = xxhash64;

    const md5 = extractTag(hashXml, 'md5');
    if (md5) entry.md5 = md5;

    hashes.push(entry);
  }

  return { version, creatorInfo, hashes };
}

/**
 * Verify files against MHL document
 */
export async function verifyMhl(
  mhlPath: string,
  basePath?: string,
  options: { onProgress?: (current: number, total: number, file: string, status: 'ok' | 'mismatch' | 'missing') => void } = {}
): Promise<{
  valid: boolean;
  total: number;
  matched: number;
  mismatched: MhlHashEntry[];
  missing: MhlHashEntry[];
}> {
  const doc = await parseMhl(mhlPath);
  const base = basePath || path.dirname(mhlPath);

  const result = {
    valid: true,
    total: doc.hashes.length,
    matched: 0,
    mismatched: [] as MhlHashEntry[],
    missing: [] as MhlHashEntry[]
  };

  for (let i = 0; i < doc.hashes.length; i++) {
    const entry = doc.hashes[i];
    const filePath = path.join(base, entry.file);

    if (options.onProgress) {
      options.onProgress(i + 1, doc.hashes.length, entry.file, 'ok');
    }

    try {
      await fsp.access(filePath);

      // Verify with available hash (prefer xxhash64)
      let match = false;
      if (entry.xxhash64) {
        const computed = await hashXxhash64(filePath);
        match = computed === entry.xxhash64;
      } else if (entry.md5) {
        const computed = await hashMd5(filePath);
        match = computed === entry.md5;
      }

      if (match) {
        result.matched++;
        if (options.onProgress) {
          options.onProgress(i + 1, doc.hashes.length, entry.file, 'ok');
        }
      } else {
        result.mismatched.push(entry);
        result.valid = false;
        if (options.onProgress) {
          options.onProgress(i + 1, doc.hashes.length, entry.file, 'mismatch');
        }
      }
    } catch {
      result.missing.push(entry);
      result.valid = false;
      if (options.onProgress) {
        options.onProgress(i + 1, doc.hashes.length, entry.file, 'missing');
      }
    }
  }

  return result;
}

/**
 * Generate default MHL filename
 */
export function generateMhlFilename(sourcePath: string): string {
  const basename = path.basename(sourcePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${basename}_${timestamp}.mhl`;
}

// Helper: escape XML special characters
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper: extract tag content
function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? unescapeXml(match[1]) : null;
}

// Helper: unescape XML entities
function unescapeXml(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
