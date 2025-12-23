/**
 * Related Files Detector
 *
 * Detects related file pairs and groups:
 * - Live Photos (iOS HEIC+MOV, Android Motion Photos)
 * - RAW+JPEG pairs
 * - Video+Audio pairs
 * - HDR+SDR pairs
 * - Burst sequences
 * - Panorama sets
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { detectFileType } from '../file-type/detector.js';
import type { RelationType } from '../xmp/schema.js';

/**
 * Related file group
 */
export interface RelatedFileGroup {
  type: RelationType;
  primaryFile: string;
  relatedFiles: string[];
  allFiles: string[];
  metadata?: {
    burstId?: string;
    sequenceNumber?: number;
    totalCount?: number;
  };
}

/**
 * RAW camera format extensions
 */
const RAW_EXTENSIONS = new Set([
  '.dng', '.cr2', '.cr3', '.crw',
  '.nef', '.nrw', '.arw', '.arq', '.srf', '.sr2',
  '.raf', '.orf', '.ori', '.rw2', '.raw', '.rwl',
  '.pef', '.ptx', '.srw', '.x3f', '.3fr', '.fff',
  '.iiq', '.mef', '.mos', '.dcr', '.k25', '.kdc',
  '.mrw', '.erf', '.gpr', '.rwz'
]);

/**
 * JPEG extensions
 */
const JPEG_EXTENSIONS = new Set(['.jpg', '.jpeg', '.jpe']);

/**
 * Video extensions for Live Photo
 */
const LIVE_PHOTO_VIDEO_EXTENSIONS = new Set(['.mov', '.mp4', '.m4v']);

/**
 * HEIC/HEIF extensions
 */
const HEIC_EXTENSIONS = new Set(['.heic', '.heif', '.hif']);

/**
 * XMP sidecar extensions
 */
const SIDECAR_EXTENSIONS = new Set(['.xmp', '.thm', '.aae']);

/**
 * Find all related files for a set of files
 */
export async function findRelatedFiles(
  files: string[]
): Promise<RelatedFileGroup[]> {
  const groups: RelatedFileGroup[] = [];
  const processed = new Set<string>();

  // Build lookup maps
  const byBasename = new Map<string, string[]>();
  const byDir = new Map<string, string[]>();

  for (const file of files) {
    const dir = path.dirname(file);
    const base = getBasename(file);

    // Group by base name (without extension), case-insensitive
    const baseKey = path.join(dir, base.toLowerCase());
    if (!byBasename.has(baseKey)) {
      byBasename.set(baseKey, []);
    }
    byBasename.get(baseKey)!.push(file);

    // Group by directory
    if (!byDir.has(dir)) {
      byDir.set(dir, []);
    }
    byDir.get(dir)!.push(file);
  }

  // Find Live Photo pairs
  for (const [baseKey, baseFiles] of byBasename) {
    const livePhotoGroup = await detectLivePhoto(baseFiles);
    if (livePhotoGroup) {
      groups.push(livePhotoGroup);
      livePhotoGroup.allFiles.forEach(f => processed.add(f));
    }
  }

  // Find RAW+JPEG pairs
  for (const [baseKey, baseFiles] of byBasename) {
    // Skip already processed files
    const remaining = baseFiles.filter(f => !processed.has(f));
    if (remaining.length < 2) continue;

    const rawJpegGroup = detectRawJpegPair(remaining);
    if (rawJpegGroup) {
      groups.push(rawJpegGroup);
      rawJpegGroup.allFiles.forEach(f => processed.add(f));
    }
  }

  // Find RAW sidecar pairs
  for (const [baseKey, baseFiles] of byBasename) {
    const remaining = baseFiles.filter(f => !processed.has(f));
    if (remaining.length < 2) continue;

    const sidecarGroup = detectRawSidecar(remaining);
    if (sidecarGroup) {
      groups.push(sidecarGroup);
      sidecarGroup.allFiles.forEach(f => processed.add(f));
    }
  }

  // Find burst sequences by directory
  for (const [dir, dirFiles] of byDir) {
    const remaining = dirFiles.filter(f => !processed.has(f));
    const burstGroups = await detectBurstSequences(remaining);
    for (const group of burstGroups) {
      groups.push(group);
      group.allFiles.forEach(f => processed.add(f));
    }
  }

  // Find HDR+SDR pairs
  for (const [dir, dirFiles] of byDir) {
    const remaining = dirFiles.filter(f => !processed.has(f));
    const hdrGroups = detectHdrSdrPairs(remaining);
    for (const group of hdrGroups) {
      groups.push(group);
      group.allFiles.forEach(f => processed.add(f));
    }
  }

  return groups;
}

