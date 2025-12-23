/**
 * Network-safe file copier with inline BLAKE3 hashing
 * Key feature: hash is computed during copy, avoiding double-read
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, type TransformCallback } from 'node:stream';
import { createHash as cryptoHash } from 'node:crypto';
import { createHash as blake3Hash } from 'blake3';
import {
  LOCAL_BUFFER_SIZE,
  NETWORK_BUFFER_SIZE,
  RETRY_CONFIG,
  RETRYABLE_ERRORS
} from './constants.js';
import { isNetworkPath } from '../utils/network.js';
import type { Algorithm } from '../schemas/index.js';

export interface CopyOptions {
  algorithm?: Algorithm;
  verify?: boolean;
  overwrite?: boolean;
  preserveTimestamps?: boolean;
  retries?: number;
  onProgress?: (bytes: number, total: number) => void;
}

export interface CopyResult {
  source: string;
  destination: string;
  hash: string;
  algorithm: Algorithm;
  size: number;
  durationMs: number;
  verified: boolean;
  retries: number;
}

/**
 * Copy file with inline hashing
 * Computes hash during copy (no double-read) with network-aware buffering
 */
export async function copyWithHash(
  source: string,
  destination: string,
  options: CopyOptions = {}
): Promise<CopyResult> {
  const {
    algorithm = 'blake3',
    verify = true,
    overwrite = false,
    preserveTimestamps = true,
    retries = RETRY_CONFIG.attempts,
    onProgress
  } = options;

  const startTime = performance.now();
  let attemptCount = 0;

  // Check if destination exists
  if (!overwrite) {
    try {
      await fs.promises.access(destination);
      throw new Error(`Destination already exists: ${destination}`);
    } catch (err: unknown) {
      const errObj = err as NodeJS.ErrnoException;
      if (errObj.code !== 'ENOENT') throw err;
    }
  }

  // Ensure destination directory exists
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });

  // Get source stats for size and timestamps
  const sourceStats = await fs.promises.stat(source);
  const totalSize = sourceStats.size;

  // Determine buffer size based on network detection
  const isNetwork = isNetworkPath(source) || isNetworkPath(destination);
  const bufferSize = isNetwork ? NETWORK_BUFFER_SIZE : LOCAL_BUFFER_SIZE;

  // Retry loop for network resilience
  let lastError: Error | null = null;

  while (attemptCount < retries) {
    attemptCount++;

    try {
      const hash = await performCopy(
        source,
        destination,
        algorithm,
        bufferSize,
        totalSize,
        onProgress
      );

      // Verify if requested
      let verified = false;
      if (verify) {
        const verifyHash = await hashDestination(destination, algorithm);
        verified = verifyHash === hash;

        if (!verified) {
          // Delete failed copy
          await fs.promises.unlink(destination).catch(() => {});
          throw new Error(`Verification failed: expected ${hash}, got ${verifyHash}`);
        }
      }

      // Preserve timestamps
      if (preserveTimestamps) {
        await fs.promises.utimes(destination, sourceStats.atime, sourceStats.mtime);
      }

      return {
        source,
        destination,
        hash,
        algorithm,
        size: totalSize,
        durationMs: performance.now() - startTime,
        verified,
        retries: attemptCount - 1
      };

    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if retryable
      if (isRetryable(err as NodeJS.ErrnoException) && attemptCount < retries) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(2, attemptCount - 1),
          RETRY_CONFIG.maxDelayMs
        );
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error('Copy failed after retries');
}

/**
 * Perform the actual copy with inline hashing
 */
async function performCopy(
  source: string,
  destination: string,
  algorithm: Algorithm,
  bufferSize: number,
  totalSize: number,
  onProgress?: (bytes: number, total: number) => void
): Promise<string> {
  // Create hasher
  const hasher = createHasher(algorithm);
  let bytesProcessed = 0;

  // Create transform stream for hashing
  const hashTransform = new Transform({
    transform(chunk: Buffer, _encoding: string, callback: TransformCallback) {
      hasher.update(chunk);
      bytesProcessed += chunk.length;

      if (onProgress) {
        onProgress(bytesProcessed, totalSize);
      }

      callback(null, chunk);
    }
  });

  // Create streams
  const readStream = fs.createReadStream(source, { highWaterMark: bufferSize });
  const writeStream = fs.createWriteStream(destination, { highWaterMark: bufferSize });

  // Perform copy with pipeline
  await pipeline(readStream, hashTransform, writeStream);

  // Get hash result
  return finalizeHash(hasher, algorithm);
}

/**
 * Hash destination file for verification
 */
async function hashDestination(filePath: string, algorithm: Algorithm): Promise<string> {
  const hasher = createHasher(algorithm);
  const bufferSize = isNetworkPath(filePath) ? NETWORK_BUFFER_SIZE : LOCAL_BUFFER_SIZE;

  const readStream = fs.createReadStream(filePath, { highWaterMark: bufferSize });

  for await (const chunk of readStream) {
    hasher.update(chunk);
  }

  return finalizeHash(hasher, algorithm);
}

// Hasher interface for both blake3 and crypto
interface Hasher {
  update(data: Buffer): void;
  digest(encoding: 'hex'): string;
}

/**
 * Create appropriate hasher for algorithm
 */
function createHasher(algorithm: Algorithm): Hasher {
  switch (algorithm) {
    case 'blake3':
    case 'blake3-full':
      return blake3Hash() as unknown as Hasher;
    case 'sha256':
      return cryptoHash('sha256');
    case 'sha512':
      return cryptoHash('sha512');
    case 'md5':
      return cryptoHash('md5');
    case 'xxhash64':
      // xxhash64 is not typically used during copy, fall back to blake3
      return blake3Hash() as unknown as Hasher;
  }
}

/**
 * Finalize hash and return hex string
 */
function finalizeHash(hasher: Hasher, algorithm: Algorithm): string {
  const hex = hasher.digest('hex');
  if (algorithm === 'blake3' || algorithm === 'xxhash64') {
    return hex.slice(0, 16);
  }
  return hex;
}

/**
 * Check if error is retryable
 */
function isRetryable(err: NodeJS.ErrnoException): boolean {
  return err.code !== undefined && (RETRYABLE_ERRORS as readonly string[]).includes(err.code);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Batch copy multiple files with inline hashing
 */
export async function copyBatch(
  files: Array<{ source: string; destination: string }>,
  options: CopyOptions & { concurrency?: number } = {}
): Promise<CopyResult[]> {
  const { concurrency = 4, ...copyOptions } = options;
  const results: CopyResult[] = [];
  const errors: Array<{ file: string; error: Error }> = [];

  // Process in batches
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const batchPromises = batch.map(async ({ source, destination }) => {
      try {
        const result = await copyWithHash(source, destination, copyOptions);
        results.push(result);
      } catch (err) {
        errors.push({ file: source, error: err as Error });
      }
    });

    await Promise.all(batchPromises);
  }

  if (errors.length > 0) {
    console.error(`Failed to copy ${errors.length} files:`);
    errors.forEach(({ file, error }) => {
      console.error(`  ${file}: ${error.message}`);
    });
  }

  return results;
}

/**
 * Move file with hash verification
 * Copy + verify + delete source
 */
export async function moveWithHash(
  source: string,
  destination: string,
  options: CopyOptions = {}
): Promise<CopyResult> {
  // Force verification for moves
  const result = await copyWithHash(source, destination, { ...options, verify: true });

  // Only delete source if verified
  if (result.verified) {
    await fs.promises.unlink(source);
  }

  return result;
}
