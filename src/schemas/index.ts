/**
 * Wake-n-Blake Zod Schemas
 * Validation schemas for all data types
 */

import { z } from 'zod';

// ============================================
// HASH SCHEMAS
// ============================================

export const Blake3HashSchema = z.string()
  .length(16)
  .regex(/^[a-f0-9]+$/, 'Must be 16 lowercase hex characters');

export const Blake3FullHashSchema = z.string()
  .length(64)
  .regex(/^[a-f0-9]+$/, 'Must be 64 lowercase hex characters');

export const Sha256HashSchema = z.string()
  .length(64)
  .regex(/^[a-f0-9]+$/, 'Must be 64 lowercase hex characters');

export const Sha512HashSchema = z.string()
  .length(128)
  .regex(/^[a-f0-9]+$/, 'Must be 128 lowercase hex characters');

// Union for any supported hash
export const AnyHashSchema = z.union([
  Blake3HashSchema,
  Blake3FullHashSchema,
  Sha256HashSchema,
  Sha512HashSchema
]);

// ============================================
// ID SCHEMAS
// ============================================

export const Blake3IdSchema = Blake3HashSchema; // Same format

export const UuidSchema = z.string().uuid();

export const UlidSchema = z.string()
  .length(26)
  .regex(/^[0-9A-HJKMNP-TV-Z]+$/, 'Must be valid ULID');

// Union for any ID type
export const AnyIdSchema = z.union([
  Blake3IdSchema,
  UuidSchema,
  UlidSchema
]);

// ============================================
// ALGORITHM & FORMAT SCHEMAS
// ============================================

export const AlgorithmSchema = z.enum(['blake3', 'blake3-full', 'sha256', 'sha512']);

export const OutputFormatSchema = z.enum(['text', 'json', 'csv', 'bsd', 'sfv']);

// ============================================
// FILE & RESULT SCHEMAS
// ============================================

export const HashResultSchema = z.object({
  path: z.string().min(1),
  hash: z.string(),
  algorithm: AlgorithmSchema,
  size: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative()
});

export const VerifyResultSchema = z.object({
  path: z.string(),
  expected: z.string(),
  actual: z.string(),
  algorithm: AlgorithmSchema,
  match: z.boolean(),
  size: z.number().int().nonnegative()
});

// ============================================
// MANIFEST SCHEMAS
// ============================================

export const ManifestEntrySchema = z.object({
  path: z.string().min(1),
  hash: Blake3HashSchema,
  size: z.number().int().nonnegative(),
  mtime: z.string().datetime().optional()
});

export const ManifestSchema = z.object({
  version: z.literal('1.0'),
  generated: z.string().datetime(),
  algorithm: z.literal('blake3'),
  hashLength: z.literal(16),
  root: z.string(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  files: z.array(ManifestEntrySchema)
});

// ============================================
// AUDIT SCHEMAS
// ============================================

export const AuditResultSchema = z.object({
  valid: z.boolean(),
  total: z.number().int(),
  matched: z.number().int(),
  mismatched: z.array(ManifestEntrySchema),
  missing: z.array(ManifestEntrySchema),
  extra: z.array(z.string()),
  duplicates: z.array(z.object({
    hash: Blake3HashSchema,
    paths: z.array(z.string())
  }))
});

// ============================================
// COPY & IMPORT SCHEMAS
// ============================================

export const CopyResultSchema = z.object({
  source: z.string(),
  destination: z.string(),
  hash: Blake3HashSchema,
  size: z.number().int().nonnegative(),
  verified: z.boolean(),
  durationMs: z.number().nonnegative()
});

export const ImportStatusSchema = z.enum([
  'scanning', 'hashing', 'copying',
  'validating', 'completed', 'paused', 'failed'
]);

export const ImportSessionSchema = z.object({
  id: Blake3IdSchema,
  status: ImportStatusSchema,
  source: z.string(),
  destination: z.string(),
  totalFiles: z.number().int().nonnegative(),
  processedFiles: z.number().int().nonnegative(),
  duplicateFiles: z.number().int().nonnegative(),
  errorFiles: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  processedBytes: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  checkpoint: z.any().optional()
});

// ============================================
// TYPE EXPORTS
// ============================================

export type Blake3Hash = z.infer<typeof Blake3HashSchema>;
export type Blake3FullHash = z.infer<typeof Blake3FullHashSchema>;
export type Sha256Hash = z.infer<typeof Sha256HashSchema>;
export type Sha512Hash = z.infer<typeof Sha512HashSchema>;
export type Blake3Id = z.infer<typeof Blake3IdSchema>;
export type Uuid = z.infer<typeof UuidSchema>;
export type Ulid = z.infer<typeof UlidSchema>;
export type Algorithm = z.infer<typeof AlgorithmSchema>;
export type OutputFormat = z.infer<typeof OutputFormatSchema>;
export type HashResult = z.infer<typeof HashResultSchema>;
export type VerifyResult = z.infer<typeof VerifyResultSchema>;
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type AuditResult = z.infer<typeof AuditResultSchema>;
export type CopyResult = z.infer<typeof CopyResultSchema>;
export type ImportStatus = z.infer<typeof ImportStatusSchema>;
export type ImportSession = z.infer<typeof ImportSessionSchema>;

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Detect hash algorithm from hash string length
 */
export function detectAlgorithm(hash: string): Algorithm | null {
  const len = hash.length;
  if (len === 16 && /^[a-f0-9]+$/.test(hash)) return 'blake3';
  if (len === 64 && /^[a-f0-9]+$/.test(hash)) return 'sha256'; // or blake3-full
  if (len === 128 && /^[a-f0-9]+$/.test(hash)) return 'sha512';
  return null;
}

/**
 * Validate a hash string
 */
export function isValidHash(hash: string, algorithm?: Algorithm): boolean {
  if (algorithm) {
    const schema = {
      'blake3': Blake3HashSchema,
      'blake3-full': Blake3FullHashSchema,
      'sha256': Sha256HashSchema,
      'sha512': Sha512HashSchema
    }[algorithm];
    return schema.safeParse(hash).success;
  }
  return AnyHashSchema.safeParse(hash).success;
}

/**
 * Validate a UUID string
 */
export function isValidUuid(uuid: string): boolean {
  return UuidSchema.safeParse(uuid).success;
}

/**
 * Validate a ULID string
 */
export function isValidUlid(ulid: string): boolean {
  return UlidSchema.safeParse(ulid).success;
}
