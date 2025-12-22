/**
 * Fast hasher - sample-based hashing for large files
 * Hashes first + middle + last sections for quick approximation
 */

import * as fs from 'node:fs';
import { createHash } from 'blake3';

const DEFAULT_SAMPLE_SIZE = 300 * 1024 * 1024; // 300MB
const MIN_SIZE_FOR_SAMPLING = 1024 * 1024 * 1024; // 1GB - files under this get full hash

export interface FastHashOptions {
  sampleSize?: number;        // Size of each sample section in bytes
  threshold?: number;         // Minimum file size to use sampling
  full?: boolean;             // 64-char hash instead of 16-char
}

export interface FastHashResult {
  hash: string;
  size: number;
  sampled: boolean;
  sampleRegions?: Array<{ start: number; end: number }>;
  durationMs: number;
}

/**
 * Fast hash a file using sampling for large files
 */
export async function fastHash(
  filePath: string,
  options: FastHashOptions = {}
): Promise<FastHashResult> {
  const {
    sampleSize = DEFAULT_SAMPLE_SIZE,
    threshold = MIN_SIZE_FOR_SAMPLING,
    full = false
  } = options;

  const startTime = performance.now();
  const stats = await fs.promises.stat(filePath);
  const fileSize = stats.size;

  // Small files get full hash
  if (fileSize < threshold) {
    const hash = await hashFull(filePath, full);
    return {
      hash,
      size: fileSize,
      sampled: false,
      durationMs: performance.now() - startTime
    };
  }

  // Large files get sampled hash
  const result = await hashSampled(filePath, fileSize, sampleSize, full);
  return {
    ...result,
    durationMs: performance.now() - startTime
  };
}

/**
 * Full file hash
 */
async function hashFull(filePath: string, full: boolean): Promise<string> {
  const hasher = createHash();
  const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });

  for await (const chunk of stream) {
    hasher.update(chunk);
  }

  const hex = hasher.digest('hex');
  return full ? hex : hex.slice(0, 16);
}

/**
 * Sample-based hash: first + middle + last sections
 */
async function hashSampled(
  filePath: string,
  fileSize: number,
  sampleSize: number,
  full: boolean
): Promise<Omit<FastHashResult, 'durationMs'>> {
  const hasher = createHash();
  const fd = await fs.promises.open(filePath, 'r');

  try {
    const regions: Array<{ start: number; end: number }> = [];

    // Calculate sample regions
    const firstEnd = Math.min(sampleSize, fileSize);
    const middleStart = Math.max(0, Math.floor(fileSize / 2) - Math.floor(sampleSize / 2));
    const middleEnd = Math.min(middleStart + sampleSize, fileSize);
    const lastStart = Math.max(0, fileSize - sampleSize);

    // First section
    if (firstEnd > 0) {
      await hashRegion(fd, hasher, 0, firstEnd);
      regions.push({ start: 0, end: firstEnd });
    }

    // Middle section (if not overlapping with first)
    if (middleStart > firstEnd) {
      await hashRegion(fd, hasher, middleStart, middleEnd);
      regions.push({ start: middleStart, end: middleEnd });
    }

    // Last section (if not overlapping with middle)
    if (lastStart > middleEnd) {
      await hashRegion(fd, hasher, lastStart, fileSize);
      regions.push({ start: lastStart, end: fileSize });
    }

    // Also hash file size to differentiate files with same content in sampled regions
    const sizeBuffer = Buffer.alloc(8);
    sizeBuffer.writeBigInt64BE(BigInt(fileSize));
    hasher.update(sizeBuffer);

    const hex = hasher.digest('hex');

    return {
      hash: full ? hex : hex.slice(0, 16),
      size: fileSize,
      sampled: true,
      sampleRegions: regions
    };
  } finally {
    await fd.close();
  }
}

/**
 * Hash a specific region of a file
 */
async function hashRegion(
  fd: fs.promises.FileHandle,
  hasher: ReturnType<typeof createHash>,
  start: number,
  end: number
): Promise<void> {
  const chunkSize = 64 * 1024;
  const buffer = Buffer.alloc(chunkSize);
  let position = start;

  while (position < end) {
    const bytesToRead = Math.min(chunkSize, end - position);
    const { bytesRead } = await fd.read(buffer, 0, bytesToRead, position);

    if (bytesRead === 0) break;

    hasher.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
}

/**
 * Batch fast hash multiple files
 */
export async function fastHashBatch(
  files: string[],
  options: FastHashOptions = {},
  onProgress?: (current: number, total: number, file: string) => void
): Promise<FastHashResult[]> {
  const results: FastHashResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onProgress) {
      onProgress(i + 1, files.length, file);
    }

    try {
      const result = await fastHash(file, options);
      results.push(result);
    } catch {
      // Skip files we can't hash
    }
  }

  return results;
}
