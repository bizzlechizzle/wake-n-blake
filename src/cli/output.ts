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
 *
 * @param ms - Duration in milliseconds
 * @param style - 'short' for CLI (3h15m), 'long' for logs (3 hours, 15 minutes)
 */
export function formatDuration(ms: number | undefined, style: 'short' | 'long' = 'short'): string {
  if (ms === undefined || ms < 0) {
    return style === 'short' ? '--' : 'calculating...';
  }

  if (ms < 1000) {
    return style === 'short' ? '< 1s' : 'less than a second';
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const s = seconds % 60;
  const m = minutes % 60;
  const h = hours % 24;

  if (style === 'short') {
    if (days > 0) return `${days}d${h}h${m}m`;
    if (hours > 0) return `${h}h${m}m${s}s`;
    if (minutes > 0) return `${m}m${s}s`;
    return `${s}s`;
  }

  // Long format
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (h > 0) parts.push(`${h} hour${h !== 1 ? 's' : ''}`);
  if (m > 0) parts.push(`${m} minute${m !== 1 ? 's' : ''}`);
  if (s > 0 && days === 0) parts.push(`${s} second${s !== 1 ? 's' : ''}`);

  return parts.length > 0 ? parts.join(', ') : 'less than a second';
}

/**
 * Format ETA for display
 *
 * User-friendly ETA that handles edge cases gracefully
 */
export function formatETA(estimatedRemainingMs: number | undefined): string {
  if (estimatedRemainingMs === undefined) {
    return 'calculating...';
  }
  if (estimatedRemainingMs < 1000) {
    return 'almost done';
  }
  return formatDuration(estimatedRemainingMs, 'short');
}

/**
 * Format throughput for display
 */
export function formatThroughput(bytesPerSecond: number | undefined): string {
  if (bytesPerSecond === undefined || bytesPerSecond <= 0) {
    return '--';
  }
  return `${formatSize(bytesPerSecond)}/s`;
}

/**
 * Create enhanced progress bar with ETA
 *
 * @param percent - Progress percentage (0-100)
 * @param width - Bar width in characters (default: 20)
 * @returns Progress bar string (e.g., "[████████░░░░░░░░░░░░] 40%")
 */
export function enhancedProgressBar(percent: number, width = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${Math.round(percent)}%`;
}

/**
 * Format import progress with all details
 */
export function formatImportProgress(
  filesProcessed: number,
  totalFiles: number,
  bytesProcessed: number,
  totalBytes: number,
  stepName?: string,
  currentFile?: string,
  estimatedRemainingMs?: number,
  throughputBytesPerSec?: number
): string {
  const percent = totalFiles > 0 ? (filesProcessed / totalFiles) * 100 : 0;
  const bar = enhancedProgressBar(percent, 25);

  const lines: string[] = [];

  // Main progress line
  lines.push(`${bar} ${filesProcessed}/${totalFiles} files`);

  // Step name if provided
  if (stepName) {
    lines.push(`Step: ${stepName}`);
  }

  // Size progress
  lines.push(`Size: ${formatSize(bytesProcessed)} / ${formatSize(totalBytes)}`);

  // Throughput and ETA
  const throughput = formatThroughput(throughputBytesPerSec);
  const eta = formatETA(estimatedRemainingMs);
  lines.push(`Speed: ${throughput} | ETA: ${eta}`);

  // Current file (truncated)
  if (currentFile) {
    lines.push(`File: ${truncatePath(currentFile, 50)}`);
  }

  return lines.join('\n');
}
