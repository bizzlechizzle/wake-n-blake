/**
 * Archive Analysis Wrapper
 *
 * Analyzes archive contents using 7z/p7zip CLI.
 * Extracts file listings, compression info, and detects executables.
 *
 * Install:
 *   macOS:   brew install p7zip
 *   Linux:   apt install p7zip-full
 *   Windows: Install 7-Zip from 7-zip.org
 *
 * @module services/metadata/wrappers/archive
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Archive file entry
 */
export interface ArchiveFileEntry {
  /** File path within archive */
  path: string;
  /** Uncompressed size in bytes */
  size: number;
  /** Compressed size in bytes (if available) */
  compressedSize?: number;
  /** Whether entry is a directory */
  isDirectory: boolean;
  /** File modification date */
  modified?: string;
  /** CRC32 checksum (if available) */
  crc?: string;
  /** File attributes */
  attributes?: string;
}

/**
 * Archive analysis result
 */
export interface ArchiveResult {
  /** Archive format detected */
  format: string;
  /** Total number of files (not directories) */
  fileCount: number;
  /** Total number of directories */
  dirCount: number;
  /** Total uncompressed size in bytes */
  totalUncompressedSize: number;
  /** Total compressed size in bytes (if available) */
  totalCompressedSize?: number;
  /** Compression ratio (0-1, lower = more compressed) */
  compressionRatio?: number;
  /** Whether archive is encrypted/password-protected */
  encrypted: boolean;
  /** File entries (limited to first N entries) */
  files: ArchiveFileEntry[];
  /** Whether archive contains executable files */
  hasExecutables: boolean;
  /** List of executable file paths found */
  executablePaths?: string[];
  /** Whether archive is multi-volume */
  multiVolume: boolean;
  /** Archive comment (if any) */
  comment?: string;
}

// Common installation paths for 7z
const SEVENZIP_PATHS = [
  process.env.SEVENZIP_PATH,
  '/opt/homebrew/bin/7z',
  '/opt/homebrew/bin/7za',
  '/usr/local/bin/7z',
  '/usr/local/bin/7za',
  '/usr/bin/7z',
  '/usr/bin/7za',
  '/usr/bin/7zr',
  'C:\\Program Files\\7-Zip\\7z.exe',
  'C:\\Program Files (x86)\\7-Zip\\7z.exe',
].filter(Boolean) as string[];

let sevenZipPath: string | null | undefined = undefined;

/**
 * Find 7z binary
 */
export async function find7z(): Promise<string | null> {
  if (sevenZipPath !== undefined) return sevenZipPath;

  for (const p of SEVENZIP_PATHS) {
    try {
      await fsp.access(p, fs.constants.X_OK);
      sevenZipPath = p;
      return p;
    } catch {
      // Continue to next path
    }
  }

  // Fallback: search PATH
  for (const cmd of ['7z', '7za', '7zr']) {
    try {
      const { stdout } = await execFileAsync('which', [cmd]);
      const foundPath = stdout.trim();
      if (foundPath) {
        sevenZipPath = foundPath;
        return foundPath;
      }
    } catch {
      // Continue
    }
  }

  sevenZipPath = null;
  return null;
}

/**
 * Check if 7z is available
 */
export async function isArchiveAvailable(): Promise<boolean> {
  return (await find7z()) !== null;
}

/**
 * Executable file extensions
 */
const EXECUTABLE_EXTENSIONS = new Set([
  '.exe', '.dll', '.sys', '.com', '.bat', '.cmd', '.ps1', '.vbs', '.js',
  '.msi', '.scr', '.pif', '.hta', '.cpl', '.msc', '.jar', '.app',
  '.sh', '.bash', '.zsh', '.fish', '.csh', '.ksh',
  '.py', '.rb', '.pl', '.php',
  '.elf', '.so', '.dylib', '.bin',
]);

/**
 * Check if a file path is an executable
 */
function isExecutable(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return EXECUTABLE_EXTENSIONS.has(ext);
}

/**
 * Parse 7z list output (technical format)
 */
function parse7zOutput(output: string): {
  entries: ArchiveFileEntry[];
  format?: string;
  encrypted: boolean;
  multiVolume: boolean;
  comment?: string;
} {
  const entries: ArchiveFileEntry[] = [];
  let format: string | undefined;
  let encrypted = false;
  let multiVolume = false;
  let comment: string | undefined;

  const lines = output.split('\n');
  let headerParsed = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect format from header
    if (trimmed.startsWith('Type = ')) {
      format = trimmed.substring(7).trim();
    }

    // Detect encryption
    if (trimmed.includes('Encrypted = +') || trimmed.includes('Method = ') && trimmed.includes('AES')) {
      encrypted = true;
    }

    // Detect multi-volume
    if (trimmed.includes('Volumes = ') || trimmed.includes('Volume Index')) {
      multiVolume = true;
    }

    // Detect comment
    if (trimmed.startsWith('Comment = ')) {
      comment = trimmed.substring(10).trim();
    }

    // Parse file list section
    // 7z -slt output format:
    // Path = filename
    // Size = 12345
    // Packed Size = 1234
    // Modified = 2024-01-15 10:30:00
    // Attributes = D or A
    // CRC = ABCD1234

    if (trimmed === '----------') {
      if (!headerParsed) {
        headerParsed = true;
        continue;
      }
    }

    if (trimmed.startsWith('Path = ')) {
      const entry: ArchiveFileEntry = {
        path: trimmed.substring(7).trim(),
        size: 0,
        isDirectory: false,
      };
      entries.push(entry);
    }

    if (entries.length > 0) {
      const currentEntry = entries[entries.length - 1];

      if (trimmed.startsWith('Size = ')) {
        currentEntry.size = parseInt(trimmed.substring(7).trim(), 10) || 0;
      } else if (trimmed.startsWith('Packed Size = ')) {
        currentEntry.compressedSize = parseInt(trimmed.substring(14).trim(), 10) || undefined;
      } else if (trimmed.startsWith('Modified = ')) {
        currentEntry.modified = trimmed.substring(11).trim();
      } else if (trimmed.startsWith('Attributes = ')) {
        const attrs = trimmed.substring(13).trim();
        currentEntry.attributes = attrs;
        currentEntry.isDirectory = attrs.includes('D');
      } else if (trimmed.startsWith('CRC = ')) {
        currentEntry.crc = trimmed.substring(6).trim();
      }
    }
  }

  return { entries, format, encrypted, multiVolume, comment };
}

