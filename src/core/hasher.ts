/**
 * Wake-n-Blake Hasher
 * Multi-algorithm file hashing with native b3sum support and WASM fallback
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { createHash as createBlake3Hash } from 'blake3';
import xxhashAddon from 'xxhash-addon';
const { XXHash64 } = xxhashAddon;
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Algorithm, HashResult } from '../schemas/index.js';
import { getBufferSize } from '../utils/network.js';

const execFileAsync = promisify(execFile);

/**
 * Progress callback for hash operations
 * Fires per-chunk for smooth progress updates during large file hashing
 */
export type HashProgressCallback = (bytesProcessed: number, totalBytes: number) => void;

/**
 * Options for hash operations with progress
 */
export interface HashProgressOptions {
  /** Callback fired per-chunk with bytes processed and total */
  onProgress?: HashProgressCallback;
  /** Total file size (required for progress, auto-detected if not provided) */
  totalBytes?: number;
}

// Native b3sum search paths
const B3SUM_PATHS = [
  process.env.WNB_NATIVE_B3SUM,
  '/opt/homebrew/bin/b3sum',
  '/usr/local/bin/b3sum',
  '/usr/bin/b3sum'
].filter(Boolean) as string[];

// Cache for native b3sum path
let nativeB3sumPath: string | null | undefined = undefined;

// Hasher mode: 'auto' (default), 'native', or 'wasm'
let hasherMode: 'auto' | 'native' | 'wasm' = 'auto';

/**
 * Set hasher mode for BLAKE3
 * - 'auto': Try native first, fall back to WASM
 * - 'native': Force native b3sum (fails if not available)
 * - 'wasm': Force WASM (skip native detection)
 */
export function setHasherMode(mode: 'auto' | 'native' | 'wasm'): void {
  hasherMode = mode;
}

/**
 * Get current hasher mode
 */
export function getHasherMode(): 'auto' | 'native' | 'wasm' {
  return hasherMode;
}

/**
 * Find native b3sum binary
 */
export async function findNativeB3sum(): Promise<string | null> {
  if (nativeB3sumPath !== undefined) return nativeB3sumPath;

  // Check explicit paths first
  for (const p of B3SUM_PATHS) {
    try {
      await fsp.access(p, fs.constants.X_OK);
      nativeB3sumPath = p;
      return p;
    } catch {
      // Continue to next path
    }
  }

  // Try PATH using which command (safe - no user input)
  try {
    const { stdout } = await execFileAsync('which', ['b3sum']);
    const foundPath = stdout.trim();
    if (foundPath) {
      nativeB3sumPath = foundPath;
      return foundPath;
    }
  } catch {
    // Not in PATH
  }

  nativeB3sumPath = null;
  return null;
}

/**
 * Check if native b3sum is available
 */
export async function hasNativeB3sum(): Promise<boolean> {
  return (await findNativeB3sum()) !== null;
}

/**
 * Calculate BLAKE3 hash using native b3sum
 * Uses execFile with argument arrays to prevent command injection
 */
async function hashBlake3Native(
  filePath: string,
  truncate: number = 8
): Promise<string> {
  const b3sum = await findNativeB3sum();
  if (!b3sum) throw new Error('Native b3sum not available');

  // Validate truncate is a positive integer to prevent injection
  if (!Number.isInteger(truncate) || truncate < 1 || truncate > 32) {
    throw new Error(`Invalid truncate value: ${truncate}`);
  }

  // Use execFile with argument array to prevent command injection
  const { stdout } = await execFileAsync(b3sum, ['--length', String(truncate), filePath]);
  return stdout.trim().split(/\s+/)[0].toLowerCase();
}

/**
 * Calculate BLAKE3 hash using WASM
 * Supports optional byte-level progress callback for smooth UI updates
 */
async function hashBlake3Wasm(
  filePath: string,
  truncate: number = 8,
  progressOptions?: HashProgressOptions
): Promise<string> {
  // Validate truncate parameter (same as native)
  if (!Number.isInteger(truncate) || truncate < 1 || truncate > 32) {
    throw new Error(`Invalid truncate value: ${truncate}`);
  }

  const bufferSize = getBufferSize(filePath);
  const hasher = createBlake3Hash();

  // Get total size for progress reporting
  let totalBytes = progressOptions?.totalBytes;
  if (progressOptions?.onProgress && totalBytes === undefined) {
    const stats = await fsp.stat(filePath);
    totalBytes = stats.size;
  }

  const stream = fs.createReadStream(filePath, { highWaterMark: bufferSize });
  let bytesProcessed = 0;

  for await (const chunk of stream) {
    hasher.update(chunk);
    bytesProcessed += chunk.length;

    if (progressOptions?.onProgress && totalBytes !== undefined) {
      progressOptions.onProgress(bytesProcessed, totalBytes);
    }
  }

  const fullHash = hasher.digest('hex');
  return fullHash.slice(0, truncate * 2).toLowerCase();
}

