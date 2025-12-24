/**
 * Perceptual Hash Wrapper
 *
 * Generates perceptual hashes for images using Python imagehash library.
 * Perceptual hashes can identify similar or duplicate images even after
 * transformations like resizing, cropping, or color adjustments.
 *
 * Install:
 *   pip install imagehash Pillow
 *
 * Hash types:
 *   - pHash (phash): Perceptual hash using DCT - best for general similarity
 *   - dHash (dhash): Difference hash - good for detecting resized images
 *   - aHash (ahash): Average hash - fast but less accurate
 *   - wHash (whash): Wavelet hash - good for detecting crop/rotation
 *
 * @module services/metadata/wrappers/perceptual-hash
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Perceptual hash result
 */
export interface PerceptualHashResult {
  /** Perceptual hash (DCT-based) - 64-bit hex string */
  phash: string;
  /** Difference hash - 64-bit hex string */
  dhash: string;
  /** Average hash - 64-bit hex string */
  ahash?: string;
  /** Wavelet hash - 64-bit hex string */
  whash?: string;
  /** Image dimensions */
  imageSize: {
    width: number;
    height: number;
  };
  /** Color mode (RGB, RGBA, L, etc.) */
  colorMode?: string;
}

// Python script for hash generation
const PHASH_SCRIPT = `
import sys
import json
import imagehash
from PIL import Image

try:
    img = Image.open(sys.argv[1])
    width, height = img.size
    mode = img.mode

    # Generate hashes (convert to hex strings)
    phash = str(imagehash.phash(img))
    dhash = str(imagehash.dhash(img))
    ahash = str(imagehash.average_hash(img))
    whash = str(imagehash.whash(img))

    result = {
        'phash': phash,
        'dhash': dhash,
        'ahash': ahash,
        'whash': whash,
        'width': width,
        'height': height,
        'colorMode': mode
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

// Faster script with just phash and dhash (most useful)
const PHASH_FAST_SCRIPT = `
import sys
import json
import imagehash
from PIL import Image

try:
    img = Image.open(sys.argv[1])
    width, height = img.size

    result = {
        'phash': str(imagehash.phash(img)),
        'dhash': str(imagehash.dhash(img)),
        'width': width,
        'height': height
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

let hasImagehash: boolean | undefined;

/**
 * Check if imagehash library is available
 */
export async function isPerceptualHashAvailable(): Promise<boolean> {
  if (hasImagehash !== undefined) return hasImagehash;

  try {
    await execFileAsync('python3', ['-c', 'import imagehash; from PIL import Image'], {
      timeout: 5000
    });
    hasImagehash = true;
  } catch {
    hasImagehash = false;
  }
  return hasImagehash;
}

/**
 * Compute perceptual hashes for an image
 *
 * @param filePath - Path to image file
 * @param options - Optional settings
 * @returns Hash result or undefined if computation failed
 */
export async function compute(
  filePath: string,
  options?: {
    /** Include all hash types (slower) */
    allHashes?: boolean;
    /** Timeout in milliseconds */
    timeout?: number;
  }
): Promise<PerceptualHashResult | undefined> {
  if (!(await isPerceptualHashAvailable())) return undefined;

  const script = options?.allHashes ? PHASH_SCRIPT : PHASH_FAST_SCRIPT;
  const timeout = options?.timeout ?? 30000;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', script, filePath], {
      timeout,
      maxBuffer: 10 * 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.error) return undefined;

    return {
      phash: result.phash,
      dhash: result.dhash,
      ahash: result.ahash,
      whash: result.whash,
      imageSize: {
        width: result.width,
        height: result.height,
      },
      colorMode: result.colorMode,
    };
  } catch {
    return undefined;
  }
}

/**
 * Compute perceptual hashes for multiple images in batch
 *
 * @param filePaths - Array of image file paths
 * @param options - Optional settings
 * @returns Map of file path to hash result
 */
export async function computeBatch(
  filePaths: string[],
  options?: {
    allHashes?: boolean;
    timeout?: number;
    concurrency?: number;
  }
): Promise<Map<string, PerceptualHashResult | undefined>> {
  const results = new Map<string, PerceptualHashResult | undefined>();
  const concurrency = options?.concurrency ?? 4;

  // Process in batches
  for (let i = 0; i < filePaths.length; i += concurrency) {
    const batch = filePaths.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (fp) => {
        const result = await compute(fp, options);
        return { path: fp, result };
      })
    );

    for (const { path, result } of batchResults) {
      results.set(path, result);
    }
  }

  return results;
}

/**
 * Calculate Hamming distance between two perceptual hashes
 *
 * @param hash1 - First hash (hex string)
 * @param hash2 - Second hash (hex string)
 * @returns Number of differing bits (0 = identical, higher = more different)
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error('Hash lengths must match');
  }

  let distance = 0;

  // Convert hex to binary and count differences
  for (let i = 0; i < hash1.length; i++) {
    const b1 = parseInt(hash1[i], 16);
    const b2 = parseInt(hash2[i], 16);
    const xor = b1 ^ b2;

    // Count set bits in XOR result
    let bits = xor;
    while (bits > 0) {
      distance += bits & 1;
      bits >>= 1;
    }
  }

  return distance;
}

/**
 * Check if two images are similar based on perceptual hash
 *
 * @param hash1 - First hash (hex string)
 * @param hash2 - Second hash (hex string)
 * @param threshold - Maximum Hamming distance to consider similar (default: 10)
 * @returns Whether images are similar
 */
export function areSimilar(hash1: string, hash2: string, threshold = 10): boolean {
  return hammingDistance(hash1, hash2) <= threshold;
}

/**
 * Calculate similarity score between two hashes
 *
 * @param hash1 - First hash (hex string)
 * @param hash2 - Second hash (hex string)
 * @returns Similarity score (0.0 = different, 1.0 = identical)
 */
export function similarityScore(hash1: string, hash2: string): number {
  const distance = hammingDistance(hash1, hash2);
  const maxBits = hash1.length * 4; // 4 bits per hex character
  return 1 - (distance / maxBits);
}

/**
 * Convert result to XMP rawMetadata format with PHash_ prefix
 */
export function toRawMetadata(result: PerceptualHashResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'PHash_Perceptual': result.phash,
    'PHash_Difference': result.dhash,
    'PHash_ImageWidth': result.imageSize.width,
    'PHash_ImageHeight': result.imageSize.height,
  };

  if (result.ahash) {
    metadata['PHash_Average'] = result.ahash;
  }

  if (result.whash) {
    metadata['PHash_Wavelet'] = result.whash;
  }

  if (result.colorMode) {
    metadata['PHash_ColorMode'] = result.colorMode;
  }

  // Add aspect ratio
  if (result.imageSize.width > 0 && result.imageSize.height > 0) {
    const aspectRatio = result.imageSize.width / result.imageSize.height;
    metadata['PHash_AspectRatio'] = Math.round(aspectRatio * 100) / 100;
  }

  return metadata;
}

/**
 * Get version information
 */
export async function getVersion(): Promise<string | undefined> {
  if (!(await isPerceptualHashAvailable())) return undefined;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', 'import imagehash; print(imagehash.__version__)'], {
      timeout: 5000
    });
    return `imagehash ${stdout.trim()}`;
  } catch {
    return 'imagehash (version unknown)';
  }
}
