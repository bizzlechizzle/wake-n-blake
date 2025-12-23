/**
 * Metadata Extraction Orchestrator
 *
 * Routes files to appropriate extractors based on file type.
 * Combines results from multiple tools for comprehensive metadata.
 */

import { detectFileType, type FileCategory } from '../file-type/detector.js';
import type {
  PhotoMetadata,
  VideoMetadata,
  AudioMetadata,
  DocumentMetadata,
} from '../xmp/schema.js';

import * as exiftool from './wrappers/exiftool.js';
import * as ffprobe from './wrappers/ffprobe.js';
import * as mediainfo from './wrappers/mediainfo.js';

/**
 * Combined metadata result
 */
export interface MetadataResult {
  photo?: PhotoMetadata;
  video?: VideoMetadata;
  audio?: AudioMetadata;
  document?: DocumentMetadata;
  cameraSerial?: string;
  lensSerial?: string;
  errors: string[];
  sources: string[];
}

/**
 * Extraction options
 */
export interface ExtractionOptions {
  /** Skip slow extractors */
  quick?: boolean;
  /** Force specific category (override detection) */
  forceCategory?: FileCategory;
  /** Include camera/lens serials */
  includeDeviceInfo?: boolean;
}

/**
 * Extract all relevant metadata for a file
 */
export async function extractMetadata(
  filePath: string,
  options: ExtractionOptions = {}
): Promise<MetadataResult> {
  const result: MetadataResult = {
    errors: [],
    sources: [],
  };

  // Detect file type
  let category: FileCategory;
  try {
    const typeResult = await detectFileType(filePath);
    category = options.forceCategory || typeResult.category;
  } catch (err) {
    result.errors.push(`File type detection failed: ${err}`);
    return result;
  }

  // Route to appropriate extractors
  switch (category) {
    case 'image':
      await extractImageMetadata(filePath, result, options);
      break;
    case 'video':
      await extractVideoMetadata(filePath, result, options);
      break;
    case 'audio':
      await extractAudioMetadata(filePath, result, options);
      break;
    case 'document':
      await extractDocumentMetadata(filePath, result, options);
      break;
    default:
      // No specialized extraction for other categories
      break;
  }

  return result;
}

/**
 * Extract image/photo metadata
 */
async function extractImageMetadata(
  filePath: string,
  result: MetadataResult,
  options: ExtractionOptions
): Promise<void> {
  try {
    result.photo = await exiftool.extractPhotoMetadata(filePath);
    result.sources.push('exiftool');

    // Get device serials if requested
    if (options.includeDeviceInfo) {
      result.cameraSerial = await exiftool.getCameraSerial(filePath);
      result.lensSerial = await exiftool.getLensSerial(filePath);
    }
  } catch (err) {
    result.errors.push(`ExifTool extraction failed: ${err}`);
  }
}

/**
 * Extract video metadata
 */
async function extractVideoMetadata(
  filePath: string,
  result: MetadataResult,
  options: ExtractionOptions
): Promise<void> {
  // Try ExifTool first for basic info and photo-like metadata
  try {
    const exifVideo = await exiftool.extractVideoMetadata(filePath);
    result.video = exifVideo;
    result.sources.push('exiftool');

    // Also get camera serial if this is from a camera
    if (options.includeDeviceInfo) {
      result.cameraSerial = await exiftool.getCameraSerial(filePath);
    }
  } catch (err) {
    result.errors.push(`ExifTool extraction failed: ${err}`);
  }

  // Skip additional extractors if quick mode
  if (options.quick) return;

  // Try MediaInfo for more detailed video info
  const mediainfoAvailable = await mediainfo.isMediaInfoAvailable();
  if (mediainfoAvailable) {
    try {
      const miVideo = await mediainfo.extractVideoMetadata(filePath);
      if (miVideo) {
        // Merge with existing, preferring MediaInfo for video-specific fields
        result.video = mergeVideoMetadata(result.video, miVideo);
        if (!result.sources.includes('mediainfo')) {
          result.sources.push('mediainfo');
        }
      }
    } catch (err) {
      result.errors.push(`MediaInfo extraction failed: ${err}`);
    }
  }

  // Try ffprobe as fallback or for additional info
  const ffprobeAvailable = await ffprobe.isFFProbeAvailable();
  if (ffprobeAvailable && (!mediainfoAvailable || !result.video?.frameRate)) {
    try {
      const ffVideo = await ffprobe.extractVideoMetadata(filePath);
      if (ffVideo) {
        result.video = mergeVideoMetadata(result.video, ffVideo);
        if (!result.sources.includes('ffprobe')) {
          result.sources.push('ffprobe');
        }
      }
    } catch (err) {
      result.errors.push(`ffprobe extraction failed: ${err}`);
    }
  }
}