/**
 * Get base filename without extension
 */
function getBasename(file: string): string {
  const name = path.basename(file);
  const ext = path.extname(name);
  return name.slice(0, -ext.length);
}

/**
 * Detect Live Photo pair (HEIC/JPEG + MOV)
 */
async function detectLivePhoto(files: string[]): Promise<RelatedFileGroup | null> {
  let imageFile: string | undefined;
  let videoFile: string | undefined;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();

    if (HEIC_EXTENSIONS.has(ext) || JPEG_EXTENSIONS.has(ext)) {
      imageFile = file;
    } else if (LIVE_PHOTO_VIDEO_EXTENSIONS.has(ext)) {
      // Check for short duration video (Live Photo videos are typically 2-3 seconds)
      // For now, just match by name
      videoFile = file;
    }
  }

  if (imageFile && videoFile) {
    // Verify they have the same base name (Live Photo pairing)
    const imageBase = getBasename(imageFile).replace(/_HEVC$/, '');
    const videoBase = getBasename(videoFile);

    // iOS naming: IMG_1234.HEIC + IMG_1234.MOV
    // or: IMG_1234.HEIC + IMG_E1234.MOV (edited)
    const videoBaseClean = videoBase.replace(/^IMG_E/, 'IMG_');

    if (imageBase === videoBase || imageBase === videoBaseClean) {
      return {
        type: 'live_photo',
        primaryFile: imageFile,
        relatedFiles: [videoFile],
        allFiles: [imageFile, videoFile],
      };
    }
  }

  return null;
}

/**
 * Detect RAW+JPEG pair
 */
function detectRawJpegPair(files: string[]): RelatedFileGroup | null {
  let rawFile: string | undefined;
  let jpegFile: string | undefined;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();

    if (RAW_EXTENSIONS.has(ext)) {
      rawFile = file;
    } else if (JPEG_EXTENSIONS.has(ext)) {
      jpegFile = file;
    }
  }

  if (rawFile && jpegFile) {
    return {
      type: 'raw_jpeg_pair',
      primaryFile: rawFile, // RAW is primary
      relatedFiles: [jpegFile],
      allFiles: [rawFile, jpegFile],
    };
  }

  return null;
}

/**
 * Detect RAW + sidecar (.xmp, .thm)
 */
function detectRawSidecar(files: string[]): RelatedFileGroup | null {
  let rawFile: string | undefined;
  const sidecars: string[] = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();

    if (RAW_EXTENSIONS.has(ext)) {
      rawFile = file;
    } else if (SIDECAR_EXTENSIONS.has(ext)) {
      sidecars.push(file);
    }
  }

  if (rawFile && sidecars.length > 0) {
    return {
      type: 'raw_sidecar',
      primaryFile: rawFile,
      relatedFiles: sidecars,
      allFiles: [rawFile, ...sidecars],
    };
  }

  return null;
}

/**
 * Detect burst sequences
 * Looks for sequential numbering patterns
 */
