/**
 * Perceptual Hashing Schemas
 * Type definitions for perceptual hash computation and comparison
 */

import { z } from 'zod';

// ============================================
// PHASH ALGORITHM & RESULT SCHEMAS
// ============================================

export const PhashAlgorithmSchema = z.enum(['dhash', 'phash', 'ahash']);

export const PerceptualHashSchema = z.object({
  path: z.string(),
  hash: z.string().length(16).regex(/^[a-f0-9]+$/), // 64-bit hash as 16 hex chars
  algorithm: PhashAlgorithmSchema,
  dimensions: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive()
  }),
  format: z.string(),
  durationMs: z.number().nonnegative()
});

export const SimilarPairSchema = z.object({
  file1: z.string(),
  file2: z.string(),
  hash1: z.string(),
  hash2: z.string(),
  distance: z.number().int().nonnegative(), // Hamming distance
  similarity: z.number().min(0).max(100) // Percentage similarity
});

export const SimilarGroupSchema = z.object({
  representative: z.string(), // First file in group
  hash: z.string(),
  files: z.array(z.string()),
  distances: z.array(z.number().int().nonnegative())
});

// ============================================
// PHASH OPTIONS & RESULTS
// ============================================

export const PhashOptionsSchema = z.object({
  algorithm: PhashAlgorithmSchema.default('dhash'),
  hashSize: z.number().int().min(4).max(16).default(8), // Grid size (8 = 64-bit hash)
  threshold: z.number().int().min(0).max(64).default(10), // Max hamming distance
  recursive: z.boolean().default(false),
  includePatterns: z.array(z.string()).optional(),
  onProgress: z.function().args(z.number(), z.number(), z.string()).optional()
});

export const PhashResultSchema = z.object({
  totalImages: z.number().int().nonnegative(),
  processedImages: z.number().int().nonnegative(),
  similarGroups: z.array(SimilarGroupSchema),
  similarPairs: z.array(SimilarPairSchema),
  uniqueImages: z.number().int().nonnegative(),
  hashes: z.array(PerceptualHashSchema),
  errors: z.array(z.object({
    file: z.string(),
    error: z.string()
  })),
  durationMs: z.number().nonnegative()
});

export const PhashCompareResultSchema = z.object({
  file1: z.string(),
  file2: z.string(),
  hash1: z.string(),
  hash2: z.string(),
  distance: z.number().int().nonnegative(),
  similarity: z.number().min(0).max(100),
  areSimilar: z.boolean()
});

// ============================================
// TYPE EXPORTS
// ============================================

export type PhashAlgorithm = z.infer<typeof PhashAlgorithmSchema>;
export type PerceptualHash = z.infer<typeof PerceptualHashSchema>;
export type SimilarPair = z.infer<typeof SimilarPairSchema>;
export type SimilarGroup = z.infer<typeof SimilarGroupSchema>;
export type PhashOptions = z.infer<typeof PhashOptionsSchema>;
export type PhashResult = z.infer<typeof PhashResultSchema>;
export type PhashCompareResult = z.infer<typeof PhashCompareResultSchema>;
