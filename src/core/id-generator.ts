/**
 * Wake-n-Blake ID Generator
 * BLAKE3-based IDs, UUID, and ULID generation
 */

import * as crypto from 'node:crypto';
import { createHash as createBlake3Hash } from 'blake3';
import { v1 as uuidv1, v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { ulid as generateUlid, monotonicFactory } from 'ulid';

// UUID v5 well-known namespaces
export const UUID_NAMESPACES = {
  dns: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  url: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  oid: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  x500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8'
} as const;

export type NamespaceType = keyof typeof UUID_NAMESPACES;

// Monotonic ULID factory for same-millisecond ordering
const monotonicUlid = monotonicFactory();

/**
 * Generate a BLAKE3-based ID from random bytes
 * This is the preferred ID format for internal use
 */
export function generateBlake3Id(options: { full?: boolean } = {}): string {
  const randomBytes = crypto.randomBytes(32);
  const hasher = createBlake3Hash();
  hasher.update(randomBytes);
  const hash = hasher.digest('hex').toLowerCase();
  return options.full ? hash : hash.slice(0, 16);
}

/**
 * Generate multiple BLAKE3 IDs
 */
export function generateBlake3Ids(count: number, options: { full?: boolean } = {}): string[] {
  return Array.from({ length: count }, () => generateBlake3Id(options));
}

/**
 * Generate a BLAKE3-based ID from a specific input (deterministic)
 */
export function generateBlake3IdFrom(input: string | Buffer, options: { full?: boolean } = {}): string {
  const hasher = createBlake3Hash();
  hasher.update(typeof input === 'string' ? Buffer.from(input, 'utf-8') : input);
  const hash = hasher.digest('hex').toLowerCase();
  return options.full ? hash : hash.slice(0, 16);
}

/**
 * Generate UUID v1 (time-based with MAC address)
 * Note: Includes MAC address, potential privacy concern
 */
export function generateUuidV1(): string {
  return uuidv1();
}

/**
 * Generate UUID v4 (random)
 * Most common UUID type
 */
export function generateUuidV4(): string {
  return uuidv4();
}

/**
 * Generate UUID v5 (SHA-1 hash of namespace + name)
 * Deterministic - same namespace + name always produces same UUID
 */
export function generateUuidV5(
  name: string,
  namespace: NamespaceType | string = 'dns'
): string {
  const ns = UUID_NAMESPACES[namespace as NamespaceType] ?? namespace;
  return uuidv5(name, ns);
}

/**
 * Generate UUID v7 (Unix timestamp + random)
 * Sortable by time, recommended for database primary keys
 *
 * Implementation based on RFC 9562 draft
 */
export function generateUuidV7(): string {
  const timestamp = Date.now();

  // 48-bit timestamp in milliseconds
  const timestampHex = timestamp.toString(16).padStart(12, '0');

  // Version 7 and variant bits
  const randomBytes = crypto.randomBytes(10);

  // Set version (7) in bits 48-51
  randomBytes[0] = (randomBytes[0] & 0x0f) | 0x70;

  // Set variant (10) in bits 64-65
  randomBytes[2] = (randomBytes[2] & 0x3f) | 0x80;

  const randomHex = randomBytes.toString('hex');

  // Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
  return [
    timestampHex.slice(0, 8),
    timestampHex.slice(8, 12),
    randomHex.slice(0, 4),
    randomHex.slice(4, 8),
    randomHex.slice(8, 20)
  ].join('-');
}

/**
 * Generate UUID with specified version
 */
export function generateUuid(
  version: 1 | 4 | 5 | 7 = 4,
  options: { name?: string; namespace?: NamespaceType | string } = {}
): string {
  switch (version) {
    case 1:
      return generateUuidV1();
    case 4:
      return generateUuidV4();
    case 5:
      if (!options.name) {
        throw new Error('UUID v5 requires a name');
      }
      return generateUuidV5(options.name, options.namespace);
    case 7:
      return generateUuidV7();
    default:
      throw new Error(`Unsupported UUID version: ${version}`);
  }
}

/**
 * Generate multiple UUIDs
 */
export function generateUuids(
  count: number,
  version: 1 | 4 | 5 | 7 = 4,
  options: { name?: string; namespace?: NamespaceType | string } = {}
): string[] {
  return Array.from({ length: count }, () => generateUuid(version, options));
}

/**
 * Generate ULID (Universally Unique Lexicographically Sortable Identifier)
 * 26 characters, Crockford Base32, sortable by time
 */
export function generateULID(options: { timestamp?: number; monotonic?: boolean } = {}): string {
  if (options.monotonic) {
    return monotonicUlid(options.timestamp);
  }
  return options.timestamp ? generateUlid(options.timestamp) : generateUlid();
}

/**
 * Generate multiple ULIDs
 * Uses monotonic factory to ensure ordering within same millisecond
 */
export function generateULIDs(count: number, options: { monotonic?: boolean } = {}): string[] {
  if (options.monotonic) {
    return Array.from({ length: count }, () => monotonicUlid());
  }
  return Array.from({ length: count }, () => generateUlid());
}

/**
 * Parse ULID to extract timestamp
 */
export function parseUlidTimestamp(ulidStr: string): Date {
  // Crockford Base32 decoding for first 10 chars (48-bit timestamp)
  const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const normalized = ulidStr.toUpperCase();

  let timestamp = 0;
  for (let i = 0; i < 10; i++) {
    timestamp = timestamp * 32 + ENCODING.indexOf(normalized[i]);
  }

  return new Date(timestamp);
}

/**
 * Generate an ID using the preferred format (BLAKE3)
 * This is the recommended function for general ID generation
 */
export function id(options: { full?: boolean } = {}): string {
  return generateBlake3Id(options);
}