/**
 * Extract audio metadata
 */
async function extractAudioMetadata(
  filePath: string,
  result: MetadataResult,
  options: ExtractionOptions
): Promise<void> {
  // Try ExifTool first (good for ID3 tags)
  try {
    result.audio = await exiftool.extractAudioMetadata(filePath);
    result.sources.push('exiftool');
  } catch (err) {
    result.errors.push(`ExifTool extraction failed: ${err}`);
  }

  // Skip additional extractors if quick mode
  if (options.quick) return;

  // Try ffprobe for duration and format info
  const ffprobeAvailable = await ffprobe.isFFProbeAvailable();
  if (ffprobeAvailable) {
    try {
      const ffAudio = await ffprobe.extractAudioMetadata(filePath);
      if (ffAudio) {
        result.audio = mergeAudioMetadata(result.audio, ffAudio);
        if (!result.sources.includes('ffprobe')) {
          result.sources.push('ffprobe');
        }
      }
    } catch (err) {
      result.errors.push(`ffprobe extraction failed: ${err}`);
    }
  }
}

/**
 * Extract document metadata
 */
async function extractDocumentMetadata(
  filePath: string,
  result: MetadataResult,
  _options: ExtractionOptions
): Promise<void> {
  // ExifTool handles PDF, Office docs, etc.
  try {
    result.document = await exiftool.extractDocumentMetadata(filePath);
    result.sources.push('exiftool');
  } catch (err) {
    result.errors.push(`ExifTool extraction failed: ${err}`);
  }
}

/**
 * Merge video metadata from two sources
 * First source is base, second source fills in missing values
 */
function mergeVideoMetadata(
  base: VideoMetadata | undefined,
  additional: VideoMetadata
): VideoMetadata {
  if (!base) return additional;

  return {
    container: base.container || additional.container,
    codec: base.codec || additional.codec,
    resolution: base.resolution || additional.resolution,
    width: base.width ?? additional.width,
    height: base.height ?? additional.height,
    frameRate: base.frameRate ?? additional.frameRate,
    frameRateMode: base.frameRateMode || additional.frameRateMode,
    bitRate: base.bitRate ?? additional.bitRate,
    duration: base.duration ?? additional.duration,
    frameCount: base.frameCount ?? additional.frameCount,
    colorSpace: base.colorSpace || additional.colorSpace,
    hdr: base.hdr || additional.hdr,
    scanType: base.scanType || additional.scanType,
    audioCodec: base.audioCodec || additional.audioCodec,
    audioChannels: base.audioChannels ?? additional.audioChannels,
    audioSampleRate: base.audioSampleRate ?? additional.audioSampleRate,
    audioBitRate: base.audioBitRate ?? additional.audioBitRate,
    audioBitDepth: base.audioBitDepth ?? additional.audioBitDepth,
    timecodeStart: base.timecodeStart || additional.timecodeStart,
    chapterCount: base.chapterCount ?? additional.chapterCount,
  };
}

/**
 * Merge audio metadata from two sources
 */
function mergeAudioMetadata(
  base: AudioMetadata | undefined,
  additional: AudioMetadata
): AudioMetadata {
  if (!base) return additional;

  return {
    album: base.album || additional.album,
    artist: base.artist || additional.artist,
    title: base.title || additional.title,
    track: base.track || additional.track,
    disc: base.disc || additional.disc,
    year: base.year ?? additional.year,
    genre: base.genre || additional.genre,
    duration: base.duration ?? additional.duration,
    format: base.format || additional.format,
    hasArt: base.hasArt ?? additional.hasArt,
    replayGain: base.replayGain ?? additional.replayGain,
    bpm: base.bpm ?? additional.bpm,
    comment: base.comment || additional.comment,
  };
}

/**
 * Check available extraction tools
 */
export async function getAvailableTools(): Promise<{
  exiftool: boolean;
  mediainfo: boolean;
  ffprobe: boolean;
}> {
  const [mediainfoAvail, ffprobeAvail] = await Promise.all([
    mediainfo.isMediaInfoAvailable(),
    ffprobe.isFFProbeAvailable(),
  ]);

  return {
    exiftool: true, // exiftool-vendored bundles ExifTool
    mediainfo: mediainfoAvail,
    ffprobe: ffprobeAvail,
  };
}

/**
 * Cleanup resources (call on exit)
 */
export async function cleanup(): Promise<void> {
  await exiftool.closeExifTool();
}

/**
 * Write full metadata JSON dump to file
 * Re-exported from exiftool wrapper for convenience
 */
export const writeFullMetadataJson = exiftool.writeFullMetadataJson;

// Re-export individual extractors for direct access
export { exiftool, ffprobe, mediainfo };
