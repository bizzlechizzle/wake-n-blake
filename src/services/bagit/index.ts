/**
 * BagIt RFC 8493 Service
 * Create and verify BagIt packages for long-term preservation
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { hashFile } from '../../core/hasher.js';
import type { BagItAlgorithm, BagItOptions, BagItResult, BagItVerifyResult } from './schemas.js';

const VERSION = '0.1.1';

/**
 * Format bytes as human-readable size
 */
function formatBagSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getBaggingDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Collect files recursively from a directory
 */
async function collectFiles(
  dir: string,
  options: { includeHidden?: boolean; excludePatterns?: string[] } = {}
): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden files unless explicitly included
    if (!options.includeHidden && entry.name.startsWith('.')) {
      continue;
    }

    // Skip excluded patterns
    if (options.excludePatterns?.some(p => matchPattern(entry.name, p))) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isFile()) {
      files.push(fullPath);
    } else if (entry.isDirectory()) {
      const subFiles = await collectFiles(fullPath, options);
      files.push(...subFiles);
    }
  }

  return files;
}

/**
 * Simple pattern matching (supports * wildcard)
 */
function matchPattern(name: string, pattern: string): boolean {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`, 'i').test(name);
}

/**
 * Create a BagIt package from a directory
 *
 * Structure:
 *   bag/
 *     bagit.txt
 *     bag-info.txt
 *     manifest-sha256.txt (or sha512)
 *     tagmanifest-sha256.txt
 *     data/
 *       <payload files>
 */
export async function createBag(
  sourceDir: string,
  options: Partial<BagItOptions> = {}
): Promise<BagItResult> {
  const startTime = performance.now();
  const algorithm: BagItAlgorithm = options.algorithm ?? 'sha256';
  const inPlace = options.inPlace ?? true;

  const resolvedSource = path.resolve(sourceDir);
  const bagPath = options.outputPath ? path.resolve(options.outputPath) : resolvedSource;
  const dataDir = path.join(bagPath, 'data');

  // Verify source exists
  const sourceStats = await fs.stat(resolvedSource);
  if (!sourceStats.isDirectory()) {
    throw new Error(`Source is not a directory: ${resolvedSource}`);
  }

  // Check if already a bag (has bagit.txt)
  try {
    await fs.access(path.join(resolvedSource, 'bagit.txt'));
    throw new Error('Directory is already a BagIt package. Use --verify to check it.');
  } catch (err: unknown) {
    const errObj = err as NodeJS.ErrnoException;
    if (errObj.code !== 'ENOENT') throw err;
  }

  // If outputPath specified and different from source, copy files
  if (options.outputPath && bagPath !== resolvedSource) {
    await fs.mkdir(dataDir, { recursive: true });
    await copyDirectory(resolvedSource, dataDir, options);
  } else if (inPlace) {
    // In-place: move files to data/ subdirectory
    await fs.mkdir(dataDir, { recursive: true });

    const entries = await fs.readdir(resolvedSource, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'data') continue; // Skip the data dir we just created
      const src = path.join(resolvedSource, entry.name);
      const dest = path.join(dataDir, entry.name);
      await fs.rename(src, dest);
    }
  }

  // Collect payload files
  const payloadFiles = await collectFiles(dataDir, {
    includeHidden: options.includeHiddenFiles,
    excludePatterns: options.excludePatterns
  });

  // Hash all payload files
  const manifestLines: string[] = [];
  let totalBytes = 0;
  let processed = 0;

  for (const file of payloadFiles) {
    const relativePath = path.relative(bagPath, file);
    const result = await hashFile(file, algorithm);

    // RFC 8493: hash + two spaces + path (Unix-style forward slashes)
    const unixPath = relativePath.replace(/\\/g, '/');
    manifestLines.push(`${result.hash}  ${unixPath}`);
    totalBytes += result.size;
    processed++;

    if (options.onProgress) {
      options.onProgress(processed, payloadFiles.length, file);
    }
  }

  // Sort manifest lines for consistency
  manifestLines.sort((a, b) => {
    const pathA = a.split('  ')[1];
    const pathB = b.split('  ')[1];
    return pathA.localeCompare(pathB);
  });

  // Calculate Payload-Oxum: octetcount.streamcount
  const payloadOxum = `${totalBytes}.${payloadFiles.length}`;

  // Generate bag-info.txt content
  const bagInfo: Record<string, string> = {
    'Bag-Software-Agent': `wake-n-blake/${VERSION}`,
    'Bagging-Date': getBaggingDate(),
    'Payload-Oxum': payloadOxum,
    'Bag-Size': formatBagSize(totalBytes),
    ...options.bagInfo
  };

  const bagInfoContent = Object.entries(bagInfo)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n') + '\n';

  // Generate bagit.txt content
  const bagitTxtContent = 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n';

  // Write tag files
  const bagitTxtPath = path.join(bagPath, 'bagit.txt');
  const bagInfoPath = path.join(bagPath, 'bag-info.txt');
  const manifestPath = path.join(bagPath, `manifest-${algorithm}.txt`);

  await fs.writeFile(bagitTxtPath, bagitTxtContent, 'utf-8');
  await fs.writeFile(bagInfoPath, bagInfoContent, 'utf-8');
  await fs.writeFile(manifestPath, manifestLines.join('\n') + '\n', 'utf-8');

  // Generate tag manifest (hashes of tag files)
  const tagFiles = [bagitTxtPath, bagInfoPath, manifestPath];
  const tagManifestLines: string[] = [];

  for (const tagFile of tagFiles) {
    const relativePath = path.relative(bagPath, tagFile);
    const result = await hashFile(tagFile, algorithm);
    const unixPath = relativePath.replace(/\\/g, '/');
    tagManifestLines.push(`${result.hash}  ${unixPath}`);
  }

  tagManifestLines.sort((a, b) => {
    const pathA = a.split('  ')[1];
    const pathB = b.split('  ')[1];
    return pathA.localeCompare(pathB);
  });

  const tagManifestPath = path.join(bagPath, `tagmanifest-${algorithm}.txt`);
  await fs.writeFile(tagManifestPath, tagManifestLines.join('\n') + '\n', 'utf-8');

  return {
    bagPath,
    algorithm,
    payloadOxum,
    fileCount: payloadFiles.length,
    totalBytes,
    durationMs: performance.now() - startTime,
    tagFiles: ['bagit.txt', 'bag-info.txt', `manifest-${algorithm}.txt`, `tagmanifest-${algorithm}.txt`],
    payloadManifest: `manifest-${algorithm}.txt`,
    tagManifest: `tagmanifest-${algorithm}.txt`
  };
}

/**
 * Copy directory recursively
 */
async function copyDirectory(
  src: string,
  dest: string,
  options: Partial<BagItOptions>
): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    if (!options.includeHiddenFiles && entry.name.startsWith('.')) continue;
    if (options.excludePatterns?.some(p => matchPattern(entry.name, p))) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    } else if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDirectory(srcPath, destPath, options);
    }
  }
}

/**
 * Verify a BagIt package
 */
export async function verifyBag(
  bagPath: string,
  options: { verbose?: boolean; onProgress?: (current: number, total: number, file: string) => void } = {}
): Promise<BagItVerifyResult> {
  const startTime = performance.now();
  const resolvedBag = path.resolve(bagPath);

  const result: BagItVerifyResult = {
    valid: true,
    bagPath: resolvedBag,
    algorithm: 'sha256',
    payloadValid: true,
    tagFilesValid: true,
    payloadOxumMatch: true,
    totalFiles: 0,
    verifiedFiles: 0,
    missingFiles: [],
    invalidFiles: [],
    extraFiles: [],
    errors: [],
    durationMs: 0
  };

  // Check bagit.txt exists
  const bagitTxtPath = path.join(resolvedBag, 'bagit.txt');
  try {
    const bagitContent = await fs.readFile(bagitTxtPath, 'utf-8');
    if (!bagitContent.includes('BagIt-Version: 1.0')) {
      result.errors.push('Invalid bagit.txt: missing BagIt-Version: 1.0');
      result.valid = false;
    }
  } catch {
    result.errors.push('Missing bagit.txt');
    result.valid = false;
    result.durationMs = performance.now() - startTime;
    return result;
  }

  // Find manifest file
  let manifestPath: string | null = null;
  let algorithm: BagItAlgorithm = 'sha256';

  for (const alg of ['sha256', 'sha512'] as const) {
    const mPath = path.join(resolvedBag, `manifest-${alg}.txt`);
    try {
      await fs.access(mPath);
      manifestPath = mPath;
      algorithm = alg;
      break;
    } catch {
      // Try next algorithm
    }
  }

  if (!manifestPath) {
    result.errors.push('Missing manifest file (manifest-sha256.txt or manifest-sha512.txt)');
    result.valid = false;
    result.durationMs = performance.now() - startTime;
    return result;
  }

  result.algorithm = algorithm;

  // Parse manifest
  const manifestContent = await fs.readFile(manifestPath, 'utf-8');
  const manifestEntries = parseManifest(manifestContent);
  result.totalFiles = manifestEntries.length;

  // Verify payload files
  const verifiedPaths = new Set<string>();
  let actualBytes = 0;

  for (const entry of manifestEntries) {
    const filePath = path.join(resolvedBag, entry.path);
    verifiedPaths.add(entry.path);

    try {
      const fileResult = await hashFile(filePath, algorithm);
      actualBytes += fileResult.size;

      if (fileResult.hash !== entry.hash) {
        result.invalidFiles.push({
          path: entry.path,
          expected: entry.hash,
          actual: fileResult.hash
        });
        result.payloadValid = false;
        result.valid = false;
      } else {
        result.verifiedFiles++;
      }

      if (options.onProgress) {
        options.onProgress(result.verifiedFiles + result.invalidFiles.length, result.totalFiles, entry.path);
      }
    } catch {
      result.missingFiles.push(entry.path);
      result.payloadValid = false;
      result.valid = false;
    }
  }

  // Check for extra files in data/
  const dataDir = path.join(resolvedBag, 'data');
  try {
    const actualFiles = await collectFiles(dataDir);
    for (const file of actualFiles) {
      const relativePath = path.relative(resolvedBag, file).replace(/\\/g, '/');
      if (!verifiedPaths.has(relativePath)) {
        result.extraFiles.push(relativePath);
      }
    }
  } catch {
    // data/ directory doesn't exist
    result.errors.push('Missing data/ directory');
    result.valid = false;
  }

  // Verify Payload-Oxum from bag-info.txt
  const bagInfoPath = path.join(resolvedBag, 'bag-info.txt');
  try {
    const bagInfoContent = await fs.readFile(bagInfoPath, 'utf-8');
    const oxumMatch = bagInfoContent.match(/Payload-Oxum:\s*(\d+)\.(\d+)/);

    if (oxumMatch) {
      const expectedBytes = parseInt(oxumMatch[1], 10);
      const expectedCount = parseInt(oxumMatch[2], 10);

      if (actualBytes !== expectedBytes || manifestEntries.length !== expectedCount) {
        result.payloadOxumMatch = false;
        result.errors.push(
          `Payload-Oxum mismatch: expected ${expectedBytes}.${expectedCount}, got ${actualBytes}.${manifestEntries.length}`
        );
        result.valid = false;
      }
    }
  } catch {
    // bag-info.txt is optional
  }

  // Verify tag manifest
  const tagManifestPath = path.join(resolvedBag, `tagmanifest-${algorithm}.txt`);
  try {
    const tagManifestContent = await fs.readFile(tagManifestPath, 'utf-8');
    const tagEntries = parseManifest(tagManifestContent);

    for (const entry of tagEntries) {
      const filePath = path.join(resolvedBag, entry.path);
      try {
        const fileResult = await hashFile(filePath, algorithm);
        if (fileResult.hash !== entry.hash) {
          result.errors.push(`Tag file hash mismatch: ${entry.path}`);
          result.tagFilesValid = false;
          result.valid = false;
        }
      } catch {
        result.errors.push(`Missing tag file: ${entry.path}`);
        result.tagFilesValid = false;
        result.valid = false;
      }
    }
  } catch {
    // Tag manifest is optional per RFC but we check if present
  }

  result.durationMs = performance.now() - startTime;
  return result;
}

/**
 * Parse a manifest file into entries
 */
function parseManifest(content: string): Array<{ hash: string; path: string }> {
  const entries: Array<{ hash: string; path: string }> = [];
  const lines = content.split('\n').filter(line => line.trim());

  for (const line of lines) {
    // Format: hash<two spaces>path
    const match = line.match(/^([a-f0-9]+)\s{2}(.+)$/);
    if (match) {
      entries.push({ hash: match[1], path: match[2] });
    }
  }

  return entries;
}

// Re-export schemas
export * from './schemas.js';