async function detectBurstSequences(files: string[]): Promise<RelatedFileGroup[]> {
  const groups: RelatedFileGroup[] = [];

  // Group by potential burst prefix
  const burstPatterns = new Map<string, { file: string; seq: number }[]>();

  for (const file of files) {
    const name = path.basename(file);

    // Common burst patterns:
    // IMG_1234_1.JPG, IMG_1234_2.JPG (underscore sequence)
    // IMG_1234(1).JPG, IMG_1234(2).JPG (parenthesis sequence)
    // BURST1234_001.JPG, BURST1234_002.JPG (burst prefix)

    const underscoreMatch = name.match(/^(.+)_(\d+)(\.[^.]+)$/);
    if (underscoreMatch) {
      const [, prefix, seqStr, ext] = underscoreMatch;
      const key = `${prefix}${ext}`;
      if (!burstPatterns.has(key)) {
        burstPatterns.set(key, []);
      }
      burstPatterns.get(key)!.push({ file, seq: parseInt(seqStr, 10) });
      continue;
    }

    const parenMatch = name.match(/^(.+)\((\d+)\)(\.[^.]+)$/);
    if (parenMatch) {
      const [, prefix, seqStr, ext] = parenMatch;
      const key = `paren:${prefix}${ext}`;
      if (!burstPatterns.has(key)) {
        burstPatterns.set(key, []);
      }
      burstPatterns.get(key)!.push({ file, seq: parseInt(seqStr, 10) });
      continue;
    }

    const burstMatch = name.match(/^BURST(\d+)_(\d+)(\.[^.]+)$/i);
    if (burstMatch) {
      const [, burstId, seqStr, ext] = burstMatch;
      const key = `burst:${burstId}${ext}`;
      if (!burstPatterns.has(key)) {
        burstPatterns.set(key, []);
      }
      burstPatterns.get(key)!.push({ file, seq: parseInt(seqStr, 10) });
    }
  }

  // Create groups from patterns with 3+ files
  for (const [key, entries] of burstPatterns) {
    if (entries.length < 3) continue;

    // Sort by sequence number
    entries.sort((a, b) => a.seq - b.seq);

    // Check if sequential (allow small gaps)
    let isSequential = true;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].seq - entries[i - 1].seq > 2) {
        isSequential = false;
        break;
      }
    }

    if (isSequential) {
      const allFiles = entries.map(e => e.file);
      groups.push({
        type: 'burst_sequence',
        primaryFile: allFiles[0], // First in sequence
        relatedFiles: allFiles.slice(1),
        allFiles,
        metadata: {
          sequenceNumber: entries[0].seq,
          totalCount: entries.length,
        },
      });
    }
  }

  return groups;
}

/**
 * Detect HDR+SDR pairs
 * iOS creates _SDR.HEIC versions when exporting HDR
 */
function detectHdrSdrPairs(files: string[]): RelatedFileGroup[] {
  const groups: RelatedFileGroup[] = [];
  const processed = new Set<string>();

  for (const file of files) {
    if (processed.has(file)) continue;

    const name = path.basename(file);

    // Check for SDR suffix
    if (name.includes('_SDR.')) {
      const hdrName = name.replace('_SDR.', '.');
      const hdrFile = files.find(f => path.basename(f) === hdrName);

      if (hdrFile && !processed.has(hdrFile)) {
        groups.push({
          type: 'sdr_hdr_pair',
          primaryFile: hdrFile, // HDR is primary
          relatedFiles: [file],
          allFiles: [hdrFile, file],
        });
        processed.add(file);
        processed.add(hdrFile);
      }
    }
  }

  return groups;
}

/**
 * Check if a file is the primary in its group
 */
export function isPrimaryFile(file: string, groups: RelatedFileGroup[]): boolean {
  for (const group of groups) {
    if (group.primaryFile === file) return true;
    if (group.relatedFiles.includes(file)) return false;
  }
  return true; // Not in any group = standalone primary
}

/**
 * Find the group containing a specific file
 */
export function findGroupForFile(file: string, groups: RelatedFileGroup[]): RelatedFileGroup | undefined {
  return groups.find(g => g.allFiles.includes(file));
}

/**
 * Get the primary file for a given file
 */
export function getPrimaryFile(file: string, groups: RelatedFileGroup[]): string {
  const group = findGroupForFile(file, groups);
  return group ? group.primaryFile : file;
}

/**
 * Check if file should be hidden (SDR duplicate, embedded video, etc.)
 */
export function shouldHideFile(file: string, groups: RelatedFileGroup[]): boolean {
  const group = findGroupForFile(file, groups);
  if (!group) return false;

  // Hide SDR duplicates
  if (group.type === 'sdr_hdr_pair' && group.relatedFiles.includes(file)) {
    return true;
  }

  // Hide Live Photo video component
  if (group.type === 'live_photo' && group.relatedFiles.includes(file)) {
    return true;
  }

  return false;
}