/**
 * Options for hashBlake3 function
 */
export interface HashBlake3Options extends HashProgressOptions {
  /** Return full 64-char hash instead of 16-char */
  full?: boolean;
  /** Force WASM mode (skip native b3sum) */
  forceWasm?: boolean;
}

/**
 * Calculate BLAKE3 hash (native with WASM fallback)
 * When onProgress is provided, WASM mode is used for byte-level progress
 */
export async function hashBlake3(
  filePath: string,
  options: HashBlake3Options = {}
): Promise<string> {
  const truncateBytes = options.full ? 32 : 8;

  // Determine mode - if progress callback is requested, force WASM for per-chunk updates
  // Native b3sum doesn't support streaming progress
  const hasProgressCallback = options.onProgress !== undefined;
  const effectiveMode = hasProgressCallback || options.forceWasm ? 'wasm' : hasherMode;

  // Force WASM mode (or required for progress)
  if (effectiveMode === 'wasm' || process.env.WNB_FORCE_WASM) {
    return hashBlake3Wasm(filePath, truncateBytes, options);
  }

  // Force native mode (fail if not available)
  if (effectiveMode === 'native') {
    const b3sum = await findNativeB3sum();
    if (!b3sum) {
      throw new Error('Native b3sum not available. Install b3sum or use --wasm flag.');
    }
    return hashBlake3Native(filePath, truncateBytes);
  }

  // Auto mode: try native first, fall back to WASM
  try {
    return await hashBlake3Native(filePath, truncateBytes);
  } catch {
    return hashBlake3Wasm(filePath, truncateBytes, options);
  }
}

/**
 * Calculate SHA-256 hash with optional progress callback
 */
export async function hashSha256(
  filePath: string,
  progressOptions?: HashProgressOptions
): Promise<string> {
  const bufferSize = getBufferSize(filePath);
  const hasher = crypto.createHash('sha256');

  // Get total size for progress reporting
  let totalBytes = progressOptions?.totalBytes;
  if (progressOptions?.onProgress && totalBytes === undefined) {
    const stats = await fsp.stat(filePath);
    totalBytes = stats.size;
  }

  const stream = fs.createReadStream(filePath, { highWaterMark: bufferSize });
  let bytesProcessed = 0;

  for await (const chunk of stream) {
    hasher.update(chunk);
    bytesProcessed += chunk.length;

    if (progressOptions?.onProgress && totalBytes !== undefined) {
      progressOptions.onProgress(bytesProcessed, totalBytes);
    }
  }

  return hasher.digest('hex').toLowerCase();
}

/**
 * Calculate SHA-512 hash with optional progress callback
 */
export async function hashSha512(
  filePath: string,
  progressOptions?: HashProgressOptions
): Promise<string> {
  const bufferSize = getBufferSize(filePath);
  const hasher = crypto.createHash('sha512');

  // Get total size for progress reporting
  let totalBytes = progressOptions?.totalBytes;
  if (progressOptions?.onProgress && totalBytes === undefined) {
    const stats = await fsp.stat(filePath);
    totalBytes = stats.size;
  }

  const stream = fs.createReadStream(filePath, { highWaterMark: bufferSize });
  let bytesProcessed = 0;

  for await (const chunk of stream) {
    hasher.update(chunk);
    bytesProcessed += chunk.length;

    if (progressOptions?.onProgress && totalBytes !== undefined) {
      progressOptions.onProgress(bytesProcessed, totalBytes);
    }
  }

  return hasher.digest('hex').toLowerCase();
}

/**
 * Calculate MD5 hash (legacy, for MHL compatibility) with optional progress callback
 */
export async function hashMd5(
  filePath: string,
  progressOptions?: HashProgressOptions
): Promise<string> {
  const bufferSize = getBufferSize(filePath);
  const hasher = crypto.createHash('md5');

  // Get total size for progress reporting
  let totalBytes = progressOptions?.totalBytes;
  if (progressOptions?.onProgress && totalBytes === undefined) {
    const stats = await fsp.stat(filePath);
    totalBytes = stats.size;
  }

  const stream = fs.createReadStream(filePath, { highWaterMark: bufferSize });
  let bytesProcessed = 0;

  for await (const chunk of stream) {
    hasher.update(chunk);
    bytesProcessed += chunk.length;

    if (progressOptions?.onProgress && totalBytes !== undefined) {
      progressOptions.onProgress(bytesProcessed, totalBytes);
    }
  }

  return hasher.digest('hex').toLowerCase();
}

/**
 * Calculate xxHash64 hash (fast, for MHL compatibility) with optional progress callback
 */
