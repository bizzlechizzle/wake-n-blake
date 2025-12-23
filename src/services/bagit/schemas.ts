/**
 * BagIt RFC 8493 Schemas
 * Type definitions for BagIt packages
 */

import { z } from 'zod';

// ============================================
// BAG-INFO SCHEMA
// ============================================

export const BagInfoSchema = z.object({
  'BagIt-Version': z.literal('1.0'),
  'Tag-File-Character-Encoding': z.literal('UTF-8'),
  'Bag-Software-Agent': z.string(),
  'Bagging-Date': z.string(), // YYYY-MM-DD
  'Payload-Oxum': z.string(), // octetcount.streamcount
  'Bag-Size': z.string().optional(), // Human-readable size
  'Bag-Count': z.string().optional(), // "N of M" or "N"
  'Bag-Group-Identifier': z.string().optional(),
  'Source-Organization': z.string().optional(),
  'Organization-Address': z.string().optional(),
  'Contact-Name': z.string().optional(),
  'Contact-Phone': z.string().optional(),
  'Contact-Email': z.string().optional(),
  'External-Description': z.string().optional(),
  'External-Identifier': z.string().optional(),
  'Internal-Sender-Identifier': z.string().optional(),
  'Internal-Sender-Description': z.string().optional()
});

// ============================================
// BAGIT OPTIONS & RESULTS
// ============================================

export const BagItAlgorithmSchema = z.enum(['sha256', 'sha512']);

export const BagItOptionsSchema = z.object({
  algorithm: BagItAlgorithmSchema.default('sha256'),
  inPlace: z.boolean().default(true),
  outputPath: z.string().optional(),
  bagInfo: z.record(z.string()).optional(),
  includeHiddenFiles: z.boolean().default(false),
  excludePatterns: z.array(z.string()).optional(),
  onProgress: z.function().args(z.number(), z.number(), z.string()).optional()
});

export const BagItResultSchema = z.object({
  bagPath: z.string(),
  algorithm: BagItAlgorithmSchema,
  payloadOxum: z.string(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  tagFiles: z.array(z.string()),
  payloadManifest: z.string(),
  tagManifest: z.string()
});

export const BagItVerifyResultSchema = z.object({
  valid: z.boolean(),
  bagPath: z.string(),
  algorithm: BagItAlgorithmSchema,
  payloadValid: z.boolean(),
  tagFilesValid: z.boolean(),
  payloadOxumMatch: z.boolean(),
  totalFiles: z.number().int(),
  verifiedFiles: z.number().int(),
  missingFiles: z.array(z.string()),
  invalidFiles: z.array(z.object({
    path: z.string(),
    expected: z.string(),
    actual: z.string()
  })),
  extraFiles: z.array(z.string()),
  errors: z.array(z.string()),
  durationMs: z.number().nonnegative()
});

// ============================================
// TYPE EXPORTS
// ============================================

export type BagInfo = z.infer<typeof BagInfoSchema>;
export type BagItAlgorithm = z.infer<typeof BagItAlgorithmSchema>;
export type BagItOptions = z.infer<typeof BagItOptionsSchema>;
export type BagItResult = z.infer<typeof BagItResultSchema>;
export type BagItVerifyResult = z.infer<typeof BagItVerifyResultSchema>;
