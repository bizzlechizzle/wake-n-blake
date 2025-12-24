/**
 * guessit Wrapper
 *
 * Uses guessit CLI for TV/movie filename parsing.
 * Falls back gracefully if guessit is not installed.
 *
 * Install: pip install guessit
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * guessit output structure
 */
export interface GuessitResult {
  title?: string;
  type?: 'episode' | 'movie';
  season?: number;
  episode?: number;
  episode_title?: string;
  year?: number;
  language?: string;
  subtitle_language?: string;
  country?: string;
  release_group?: string;
  screen_size?: string;
  source?: string;
  video_codec?: string;
  audio_codec?: string;
  audio_channels?: string;
  video_profile?: string;
  streaming_service?: string;
  edition?: string;
  proper_count?: number;
  [key: string]: unknown;
}

// Common installation paths
const GUESSIT_PATHS = [
  process.env.GUESSIT_PATH,
  '/opt/homebrew/bin/guessit',      // macOS Homebrew
  '/usr/local/bin/guessit',         // macOS/Linux manual
  '/usr/bin/guessit',               // Linux package managers
  `${process.env.HOME}/.local/bin/guessit`,  // pip install --user
].filter(Boolean) as string[];

let guessitPath: string | null | undefined = undefined;

/**
 * Find guessit binary
 */
export async function findGuessit(): Promise<string | null> {
  if (guessitPath !== undefined) return guessitPath;

  // Check explicit paths
  for (const p of GUESSIT_PATHS) {
    try {
      await fsp.access(p, fs.constants.X_OK);
      guessitPath = p;
      return p;
    } catch {
      // Continue to next path
    }
  }

  // Fallback: search PATH with 'which' command
  try {
    const { stdout } = await execFileAsync('which', ['guessit']);
    const foundPath = stdout.trim();
    if (foundPath) {
      guessitPath = foundPath;
      return foundPath;
    }
  } catch {
    // Not in PATH
  }

  guessitPath = null;
  return null;
}

/**
 * Check if guessit is available
 */
export async function isGuessitAvailable(): Promise<boolean> {
  return (await findGuessit()) !== null;
}

/**
 * Parse filename/path with guessit
 *
 * @param filePath - File path or filename to parse
 * @param options - Optional parsing options
 * @returns Parsed metadata or undefined if guessit unavailable
 */
export async function guess(
  filePath: string,
  options?: { type?: 'episode' | 'movie' }
): Promise<GuessitResult | undefined> {
  const guessit = await findGuessit();
  if (!guessit) return undefined;

  try {
    const args = ['--json'];
    if (options?.type) {
      args.push('-t', options.type);
    }
    // guessit works better with just the filename, not full path
    args.push(path.basename(filePath));

    const { stdout } = await execFileAsync(guessit, args, {
      maxBuffer: 10 * 1024 * 1024,
    });

    return JSON.parse(stdout) as GuessitResult;
  } catch {
    return undefined;
  }
}

/**
 * Parse for episode metadata (TV shows)
 */
export async function guessEpisode(filePath: string): Promise<GuessitResult | undefined> {
  return guess(filePath, { type: 'episode' });
}

/**
 * Parse for movie metadata
 */
export async function guessMovie(filePath: string): Promise<GuessitResult | undefined> {
  return guess(filePath, { type: 'movie' });
}

/**
 * Convert guessit result to flat key-value pairs with Guessit_ prefix
 * for inclusion in XMP rawMetadata
 */
export function toRawMetadata(result: GuessitResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(result)) {
    if (value !== undefined && value !== null) {
      // Convert snake_case to PascalCase for key
      const pascalKey = key
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
      metadata[`Guessit_${pascalKey}`] = value;
    }
  }

  return metadata;
}
