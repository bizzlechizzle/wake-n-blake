/**
 * GPS Enrichment Schemas
 * Type definitions for GPS reference map parsing and matching
 */

import { z } from 'zod';

// ============================================
// WAYPOINT & TRACK SCHEMAS
// ============================================

export const WaypointSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitude: z.number().optional(),
  timestamp: z.date().optional(),
  accuracy: z.number().optional()
});

export const GpsTrackSchema = z.object({
  name: z.string().optional(),
  points: z.array(WaypointSchema),
  startTime: z.date().optional(),
  endTime: z.date().optional()
});

export const GpsDocumentSchema = z.object({
  format: z.enum(['kml', 'gpx', 'geojson']),
  name: z.string().optional(),
  waypoints: z.array(WaypointSchema),
  tracks: z.array(GpsTrackSchema)
});

// ============================================
// ENRICHMENT OPTIONS & RESULTS
// ============================================

export const MatchStrategySchema = z.enum(['timestamp', 'nearest', 'interpolate']);

export const GpsEnrichOptionsSchema = z.object({
  matchStrategy: MatchStrategySchema.default('timestamp'),
  toleranceSec: z.number().default(300), // 5 minutes
  timeOffset: z.number().default(0), // Camera clock offset in seconds
  updateSidecar: z.boolean().default(true),
  dryRun: z.boolean().default(false),
  recursive: z.boolean().default(false),
  overwriteExisting: z.boolean().default(false) // Overwrite existing GPS
});

export const GpsMatchSchema = z.object({
  file: z.string(),
  fileTimestamp: z.date().optional(),
  waypoint: WaypointSchema,
  timeDelta: z.number(), // Seconds between file and waypoint
  confidence: z.number().min(0).max(1),
  updated: z.boolean()
});

export const GpsEnrichResultSchema = z.object({
  filesProcessed: z.number().int().nonnegative(),
  filesMatched: z.number().int().nonnegative(),
  filesUpdated: z.number().int().nonnegative(),
  filesSkipped: z.number().int().nonnegative(),
  filesWithExistingGps: z.number().int().nonnegative(),
  matches: z.array(GpsMatchSchema),
  unmatched: z.array(z.string()),
  errors: z.array(z.object({
    file: z.string(),
    error: z.string()
  })),
  durationMs: z.number().nonnegative()
});

// ============================================
// TYPE EXPORTS
// ============================================

export type Waypoint = z.infer<typeof WaypointSchema>;
export type GpsTrack = z.infer<typeof GpsTrackSchema>;
export type GpsDocument = z.infer<typeof GpsDocumentSchema>;
export type MatchStrategy = z.infer<typeof MatchStrategySchema>;
export type GpsEnrichOptions = z.infer<typeof GpsEnrichOptionsSchema>;
export type GpsMatch = z.infer<typeof GpsMatchSchema>;
export type GpsEnrichResult = z.infer<typeof GpsEnrichResultSchema>;
