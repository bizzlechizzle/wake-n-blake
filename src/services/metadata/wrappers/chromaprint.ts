/**
 * Chromaprint/fpcalc Wrapper
 *
 * Generates acoustic fingerprints for audio files using the Chromaprint library.
 * Fingerprints can be used to identify songs via AcoustID database.
 *
 * Install: brew install chromaprint (macOS) or apt install libchromaprint-tools (Linux)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';

const execFileAsync = promisify(execFile);

/**
 * Chromaprint fingerprint result
 */
export interface ChromaprintResult {
  /** Raw fingerprint string (compressed) */
  fingerprint: string;
  /** Duration of analyzed audio in seconds */
  duration: number;
  /** MD5 hash of raw fingerprint for quick comparison */
  fingerprintHash?: string;
}

// Common installation paths for fpcalc
const FPCALC_PATHS = [
  process.env.FPCALC_PATH,
  '/opt/homebrew/bin/fpcalc',      // macOS Homebrew ARM
  '/usr/local/bin/fpcalc',         // macOS Homebrew Intel / Linux manual
  '/usr/bin/fpcalc',               // Linux package managers
  `${process.env.HOME}/.local/bin/fpcalc`,  // User install
].filter(Boolean) as string[];

let fpcalcPath: string | null | undefined = undefined;

/**
 * Find fpcalc binary
 */
export async function findFpcalc(): Promise<string | null> {
  if (fpcalcPath !== undefined) return fpcalcPath;

  // Check explicit paths
  for (const p of FPCALC_PATHS) {
    try {
      await fsp.access(p, fs.constants.X_OK);
      fpcalcPath = p;
      return p;
    } catch {
      // Continue to next path
    }
  }

  // Fallback: search PATH with 'which' command
  try {
    const { stdout } = await execFileAsync('which', ['fpcalc']);
    const foundPath = stdout.trim();
    if (foundPath) {
      fpcalcPath = foundPath;
      return foundPath;
    }
  } catch {
    // Not in PATH
  }

  fpcalcPath = null;
  return null;
}

/**
 * Check if fpcalc (Chromaprint) is available
 */
export async function isChromaprintAvailable(): Promise<boolean> {
  return (await findFpcalc()) !== null;
}

/**
 * Generate acoustic fingerprint for an audio file
 *
 * @param filePath - Path to audio file
 * @param options - Optional settings
 * @returns Chromaprint result or undefined if unavailable
 */
export async function fingerprint(
  filePath: string,
  options?: {
    /** Maximum duration to analyze in seconds (default: full file, max 120) */
    maxDuration?: number;
    /** Output raw fingerprint (uncompressed) instead of compressed */
    raw?: boolean;
  }
): Promise<ChromaprintResult | undefined> {
  const fpcalc = await findFpcalc();
  if (!fpcalc) return undefined;

  try {
    const args: string[] = ['-json'];

    // Limit duration if specified (max 120 seconds for AcoustID compatibility)
    if (options?.maxDuration) {
      args.push('-length', String(Math.min(options.maxDuration, 120)));
    }

    // Raw fingerprint output (larger but more precise)
    if (options?.raw) {
      args.push('-raw');
    }

    args.push(filePath);

    const { stdout } = await execFileAsync(fpcalc, args, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000  // 60 second timeout
    });

    const result = JSON.parse(stdout);

    if (!result.fingerprint || result.duration === undefined) {
      return undefined;
    }

    return {
      fingerprint: result.fingerprint,
      duration: result.duration
    };
  } catch {
    return undefined;
  }
}

/**
 * Generate fingerprints for multiple files in batch
 *
 * @param filePaths - Array of file paths
 * @param options - Optional settings
 * @returns Map of file path to fingerprint result
 */
export async function fingerprintBatch(
  filePaths: string[],
  options?: {
    maxDuration?: number;
    raw?: boolean;
    /** Maximum concurrent fingerprinting operations */
    concurrency?: number;
  }
): Promise<Map<string, ChromaprintResult | undefined>> {
  const results = new Map<string, ChromaprintResult | undefined>();
  const concurrency = options?.concurrency || 4;

  // Process in batches
  for (let i = 0; i < filePaths.length; i += concurrency) {
    const batch = filePaths.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (fp) => {
        const result = await fingerprint(fp, options);
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
 * Compare two fingerprints for similarity
 * Note: This is a basic comparison - for proper matching, use AcoustID API
 *
 * @param fp1 - First fingerprint
 * @param fp2 - Second fingerprint
 * @returns Similarity score (0-1) or undefined if comparison failed
 */
export function compareFingerprints(fp1: string, fp2: string): number | undefined {
  // Basic string similarity - not suitable for actual audio matching
  // Real matching requires the AcoustID algorithm or API
  if (!fp1 || !fp2) return undefined;

  // Simple Jaccard-like similarity for demonstration
  // In practice, use AcoustID's matching algorithm
  const set1 = new Set(fp1.split(''));
  const set2 = new Set(fp2.split(''));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Convert chromaprint result to flat key-value pairs with Chromaprint_ prefix
 * for inclusion in XMP rawMetadata
 */
export function toRawMetadata(result: ChromaprintResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'Chromaprint_Fingerprint': result.fingerprint,
    'Chromaprint_Duration': result.duration,
    'Chromaprint_Version': '1'  // Chromaprint algorithm version
  };

  if (result.fingerprintHash) {
    metadata['Chromaprint_Hash'] = result.fingerprintHash;
  }

  return metadata;
}

/**
 * Build AcoustID lookup URL (for manual lookup - no automatic queries)
 *
 * @param result - Chromaprint result
 * @param clientId - Optional AcoustID client ID
 * @returns URL string for AcoustID API lookup
 */
export function buildAcoustIdUrl(result: ChromaprintResult, clientId?: string): string {
  const params = new URLSearchParams({
    client: clientId || 'YOUR_CLIENT_ID',
    duration: String(Math.round(result.duration)),
    fingerprint: result.fingerprint,
    meta: 'recordings+releasegroups+compress'
  });

  return `https://api.acoustid.org/v2/lookup?${params.toString()}`;
}