/**
 * Analyze an archive file
 *
 * @param filePath - Path to archive file
 * @param options - Optional settings
 * @returns Analysis result or undefined if analysis failed
 */
export async function analyze(
  filePath: string,
  options?: {
    /** Maximum number of file entries to return */
    maxEntries?: number;
    /** Password for encrypted archives */
    password?: string;
    /** Timeout in milliseconds */
    timeout?: number;
  }
): Promise<ArchiveResult | undefined> {
  const sevenZip = await find7z();
  if (!sevenZip) return undefined;

  const maxEntries = options?.maxEntries ?? 100;
  const timeout = options?.timeout ?? 60000;

  try {
    // Use -slt for technical listing format
    const args = ['l', '-slt', filePath];

    if (options?.password) {
      args.push(`-p${options.password}`);
    }

    const { stdout } = await execFileAsync(sevenZip, args, {
      timeout,
      maxBuffer: 50 * 1024 * 1024
    });

    const { entries, format, encrypted, multiVolume, comment } = parse7zOutput(stdout);

    // Calculate stats
    const files = entries.filter(e => !e.isDirectory);
    const dirs = entries.filter(e => e.isDirectory);

    const totalUncompressedSize = files.reduce((sum, f) => sum + f.size, 0);
    const totalCompressedSize = files
      .filter(f => f.compressedSize !== undefined)
      .reduce((sum, f) => sum + (f.compressedSize ?? 0), 0);

    const compressionRatio = totalUncompressedSize > 0 && totalCompressedSize > 0
      ? totalCompressedSize / totalUncompressedSize
      : undefined;

    // Find executables
    const executablePaths = files
      .filter(f => isExecutable(f.path))
      .map(f => f.path);

    return {
      format: format ?? path.extname(filePath).substring(1).toUpperCase(),
      fileCount: files.length,
      dirCount: dirs.length,
      totalUncompressedSize,
      totalCompressedSize: totalCompressedSize > 0 ? totalCompressedSize : undefined,
      compressionRatio,
      encrypted,
      files: entries.slice(0, maxEntries),
      hasExecutables: executablePaths.length > 0,
      executablePaths: executablePaths.length > 0 ? executablePaths.slice(0, 10) : undefined,
      multiVolume,
      comment,
    };
  } catch (err) {
    // Check if password required
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('password') || message.includes('Wrong password')) {
      return {
        format: path.extname(filePath).substring(1).toUpperCase(),
        fileCount: 0,
        dirCount: 0,
        totalUncompressedSize: 0,
        encrypted: true,
        files: [],
        hasExecutables: false,
        multiVolume: false,
      };
    }
    return undefined;
  }
}

/**
 * Convert result to XMP rawMetadata format with Archive_ prefix
 */
export function toRawMetadata(result: ArchiveResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'Archive_Format': result.format,
    'Archive_FileCount': result.fileCount,
    'Archive_DirectoryCount': result.dirCount,
    'Archive_UncompressedSize': result.totalUncompressedSize,
    'Archive_Encrypted': result.encrypted,
    'Archive_HasExecutables': result.hasExecutables,
    'Archive_MultiVolume': result.multiVolume,
  };

  if (result.totalCompressedSize !== undefined) {
    metadata['Archive_CompressedSize'] = result.totalCompressedSize;
  }

  if (result.compressionRatio !== undefined) {
    metadata['Archive_CompressionRatio'] = Math.round(result.compressionRatio * 100) / 100;
    metadata['Archive_CompressionPercent'] = Math.round((1 - result.compressionRatio) * 100);
  }

  if (result.executablePaths && result.executablePaths.length > 0) {
    metadata['Archive_ExecutableCount'] = result.executablePaths.length;
    metadata['Archive_Executables'] = result.executablePaths.join('; ');
  }

  if (result.comment) {
    metadata['Archive_Comment'] = result.comment;
  }

  // Store file listing (truncated)
  if (result.files.length > 0) {
    const fileList = result.files
      .slice(0, 50)
      .map(f => f.path)
      .join('\n');
    metadata['Archive_FileList'] = fileList;
    if (result.files.length > 50) {
      metadata['Archive_FileListTruncated'] = true;
    }
  }

  return metadata;
}

/**
 * Get 7z version information
 */
export async function getVersion(): Promise<string | undefined> {
  const sevenZip = await find7z();
  if (!sevenZip) return undefined;

  try {
    const { stdout } = await execFileAsync(sevenZip, [], { timeout: 5000 });
    const match = stdout.match(/7-Zip[^\d]*(\d+\.\d+(?:\.\d+)?)/i);
    return match ? `7z ${match[1]}` : '7z (version unknown)';
  } catch {
    return '7z (version check failed)';
  }
}
