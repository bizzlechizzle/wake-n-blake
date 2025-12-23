/**
 * GPS Enrichment Service
 * Match files to GPS waypoints and update XMP sidecars
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseGpsFile, detectFormat, getTimedWaypoints, getAllWaypoints } from './parsers.js';
import { readSidecar, sidecarExists } from '../xmp/reader.js';
import { generateXmpContent } from '../xmp/writer.js';
import { extractMetadata } from '../metadata/index.js';
import { generateBlake3Id } from '../../core/id-generator.js';
import type {
  Waypoint,
  GpsDocument,
  GpsEnrichOptions,
  GpsMatch,
  GpsEnrichResult
} from './schemas.js';
import type { XmpSidecar, CustodyEvent } from '../../schemas/index.js';

const VERSION = '0.1.0';

/**
 * Enrich files with GPS coordinates from a reference map
 */
export async function enrichFilesWithGps(
  files: string[],
  mapPath: string,
  options: Partial<GpsEnrichOptions> = {}
): Promise<GpsEnrichResult> {
  const startTime = performance.now();
  const opts: GpsEnrichOptions = {
    matchStrategy: options.matchStrategy ?? 'timestamp',
    toleranceSec: options.toleranceSec ?? 300,
    timeOffset: options.timeOffset ?? 0,
    updateSidecar: options.updateSidecar ?? true,
    dryRun: options.dryRun ?? false,
    recursive: options.recursive ?? false,
    overwriteExisting: options.overwriteExisting ?? false
  };

  // Parse GPS reference file
  const mapContent = await fs.readFile(mapPath, 'utf-8');
  const format = detectFormat(mapPath);
  if (!format) {
    throw new Error(`Unsupported GPS file format: ${mapPath}`);
  }

  const gpsDoc = parseGpsFile(mapContent, format);

  // Get waypoints based on strategy
  const waypoints = opts.matchStrategy === 'timestamp'
    ? getTimedWaypoints(gpsDoc)
    : getAllWaypoints(gpsDoc);

  if (waypoints.length === 0) {
    throw new Error(`No waypoints found in GPS file: ${mapPath}`);
  }

  const result: GpsEnrichResult = {
    filesProcessed: 0,
    filesMatched: 0,
    filesUpdated: 0,
    filesSkipped: 0,
    filesWithExistingGps: 0,
    matches: [],
    unmatched: [],
    errors: [],
    durationMs: 0
  };

  // Process each file
  for (const file of files) {
    result.filesProcessed++;

    try {
      const match = await matchFileToWaypoint(file, waypoints, gpsDoc, opts);

      if (match) {
        result.matches.push(match);
        result.filesMatched++;

        if (match.updated) {
          result.filesUpdated++;
        }
      } else {
        result.unmatched.push(file);
      }
    } catch (err) {
      result.errors.push({
        file,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  result.filesSkipped = result.filesProcessed - result.filesMatched - result.errors.length;
  result.durationMs = performance.now() - startTime;

  return result;
}

/**
 * Match a single file to a waypoint
 */
async function matchFileToWaypoint(
  file: string,
  waypoints: Waypoint[],
  gpsDoc: GpsDocument,
  opts: GpsEnrichOptions
): Promise<GpsMatch | null> {
  // Get file timestamp from EXIF or mtime
  const fileTimestamp = await getFileTimestamp(file);

  // Check if file already has GPS
  const existingGps = await getExistingGps(file);
  if (existingGps && !opts.overwriteExisting) {
    return null; // Skip files with existing GPS
  }

  // Find matching waypoint
  let matchedWaypoint: Waypoint | null = null;
  let timeDelta = Infinity;
  let confidence = 0;

  if ((opts.matchStrategy === 'timestamp' || opts.matchStrategy === 'interpolate') && fileTimestamp) {
    // Adjust for camera clock offset
    const adjustedTime = new Date(fileTimestamp.getTime() + opts.timeOffset * 1000);

    // Find nearest waypoint by timestamp
    for (const wp of waypoints) {
      if (!wp.timestamp) continue;

      const delta = Math.abs(adjustedTime.getTime() - wp.timestamp.getTime()) / 1000;

      if (delta < timeDelta && delta <= opts.toleranceSec) {
        timeDelta = delta;
        matchedWaypoint = wp;
        confidence = 1 - (delta / opts.toleranceSec);
      }
    }

    // Try interpolation if no exact match and we have tracks
    if (!matchedWaypoint && opts.matchStrategy === 'interpolate' && gpsDoc.tracks.length > 0) {
      const interpolated = interpolatePosition(adjustedTime, gpsDoc);
      if (interpolated) {
        matchedWaypoint = interpolated.waypoint;
        timeDelta = interpolated.timeDelta;
        confidence = interpolated.confidence;
      }
    }
  } else if (opts.matchStrategy === 'nearest') {
    // Just use the first waypoint or nearest by some other metric
    if (waypoints.length > 0) {
      matchedWaypoint = waypoints[0];
      timeDelta = 0;
      confidence = 0.5; // Medium confidence for non-timestamp match
    }
  }

  if (!matchedWaypoint) {
    return null;
  }

  // Update sidecar if requested
  let updated = false;
  if (opts.updateSidecar && !opts.dryRun) {
    updated = await updateFileGps(file, matchedWaypoint, gpsDoc);
  }

  return {
    file,
    fileTimestamp,
    waypoint: matchedWaypoint,
    timeDelta,
    confidence,
    updated
  };
}

/**
 * Get file timestamp from EXIF DateTimeOriginal or mtime
 */
async function getFileTimestamp(file: string): Promise<Date | undefined> {
  try {
    // Try to get EXIF date first
    const metadata = await extractMetadata(file);
    if (metadata.photo?.captureDate) {
      return new Date(metadata.photo.captureDate);
    }
  } catch {
    // Fall back to mtime
  }

  try {
    const stats = await fs.stat(file);
    return stats.mtime;
  } catch {
    return undefined;
  }
}

/**
 * Check if file already has GPS coordinates
 */
async function getExistingGps(file: string): Promise<{ lat: number; lon: number } | null> {
  try {
    // Check XMP sidecar first
    if (await sidecarExists(file)) {
      const sidecarPath = file + '.xmp';
      const { data } = await readSidecar(sidecarPath);
      if (data.photo?.gpsLatitude !== undefined && data.photo?.gpsLongitude !== undefined) {
        return { lat: data.photo.gpsLatitude, lon: data.photo.gpsLongitude };
      }
    }

    // Check EXIF metadata
    const metadata = await extractMetadata(file);
    if (metadata.photo?.gpsLatitude !== undefined && metadata.photo?.gpsLongitude !== undefined) {
      return { lat: metadata.photo.gpsLatitude, lon: metadata.photo.gpsLongitude };
    }
  } catch {
    // No existing GPS
  }

  return null;
}

/**
 * Interpolate GPS position between track points
 */
function interpolatePosition(
  timestamp: Date,
  gpsDoc: GpsDocument
): { waypoint: Waypoint; timeDelta: number; confidence: number } | null {
  for (const track of gpsDoc.tracks) {
    const timedPoints = track.points.filter(p => p.timestamp);
    if (timedPoints.length < 2) continue;

    // Sort by timestamp
    timedPoints.sort((a, b) => a.timestamp!.getTime() - b.timestamp!.getTime());

    // Find bracketing points
    for (let i = 0; i < timedPoints.length - 1; i++) {
      const p1 = timedPoints[i];
      const p2 = timedPoints[i + 1];
      const t1 = p1.timestamp!.getTime();
      const t2 = p2.timestamp!.getTime();
      const t = timestamp.getTime();

      if (t >= t1 && t <= t2) {
        // Linear interpolation
        const ratio = (t - t1) / (t2 - t1);
        const lat = p1.latitude + ratio * (p2.latitude - p1.latitude);
        const lon = p1.longitude + ratio * (p2.longitude - p1.longitude);
        const alt = p1.altitude !== undefined && p2.altitude !== undefined
          ? p1.altitude + ratio * (p2.altitude - p1.altitude)
          : undefined;

        const timeDelta = Math.min(t - t1, t2 - t) / 1000;
        const confidence = 0.9; // High confidence for interpolation

        return {
          waypoint: {
            latitude: lat,
            longitude: lon,
            altitude: alt,
            timestamp,
            name: `Interpolated (${p1.name || 'point'} → ${p2.name || 'point'})`
          },
          timeDelta,
          confidence
        };
      }
    }
  }

  return null;
}

/**
 * Update file's XMP sidecar with GPS coordinates
 */
async function updateFileGps(
  file: string,
  waypoint: Waypoint,
  gpsDoc: GpsDocument
): Promise<boolean> {
  try {
    const sidecarPath = file + '.xmp';
    let sidecarData: Partial<XmpSidecar>;

    // Load existing sidecar or create new one
    if (await sidecarExists(file)) {
      const { data } = await readSidecar(sidecarPath);
      sidecarData = data;
    } else {
      // Create minimal sidecar data
      const stats = await fs.stat(file);
      sidecarData = {
        schemaVersion: 2,
        sidecarCreated: new Date().toISOString(),
        sidecarUpdated: new Date().toISOString(),
        contentHash: '0'.repeat(64), // Placeholder, should compute real hash
        hashAlgorithm: 'blake3',
        fileSize: stats.size,
        verified: false,
        fileCategory: 'image',
        detectedMimeType: 'application/octet-stream',
        declaredExtension: path.extname(file),
        sourcePath: file,
        sourceFilename: path.basename(file),
        sourceHost: os.hostname(),
        sourceType: 'local_disk',
        originalMtime: stats.mtime.toISOString(),
        importTimestamp: new Date().toISOString(),
        sessionId: generateBlake3Id(),
        toolVersion: VERSION,
        importUser: os.userInfo().username,
        importHost: os.hostname(),
        importPlatform: process.platform as 'darwin' | 'linux' | 'win32',
        custodyChain: [],
        firstSeen: new Date().toISOString(),
        eventCount: 0
      };
    }

    // Update GPS in photo metadata
    sidecarData.photo = sidecarData.photo || {};
    sidecarData.photo.gpsLatitude = waypoint.latitude;
    sidecarData.photo.gpsLongitude = waypoint.longitude;
    if (waypoint.altitude !== undefined) {
      sidecarData.photo.gpsAltitude = waypoint.altitude;
    }

    // Add custody event for GPS enrichment
    const custodyEvent: CustodyEvent = {
      eventId: generateBlake3Id(),
      eventTimestamp: new Date().toISOString(),
      eventAction: 'metadata_modification',
      eventOutcome: 'success',
      eventHost: os.hostname(),
      eventUser: os.userInfo().username,
      eventTool: `wake-n-blake/${VERSION}`,
      eventNotes: `GPS coordinates from ${gpsDoc.name || gpsDoc.format} reference map`,
      eventDetails: JSON.stringify({
        source: gpsDoc.format,
        waypointName: waypoint.name,
        latitude: waypoint.latitude,
        longitude: waypoint.longitude,
        altitude: waypoint.altitude
      })
    };

    sidecarData.custodyChain = sidecarData.custodyChain || [];
    sidecarData.custodyChain.push(custodyEvent);
    sidecarData.eventCount = sidecarData.custodyChain.length;
    sidecarData.sidecarUpdated = new Date().toISOString();

    // Write updated sidecar
    const xmpContent = generateXmpContent(sidecarData as XmpSidecar);
    await fs.writeFile(sidecarPath, xmpContent, 'utf-8');

    return true;
  } catch (err) {
    console.error(`Failed to update sidecar for ${file}: ${err}`);
    return false;
  }
}

/**
 * Collect files from paths (supports directories)
 */
export async function collectMediaFiles(
  paths: string[],
  recursive: boolean = false
): Promise<string[]> {
  const files: string[] = [];
  const mediaExtensions = new Set([
    '.jpg', '.jpeg', '.png', '.heic', '.heif', '.tiff', '.tif',
    '.cr2', '.cr3', '.nef', '.arw', '.dng', '.raf', '.orf',
    '.mp4', '.mov', '.mkv', '.avi'
  ]);

  for (const p of paths) {
    const resolved = path.resolve(p);
    const stats = await fs.stat(resolved);

    if (stats.isFile()) {
      const ext = path.extname(resolved).toLowerCase();
      if (mediaExtensions.has(ext)) {
        files.push(resolved);
      }
    } else if (stats.isDirectory()) {
      const entries = await fs.readdir(resolved, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(resolved, entry.name);

        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (mediaExtensions.has(ext)) {
            files.push(fullPath);
          }
        } else if (entry.isDirectory() && recursive) {
          const subFiles = await collectMediaFiles([fullPath], true);
          files.push(...subFiles);
        }
      }
    }
  }

  return files;
}

// Re-export
export * from './schemas.js';
export * from './parsers.js';