export async function hashXxhash64(
  filePath: string,
  progressOptions?: HashProgressOptions
): Promise<string> {
  const bufferSize = getBufferSize(filePath);
  // XXHash64 requires a seed buffer (8 bytes for 64-bit seed, use zeros)
  const seed = Buffer.alloc(8);
  const hasher = new XXHash64(seed);

  // Get total size for progress reporting
  let totalBytes = progressOptions?.totalBytes;
  if (progressOptions?.onProgress && totalBytes === undefined) {
    const stats = await fsp.stat(filePath);
    totalBytes = stats.size;
  }

  const stream = fs.createReadStream(filePath, { highWaterMark: bufferSize });
  let bytesProcessed = 0;

  for await (const chunk of stream) {
    hasher.update(chunk);
    bytesProcessed += chunk.length;

    if (progressOptions?.onProgress && totalBytes !== undefined) {
      progressOptions.onProgress(bytesProcessed, totalBytes);
    }
  }

  return hasher.digest().toString('hex').toLowerCase();
}

/**
 * Options for hashFile with progress support
 */
export interface HashFileOptions extends HashProgressOptions {
  /** Algorithm to use (default: blake3) */
  algorithm?: Algorithm;
}

/**
 * Calculate hash using specified algorithm with optional progress callback
 */
export async function hashFile(
  filePath: string,
  algorithmOrOptions: Algorithm | HashFileOptions = 'blake3'
): Promise<HashResult> {
  // Handle both legacy (algorithm string) and new (options object) signatures
  const options: HashFileOptions = typeof algorithmOrOptions === 'string'
    ? { algorithm: algorithmOrOptions }
    : algorithmOrOptions;

  const algorithm = options.algorithm ?? 'blake3';
  const progressOptions: HashProgressOptions = {
    onProgress: options.onProgress,
    totalBytes: options.totalBytes,
  };

  const startTime = performance.now();
  const stats = await fsp.stat(filePath);

  // Pre-populate totalBytes to avoid re-stat in individual hash functions
  if (progressOptions.onProgress && progressOptions.totalBytes === undefined) {
    progressOptions.totalBytes = stats.size;
  }

  let hash: string;

  switch (algorithm) {
    case 'blake3':
      hash = await hashBlake3(filePath, { full: false, ...progressOptions });
      break;
    case 'blake3-full':
      hash = await hashBlake3(filePath, { full: true, ...progressOptions });
      break;
    case 'sha256':
      hash = await hashSha256(filePath, progressOptions);
      break;
    case 'sha512':
      hash = await hashSha512(filePath, progressOptions);
      break;
    case 'md5':
      hash = await hashMd5(filePath, progressOptions);
      break;
    case 'xxhash64':
      hash = await hashXxhash64(filePath, progressOptions);
      break;
    default:
      throw new Error(`Unknown algorithm: ${algorithm}`);
  }

  const durationMs = performance.now() - startTime;

  return {
    path: filePath,
    hash,
    algorithm,
    size: stats.size,
    durationMs
  };
}

/**
 * Calculate hashes using all algorithms
 */
export async function hashFileAll(filePath: string): Promise<{
  blake3: string;
  'blake3-full': string;
  sha256: string;
  sha512: string;
  md5: string;
  xxhash64: string;
  size: number;
  durationMs: number;
}> {
  const startTime = performance.now();
  const stats = await fsp.stat(filePath);

  // Read file once and compute all hashes
  const bufferSize = getBufferSize(filePath);
  const blake3Hasher = createBlake3Hash();
  const sha256Hasher = crypto.createHash('sha256');
  const sha512Hasher = crypto.createHash('sha512');
  const md5Hasher = crypto.createHash('md5');
  const xxhash64Seed = Buffer.alloc(8);
  const xxhash64Hasher = new XXHash64(xxhash64Seed);

  const stream = fs.createReadStream(filePath, { highWaterMark: bufferSize });

  for await (const chunk of stream) {
    blake3Hasher.update(chunk);
    sha256Hasher.update(chunk);
    sha512Hasher.update(chunk);
    md5Hasher.update(chunk);
    xxhash64Hasher.update(chunk);
  }

  const blake3Full = blake3Hasher.digest('hex').toLowerCase();

  return {
    blake3: blake3Full.slice(0, 16),
    'blake3-full': blake3Full,
    sha256: sha256Hasher.digest('hex').toLowerCase(),
    sha512: sha512Hasher.digest('hex').toLowerCase(),
    md5: md5Hasher.digest('hex').toLowerCase(),
    xxhash64: xxhash64Hasher.digest().toString('hex').toLowerCase(),
    size: stats.size,
    durationMs: performance.now() - startTime
  };
}

/**
 * Calculate BLAKE3 hash from buffer
 */
export function hashBuffer(buffer: Buffer, full: boolean = false): string {
  const hasher = createBlake3Hash();
  hasher.update(buffer);
  const hash = hasher.digest('hex').toLowerCase();
  return full ? hash : hash.slice(0, 16);
}

