/**
 * Deduplicator service
 * Find and manage duplicate files by hash
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { hashFile } from '../core/hasher.js';
import { scanDirectory } from './scanner.js';

export interface DuplicateGroup {
  hash: string;
  size: number;
  files: string[];
}

export interface DedupResult {
  totalFiles: number;
  uniqueFiles: number;
  duplicateGroups: DuplicateGroup[];
  duplicateCount: number;
  wastedBytes: number;
  durationMs: number;
}

export interface DedupOptions {
  recursive?: boolean;
  minSize?: number;
  excludePatterns?: string[];
  onProgress?: (current: number, total: number, file: string) => void;
}

/**
 * Find duplicate files in a directory
 */
export async function findDuplicates(
  dir: string,
  options: DedupOptions = {}
): Promise<DedupResult> {
  const startTime = performance.now();
  const { recursive = true, minSize = 1, excludePatterns, onProgress } = options;

  // Scan directory
  const scanResult = await scanDirectory(dir, {
    recursive,
    minSize,
    excludePatterns
  });

  const files = scanResult.files;
  const hashMap = new Map<string, { size: number; files: string[] }>();

  // Hash all files
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (onProgress) {
      onProgress(i + 1, files.length, file);
    }

    try {
      const result = await hashFile(file, 'blake3');

      if (hashMap.has(result.hash)) {
        hashMap.get(result.hash)!.files.push(file);
      } else {
        hashMap.set(result.hash, { size: result.size, files: [file] });
      }
    } catch {
      // Skip files we can't hash
    }
  }

  // Find duplicates (groups with more than 1 file)
  const duplicateGroups: DuplicateGroup[] = [];
  let wastedBytes = 0;

  for (const [hash, data] of hashMap) {
    if (data.files.length > 1) {
      duplicateGroups.push({
        hash,
        size: data.size,
        files: data.files.sort()
      });
      // Wasted bytes = (count - 1) * size
      wastedBytes += (data.files.length - 1) * data.size;
    }
  }

  // Sort by wasted space (largest first)
  duplicateGroups.sort((a, b) => {
    const aWaste = (a.files.length - 1) * a.size;
    const bWaste = (b.files.length - 1) * b.size;
    return bWaste - aWaste;
  });

  const duplicateCount = duplicateGroups.reduce(
    (sum, g) => sum + g.files.length - 1,
    0
  );

  return {
    totalFiles: files.length,
    uniqueFiles: hashMap.size,
    duplicateGroups,
    duplicateCount,
    wastedBytes,
    durationMs: performance.now() - startTime
  };
}

/**
 * Replace duplicate files with hardlinks
 * Keeps the first file, replaces others with hardlinks
 */
export async function linkDuplicates(
  duplicateGroups: DuplicateGroup[],
  dryRun: boolean = true
): Promise<{ linked: number; errors: Array<{ path: string; error: string }> }> {
  let linked = 0;
  const errors: Array<{ path: string; error: string }> = [];

  for (const group of duplicateGroups) {
    const [original, ...duplicates] = group.files;

    for (const dup of duplicates) {
      if (dryRun) {
        console.log(`Would link: ${dup} -> ${original}`);
        linked++;
      } else {
        try {
          // Remove duplicate
          await fs.unlink(dup);
          // Create hardlink
          await fs.link(original, dup);
          linked++;
        } catch (err: any) {
          errors.push({ path: dup, error: err.message });
        }
      }
    }
  }

  return { linked, errors };
}

/**
 * Delete duplicate files (keeping first of each group)
 */
export async function deleteDuplicates(
  duplicateGroups: DuplicateGroup[],
  dryRun: boolean = true
): Promise<{ deleted: number; freedBytes: number; errors: Array<{ path: string; error: string }> }> {
  let deleted = 0;
  let freedBytes = 0;
  const errors: Array<{ path: string; error: string }> = [];

  for (const group of duplicateGroups) {
    const [_original, ...duplicates] = group.files;

    for (const dup of duplicates) {
      if (dryRun) {
        console.log(`Would delete: ${dup}`);
        deleted++;
        freedBytes += group.size;
      } else {
        try {
          await fs.unlink(dup);
          deleted++;
          freedBytes += group.size;
        } catch (err: any) {
          errors.push({ path: dup, error: err.message });
        }
      }
    }
  }

  return { deleted, freedBytes, errors };
}
