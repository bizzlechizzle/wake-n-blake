/**
 * Wake-n-Blake Constants
 * Shared configuration values across the application
 */

import * as os from 'node:os';

// BLAKE3 hash lengths
export const BLAKE3_HASH_LENGTH = 16;        // 64-bit truncated (default)
export const BLAKE3_FULL_HASH_LENGTH = 64;   // Full 256-bit
export const SHA256_HASH_LENGTH = 64;
export const SHA512_HASH_LENGTH = 128;

// Buffer sizes for I/O operations
export const LOCAL_BUFFER_SIZE = 64 * 1024;           // 64KB for local files
export const NETWORK_BUFFER_SIZE = 1024 * 1024;       // 1MB for network files

// Concurrency settings (computed at runtime)
export function getDefaultConcurrency(): number {
  return Math.max(1, os.cpus().length - 1);
}
export const NETWORK_CONCURRENCY = 2;

// Retry configuration
export const RETRY_CONFIG = {
  attempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  networkDelayMs: 50
} as const;

// Retryable network error codes
export const RETRYABLE_ERRORS = [
  'EAGAIN',
  'ECONNRESET',
  'ETIMEDOUT',
  'EBUSY',
  'EIO',
  'ENETUNREACH',
  'EPIPE',
  'ENOTCONN',
  'EHOSTDOWN',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ECONNABORTED',
  'ESTALE',
  'ENOENT'
] as const;

// Native b3sum search paths
export const B3SUM_PATHS = [
  '/opt/homebrew/bin/b3sum',    // macOS ARM64
  '/usr/local/bin/b3sum',       // macOS Intel, Linux manual
  '/usr/bin/b3sum'              // Linux package manager
] as const;

// Supported algorithms
export const ALGORITHMS = ['blake3', 'blake3-full', 'sha256', 'sha512'] as const;
export type Algorithm = typeof ALGORITHMS[number];

// Output formats
export const OUTPUT_FORMATS = ['text', 'json', 'csv', 'bsd', 'sfv'] as const;
export type OutputFormat = typeof OUTPUT_FORMATS[number];

// Hash patterns for validation
export const HASH_PATTERNS = {
  blake3: /^[a-f0-9]{16}$/,
  'blake3-full': /^[a-f0-9]{64}$/,
  sha256: /^[a-f0-9]{64}$/,
  sha512: /^[a-f0-9]{128}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/
} as const;

// Network path patterns for auto-detection
export const NETWORK_PATTERNS = [
  /^\/Volumes\//,             // macOS mounted volumes
  /^\/mnt\//,                 // Linux mounts
  /^\/media\//,               // Linux automounts
  /^\/run\/user\/.*\/gvfs/,   // GNOME virtual filesystem
  /^\/net\//,                 // BSD-style automounts
  /^\\\\/,                    // Windows UNC paths
  /^\/\/[^/]+\//              // SMB-style paths
] as const;