/**
 * Calculate BLAKE3 hash from string
 */
export function hashString(str: string, full: boolean = false): string {
  return hashBuffer(Buffer.from(str, 'utf-8'), full);
}

/**
 * Verify file against expected hash
 */
export async function verifyFile(
  filePath: string,
  expectedHash: string,
  algorithm?: Algorithm
): Promise<{ match: boolean; actual: string; algorithm: Algorithm }> {
  // Auto-detect algorithm from hash length if not specified
  if (!algorithm) {
    switch (expectedHash.length) {
      case 16:
        algorithm = 'blake3'; // Could also be xxhash64 - use explicit algorithm if needed
        break;
      case 32:
        algorithm = 'md5';
        break;
      case 64:
        algorithm = 'sha256'; // Could also be blake3-full
        break;
      case 128:
        algorithm = 'sha512';
        break;
      default:
        throw new Error(`Cannot detect algorithm for hash length ${expectedHash.length}`);
    }
  }

  const result = await hashFile(filePath, algorithm);

  return {
    match: result.hash.toLowerCase() === expectedHash.toLowerCase(),
    actual: result.hash,
    algorithm
  };
}

/**
 * Progress callback for batch operations
 * Provides aggregated byte-level progress across all files
 */
export type BatchProgressCallback = (
  bytesProcessed: number,
  totalBytes: number,
  filesCompleted: number,
  totalFiles: number,
  currentFile: string
) => void;

/**
 * Options for batch hashing with byte-level progress
 */
export interface HashBatchOptions {
  /** Algorithm to use (default: blake3) */
  algorithm?: Algorithm;
  /** Full hash (64 chars for blake3) */
  full?: boolean;
  /** Byte-level progress callback - fires per-chunk for smooth UI updates */
  onProgress?: BatchProgressCallback;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Result of batch hash operation
 */
export interface HashBatchResult {
  path: string;
  hash: string | null;
  error: string | null;
  size: number;
}

/**
 * Hash multiple files with aggregated byte-level progress
 * Provides smooth progress updates by firing per-chunk across all files
 *
 * @example
 * ```ts
 * await hashBatch(files, {
 *   onProgress: (bytesProcessed, totalBytes, filesCompleted, totalFiles, currentFile) => {
 *     const percent = (bytesProcessed / totalBytes) * 100;
 *     console.log(`${percent.toFixed(1)}% - ${currentFile}`);
 *   }
 * });
 * ```
 */
export async function hashBatch(
  filePaths: string[],
  options: HashBatchOptions = {}
): Promise<HashBatchResult[]> {
  const { algorithm = 'blake3', full = false, onProgress, signal } = options;
  const results: HashBatchResult[] = [];

  // Calculate total bytes upfront for accurate progress
  let totalBytes = 0;
  const fileSizes: number[] = [];

  for (const filePath of filePaths) {
    try {
      const stats = await fsp.stat(filePath);
      fileSizes.push(stats.size);
      totalBytes += stats.size;
    } catch {
      fileSizes.push(0);
    }
  }

  let bytesProcessed = 0;
  let filesCompleted = 0;

  for (let i = 0; i < filePaths.length; i++) {
    if (signal?.aborted) {
      throw new Error('Hashing cancelled');
    }

    const filePath = filePaths[i];
    const fileSize = fileSizes[i];
    const fileBytesStart = bytesProcessed;

    try {
      // Create per-file progress callback that aggregates into batch progress
      const fileProgressCallback: HashProgressCallback | undefined = onProgress
        ? (fileBytesProcessed: number, _fileTotalBytes: number) => {
            onProgress(
              fileBytesStart + fileBytesProcessed,
              totalBytes,
              filesCompleted,
              filePaths.length,
              filePath
            );
          }
        : undefined;

      let hash: string;
      if (algorithm === 'blake3' || algorithm === 'blake3-full') {
        hash = await hashBlake3(filePath, {
          full: full || algorithm === 'blake3-full',
          onProgress: fileProgressCallback,
          totalBytes: fileSize,
        });
      } else {
        hash = await hashFile(filePath, {
          algorithm,
          onProgress: fileProgressCallback,
          totalBytes: fileSize,
        }).then(r => r.hash);
      }

      results.push({ path: filePath, hash, error: null, size: fileSize });
      bytesProcessed += fileSize;
      filesCompleted++;

      // Final progress update for this file
      if (onProgress) {
        onProgress(bytesProcessed, totalBytes, filesCompleted, filePaths.length, filePath);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ path: filePath, hash: null, error, size: fileSize });
      bytesProcessed += fileSize;
      filesCompleted++;

      if (onProgress) {
        onProgress(bytesProcessed, totalBytes, filesCompleted, filePaths.length, filePath);
      }
    }
  }

  return results;
}
