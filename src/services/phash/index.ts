/**
 * Perceptual Hashing Service
 * Compute perceptual hashes for images to detect near-duplicates
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sharp from 'sharp';
import type {
  PerceptualHash,
  SimilarPair,
  SimilarGroup,
  PhashOptions,
  PhashResult,
  PhashCompareResult
} from './schemas.js';

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.gif', '.bmp',
  '.heic', '.heif', '.avif', '.jxl'
]);

/**
 * Compute perceptual hash for an image file
 */
export async function computePhash(
  imagePath: string,
  options: Partial<PhashOptions> = {}
): Promise<PerceptualHash> {
  const startTime = performance.now();
  const algorithm = options.algorithm ?? 'dhash';
  const hashSize = options.hashSize ?? 8;

  // Get image info first
  const metadata = await sharp(imagePath).metadata();
  const format = metadata.format ?? 'unknown';

  let hash: string;

  switch (algorithm) {
    case 'dhash':
      hash = await computeDHash(imagePath, hashSize);
      break;
    case 'ahash':
      hash = await computeAHash(imagePath, hashSize);
      break;
    case 'phash':
      hash = await computePHash(imagePath, hashSize);
      break;
    default:
      throw new Error(`Unsupported algorithm: ${algorithm}`);
  }

  return {
    path: imagePath,
    hash,
    algorithm,
    dimensions: {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0
    },
    format,
    durationMs: performance.now() - startTime
  };
}

/**
 * Compute dHash (difference hash)
 * Compares adjacent horizontal pixels
 * Size 8 produces a 64-bit hash (8x8 grid from 9x8 image)
 */
async function computeDHash(imagePath: string, size: number = 8): Promise<string> {
  // Resize to (size+1) x size and convert to grayscale
  const { data } = await sharp(imagePath)
    .resize(size + 1, size, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Compare adjacent pixels
  let hash = BigInt(0);
  let bitIndex = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const leftPixel = data[y * (size + 1) + x];
      const rightPixel = data[y * (size + 1) + x + 1];

      if (leftPixel < rightPixel) {
        hash |= BigInt(1) << BigInt(bitIndex);
      }
      bitIndex++;
    }
  }

  // Return as 16-char hex string (64 bits)
  return hash.toString(16).padStart(16, '0');
}

/**
 * Compute aHash (average hash)
 * Compares each pixel to the average brightness
 */
async function computeAHash(imagePath: string, size: number = 8): Promise<string> {
  const { data } = await sharp(imagePath)
    .resize(size, size, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Calculate average brightness
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  const avg = sum / data.length;

  // Build hash by comparing to average
  let hash = BigInt(0);
  for (let i = 0; i < data.length; i++) {
    if (data[i] >= avg) {
      hash |= BigInt(1) << BigInt(i);
    }
  }

  return hash.toString(16).padStart(16, '0');
}

/**
 * Compute pHash (perceptual hash using DCT)
 * More robust but slower
 */
async function computePHash(imagePath: string, size: number = 8): Promise<string> {
  // Use a larger image for DCT, then take top-left
  const dctSize = size * 4; // 32x32 for 8x8 output

  const { data } = await sharp(imagePath)
    .resize(dctSize, dctSize, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Simplified DCT: just use the low-frequency components
  // For a proper pHash, you'd implement full DCT
  // This is a simplified version that still works well

  // Compute row-wise DCT coefficients (simplified)
  const dctCoeffs: number[] = [];

  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      let sum = 0;
      for (let y = 0; y < dctSize; y++) {
        for (let x = 0; x < dctSize; x++) {
          const pixel = data[y * dctSize + x];
          sum += pixel *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * dctSize)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * dctSize));
        }
      }
      dctCoeffs.push(sum);
    }
  }

  // Skip the DC coefficient and compute median of remaining
  const acCoeffs = dctCoeffs.slice(1);
  const sorted = [...acCoeffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Build hash
  let hash = BigInt(0);
  for (let i = 0; i < acCoeffs.length && i < 64; i++) {
    if (acCoeffs[i] > median) {
      hash |= BigInt(1) << BigInt(i);
    }
  }

  return hash.toString(16).padStart(16, '0');
}

/**
 * Calculate Hamming distance between two hashes
 */
export function hammingDistance(hash1: string, hash2: string): number {
  // Validate hex string format
  const hexPattern = /^[a-f0-9]+$/i;
  if (!hexPattern.test(hash1) || !hexPattern.test(hash2)) {
    throw new Error('Invalid hash format: must be hexadecimal');
  }

  if (hash1.length !== hash2.length) {
    throw new Error(`Hash length mismatch: ${hash1.length} vs ${hash2.length}`);
  }

  const n1 = BigInt('0x' + hash1);
  const n2 = BigInt('0x' + hash2);
  let xor = n1 ^ n2;
  let distance = 0;

  while (xor > 0) {
    distance += Number(xor & BigInt(1));
    xor >>= BigInt(1);
  }

  return distance;
}

