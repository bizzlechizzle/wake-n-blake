/**
 * File scanner service
 * Enumerates files with .wnbignore support
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadIgnorePatterns, createIgnore } from '../utils/ignore.js';

export interface ScanOptions {
  recursive?: boolean;
  includeHidden?: boolean;
  excludePatterns?: string[];
  includePatterns?: string[];
  minSize?: number;
  maxSize?: number;
  followSymlinks?: boolean;
}

export interface ScanResult {
  files: string[];
  directories: string[];
  totalSize: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
}

export interface FileInfo {
  path: string;
  size: number;
  mtime: Date;
  isSymlink: boolean;
}

/**
 * Scan directory for files
 */
export async function scanDirectory(
  dir: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const {
    recursive = true,
    includeHidden = false,
    excludePatterns = [],
    minSize,
    maxSize,
    followSymlinks = false
  } = options;

  const resolvedDir = path.resolve(dir);

  // Load ignore patterns
  const ig = excludePatterns.length > 0
    ? createIgnore(excludePatterns)
    : await loadIgnorePatterns(resolvedDir);

  const result: ScanResult = {
    files: [],
    directories: [],
    totalSize: 0,
    skipped: 0,
    errors: []
  };

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (err: any) {
      result.errors.push({ path: currentDir, error: err.message });
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(resolvedDir, fullPath);

      // Skip hidden files unless requested
      if (!includeHidden && entry.name.startsWith('.')) {
        result.skipped++;
        continue;
      }

      // Check ignore patterns
      if (ig.ignores(relativePath)) {
        result.skipped++;
        continue;
      }

      // Handle symlinks
      let isDirectory = entry.isDirectory();
      let isFile = entry.isFile();

      if (entry.isSymbolicLink()) {
        if (!followSymlinks) {
          result.skipped++;
          continue;
        }
        try {
          const stats = await fs.stat(fullPath);
          isDirectory = stats.isDirectory();
          isFile = stats.isFile();
        } catch {
          result.skipped++;
          continue;
        }
      }

      if (isFile) {
        // Check size constraints
        if (minSize !== undefined || maxSize !== undefined) {
          try {
            const stats = await fs.stat(fullPath);
            if (minSize !== undefined && stats.size < minSize) {
              result.skipped++;
              continue;
            }
            if (maxSize !== undefined && stats.size > maxSize) {
              result.skipped++;
              continue;
            }
            result.totalSize += stats.size;
          } catch (err: any) {
            result.errors.push({ path: fullPath, error: err.message });
            continue;
          }
        }

        result.files.push(fullPath);
      } else if (isDirectory) {
        result.directories.push(fullPath);
        if (recursive) {
          await walk(fullPath);
        }
      }
    }
  }

  await walk(resolvedDir);
  result.files.sort();
  result.directories.sort();

  return result;
}

/**
 * Get detailed file info for a list of files
 */
export async function getFileInfos(files: string[]): Promise<FileInfo[]> {
  const infos: FileInfo[] = [];

  for (const file of files) {
    try {
      const stats = await fs.lstat(file);
      infos.push({
        path: file,
        size: stats.size,
        mtime: stats.mtime,
        isSymlink: stats.isSymbolicLink()
      });
    } catch {
      // Skip files we can't stat
    }
  }

  return infos;
}

/**
 * Scan and return file infos in one call
 */
export async function scanWithInfo(
  dir: string,
  options: ScanOptions = {}
): Promise<{ result: ScanResult; infos: FileInfo[] }> {
  const result = await scanDirectory(dir, options);
  const infos = await getFileInfos(result.files);
  return { result, infos };
}
