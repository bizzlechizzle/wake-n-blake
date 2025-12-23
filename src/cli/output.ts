/**
 * Output formatters for CLI
 */

import type { HashResult, Algorithm } from '../schemas/index.js';

export type OutputFormat = 'text' | 'json' | 'csv' | 'bsd' | 'sfv';

/**
 * Format hash result for output
 */
export function formatHashResult(
  result: HashResult,
  format: OutputFormat = 'text'
): string {
  switch (format) {
    case 'text':
      return `${result.hash}  ${result.path}`;

    case 'json':
      return JSON.stringify(result);

    case 'csv':
      return `${result.path},${result.hash},${result.algorithm},${result.size}`;

    case 'bsd':
      return `${algorithmLabel(result.algorithm)} (${result.path}) = ${result.hash}`;

    case 'sfv':
      return `${result.path} ${result.hash}`;

    default:
      return `${result.hash}  ${result.path}`;
  }
}

/**
 * Format multiple hash results
 */
export function formatHashResults(
  results: HashResult[],
  format: OutputFormat = 'text'
): string {
  if (format === 'json') {
    return JSON.stringify(results, null, 2);
  }

  if (format === 'csv') {
    const header = 'path,hash,algorithm,size';
    const rows = results.map(r => formatHashResult(r, 'csv'));
    return [header, ...rows].join('\n');
  }

  return results.map(r => formatHashResult(r, format)).join('\n');
}

/**
 * Get algorithm label for BSD format
 */
function algorithmLabel(algorithm: Algorithm): string {
  switch (algorithm) {
    case 'blake3':
      return 'BLAKE3';
    case 'blake3-full':
      return 'BLAKE3-256';
    case 'sha256':
      return 'SHA256';
    case 'sha512':
      return 'SHA512';
    case 'md5':
      return 'MD5';
    case 'xxhash64':
      return 'XXHASH64';
  }
}

/**
 * Format verification result
 */
export function formatVerifyResult(
  path: string,
  expected: string,
  actual: string,
  match: boolean,
  format: OutputFormat = 'text'
): string {
  if (format === 'json') {
    return JSON.stringify({ path, expected, actual, match });
  }

  const status = match ? 'OK' : 'FAILED';
  return `${path}: ${status}`;
}

/**
 * Format ID output
 */
export function formatId(id: string, format: OutputFormat = 'text'): string {
  if (format === 'json') {
    return JSON.stringify({ id });
  }
  return id;
}

/**
 * Format multiple IDs
 */
export function formatIds(ids: string[], format: OutputFormat = 'text'): string {
  if (format === 'json') {
    return JSON.stringify(ids, null, 2);
  }
  return ids.join('\n');
}

/**
 * Format all-algorithms hash result
 */
export function formatAllHashes(
  result: {
    blake3: string;
    'blake3-full': string;
    sha256: string;
    sha512: string;
    md5: string;
    xxhash64: string;
    size: number;
    durationMs: number;
  },
  path: string,
  format: OutputFormat = 'text'
): string {
  if (format === 'json') {
    return JSON.stringify({ path, ...result }, null, 2);
  }

  return [
    `BLAKE3     ${result.blake3}  ${path}`,
    `BLAKE3-256 ${result['blake3-full']}  ${path}`,
    `SHA256     ${result.sha256}  ${path}`,
    `SHA512     ${result.sha512}  ${path}`,
    `MD5        ${result.md5}  ${path}`,
    `XXHASH64   ${result.xxhash64}  ${path}`
  ].join('\n');
}

/**
 * Format error message
 */
export function formatError(message: string, format: OutputFormat = 'text'): string {
  if (format === 'json') {
    return JSON.stringify({ error: message });
  }
  return `Error: ${message}`;
}

/**
 * Format success message
 */
export function formatSuccess(message: string, format: OutputFormat = 'text'): string {
  if (format === 'json') {
    return JSON.stringify({ success: message });
  }
  return `✓ ${message}`;
}

/**
 * Format progress for display
 */
export function formatProgress(
  current: number,
  total: number,
  currentFile?: string
): string {
  const percent = Math.round((current / total) * 100);
  const bar = progressBar(percent);
  const fileInfo = currentFile ? ` ${truncatePath(currentFile, 30)}` : '';
  return `${bar} ${percent}%${fileInfo}`;
}

/**
 * Create ASCII progress bar
 */
function progressBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '[' + '='.repeat(filled) + ' '.repeat(empty) + ']';
}

/**
 * Truncate path for display
 */
function truncatePath(filePath: string, maxLength: number): string {
  if (filePath.length <= maxLength) return filePath;

  const parts = filePath.split('/');
  const filename = parts.pop() || '';

  if (filename.length >= maxLength - 3) {
    return '...' + filename.slice(-(maxLength - 3));
  }

  let result = filename;
  for (let i = parts.length - 1; i >= 0 && result.length < maxLength - 4; i--) {
    const newResult = parts[i] + '/' + result;
    if (newResult.length > maxLength - 4) break;
    result = newResult;
  }

  return '.../' + result;
}

/**
 * Format file size for display
 */
export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format throughput for display
 */
export function formatThroughput(bytesPerSecond: number): string {
  return `${formatSize(bytesPerSecond)}/s`;
}