/**
 * Calculate similarity percentage from Hamming distance
 */
export function similarityFromDistance(distance: number, hashBits: number = 64): number {
  return ((hashBits - distance) / hashBits) * 100;
}

/**
 * Compare two images and determine similarity
 */
export async function compareImages(
  file1: string,
  file2: string,
  options: Partial<PhashOptions> = {}
): Promise<PhashCompareResult> {
  const threshold = options.threshold ?? 10;

  const [hash1, hash2] = await Promise.all([
    computePhash(file1, options),
    computePhash(file2, options)
  ]);

  const distance = hammingDistance(hash1.hash, hash2.hash);
  const similarity = similarityFromDistance(distance);

  return {
    file1,
    file2,
    hash1: hash1.hash,
    hash2: hash2.hash,
    distance,
    similarity,
    areSimilar: distance <= threshold
  };
}

/**
 * Find similar images in a directory
 */
export async function findSimilarImages(
  paths: string[],
  options: Partial<PhashOptions> = {}
): Promise<PhashResult> {
  const startTime = performance.now();
  const threshold = options.threshold ?? 10;

  const result: PhashResult = {
    totalImages: 0,
    processedImages: 0,
    similarGroups: [],
    similarPairs: [],
    uniqueImages: 0,
    hashes: [],
    errors: [],
    durationMs: 0
  };

  // Collect image files
  const imageFiles = await collectImageFiles(paths, options.recursive ?? false);
  result.totalImages = imageFiles.length;

  // Compute hashes for all images
  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];

    try {
      const hash = await computePhash(file, options);
      result.hashes.push(hash);
      result.processedImages++;

      if (options.onProgress) {
        options.onProgress(result.processedImages, result.totalImages, file);
      }
    } catch (err) {
      result.errors.push({
        file,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  // Find similar pairs
  const processed = new Set<string>();

  for (let i = 0; i < result.hashes.length; i++) {
    for (let j = i + 1; j < result.hashes.length; j++) {
      const h1 = result.hashes[i];
      const h2 = result.hashes[j];

      const distance = hammingDistance(h1.hash, h2.hash);

      if (distance <= threshold) {
        result.similarPairs.push({
          file1: h1.path,
          file2: h2.path,
          hash1: h1.hash,
          hash2: h2.hash,
          distance,
          similarity: similarityFromDistance(distance)
        });

        processed.add(h1.path);
        processed.add(h2.path);
      }
    }
  }

  // Group similar images
  result.similarGroups = groupSimilarImages(result.similarPairs, threshold);

  // Count unique images
  result.uniqueImages = result.processedImages - processed.size;
  result.durationMs = performance.now() - startTime;

  return result;
}

/**
 * Group similar images using union-find
 */
function groupSimilarImages(pairs: SimilarPair[], threshold: number): SimilarGroup[] {
  // Build adjacency map
  const adjacency = new Map<string, Set<string>>();

  for (const pair of pairs) {
    if (!adjacency.has(pair.file1)) adjacency.set(pair.file1, new Set());
    if (!adjacency.has(pair.file2)) adjacency.set(pair.file2, new Set());

    adjacency.get(pair.file1)!.add(pair.file2);
    adjacency.get(pair.file2)!.add(pair.file1);
  }

  // Find connected components
  const visited = new Set<string>();
  const groups: SimilarGroup[] = [];

  for (const [file] of adjacency) {
    if (visited.has(file)) continue;

    // BFS to find component
    const component: string[] = [];
    const queue = [file];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      component.push(current);

      const neighbors = adjacency.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }

    if (component.length > 1) {
      // Use first file as representative
      const representative = component[0];
      const repHash = pairs.find(p => p.file1 === representative || p.file2 === representative);

      groups.push({
        representative,
        hash: repHash?.hash1 ?? '',
        files: component,
        distances: component.map(f => {
          if (f === representative) return 0;
          const pair = pairs.find(
            p => (p.file1 === representative && p.file2 === f) ||
                 (p.file2 === representative && p.file1 === f)
          );
          return pair?.distance ?? threshold;
        })
      });
    }
  }

  // Sort by group size (largest first)
  groups.sort((a, b) => b.files.length - a.files.length);

  return groups;
}

/**
 * Collect image files from paths
 */
async function collectImageFiles(
  paths: string[],
  recursive: boolean
): Promise<string[]> {
  const files: string[] = [];

  for (const p of paths) {
    const resolved = path.resolve(p);
    const stats = await fs.stat(resolved);

    if (stats.isFile()) {
      const ext = path.extname(resolved).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        files.push(resolved);
      }
    } else if (stats.isDirectory()) {
      const entries = await fs.readdir(resolved, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(resolved, entry.name);

        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (IMAGE_EXTENSIONS.has(ext)) {
            files.push(fullPath);
          }
        } else if (entry.isDirectory() && recursive) {
          const subFiles = await collectImageFiles([fullPath], true);
          files.push(...subFiles);
        }
      }
    }
  }

  return files;
}

// Re-export
export * from './schemas.js';
