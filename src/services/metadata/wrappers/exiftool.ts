/**
 * ExifTool Wrapper
 *
 * Uses exiftool-vendored for metadata extraction from
 * photos, videos, PDFs, and audio files.
 */

import { ExifTool } from 'exiftool-vendored';

// Use a flexible type for tag access since the strict Tags type doesn't include all possible properties
type FlexibleTags = Record<string, unknown>;
import type {
  PhotoMetadata,
  VideoMetadata,
  AudioMetadata,
  DocumentMetadata,
} from '../../xmp/schema.js';

// Singleton ExifTool instance for performance
let exiftoolInstance: ExifTool | undefined;

/**
 * Get or create ExifTool instance
 */
function getExifTool(): ExifTool {
  if (!exiftoolInstance) {
    exiftoolInstance = new ExifTool({
      taskTimeoutMillis: 30000,
      maxProcs: 4,
    });
  }
  return exiftoolInstance;
}

/**
 * Close ExifTool instance (call on process exit)
 */
export async function closeExifTool(): Promise<void> {
  if (exiftoolInstance) {
    await exiftoolInstance.end();
    exiftoolInstance = undefined;
  }
}

/**
 * Extract all metadata from a file
 */
export async function extractAllMetadata(filePath: string): Promise<FlexibleTags> {
  const exif = getExifTool();
  return exif.read(filePath) as unknown as FlexibleTags;
}

/**
 * Safely get a string value from tags
 */
function getString(tags: FlexibleTags, key: string): string | undefined {
  const val = tags[key];
  if (val === undefined || val === null) return undefined;
  return String(val);
}

/**
 * Safely get a number value from tags
 */
function getNumber(tags: FlexibleTags, key: string): number | undefined {
  const val = tags[key];
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'number') return val;
  const num = parseFloat(String(val));
  return isNaN(num) ? undefined : num;
}

/**
 * Extract photo metadata
 */
export async function extractPhotoMetadata(filePath: string): Promise<PhotoMetadata> {
  const tags = await extractAllMetadata(filePath);

  // Build camera/device string
  let creationDevice: string | undefined;
  const make = getString(tags, 'Make');
  const model = getString(tags, 'Model');
  if (make || model) {
    creationDevice = [make, model].filter(Boolean).join(' ');
  }

  // Parse GPS coordinates
  const gpsLatitude = getNumber(tags, 'GPSLatitude');
  const gpsLongitude = getNumber(tags, 'GPSLongitude');
  const gpsAltitude = getNumber(tags, 'GPSAltitude');

  // Parse capture date
  let captureDate: string | undefined;
  if (tags['DateTimeOriginal']) {
    captureDate = formatExifDate(tags['DateTimeOriginal']);
  } else if (tags['CreateDate']) {
    captureDate = formatExifDate(tags['CreateDate']);
  }

  return {
    creationDevice,
    creationSoftware: getString(tags, 'Software'),
    captureDate,
    gpsLatitude,
    gpsLongitude,
    gpsAltitude,
    lensModel: getString(tags, 'LensModel') || getString(tags, 'Lens'),
    focalLength: formatFocalLength(tags['FocalLength']),
    aperture: formatAperture(tags['FNumber'] || tags['Aperture']),
    shutterSpeed: formatShutterSpeed(tags['ExposureTime'] || tags['ShutterSpeed']),
    iso: getNumber(tags, 'ISO'),
    colorSpace: getString(tags, 'ColorSpace'),
    bitDepth: getNumber(tags, 'BitsPerSample'),
    iccProfile: getString(tags, 'ProfileDescription'),
  };
}

/**
 * Extract video metadata from ExifTool
 * Note: For detailed video info, use MediaInfo or ffprobe
 */
export async function extractVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const tags = await extractAllMetadata(filePath);

  // Parse duration
  let duration: number | undefined;
  if (tags['Duration'] !== undefined) {
    duration = parseDuration(tags['Duration']);
  }

  // Parse resolution
  const width = getNumber(tags, 'ImageWidth');
  const height = getNumber(tags, 'ImageHeight');
  let resolution: string | undefined;

  if (width && height) {
    resolution = `${width}x${height}`;
  }

  // Parse frame rate
  const frameRate = getNumber(tags, 'VideoFrameRate');

  return {
    container: getString(tags, 'FileType'),
    codec: getString(tags, 'CompressorID') || getString(tags, 'VideoCodec'),
    resolution,
    width,
    height,
    frameRate: frameRate && !isNaN(frameRate) ? frameRate : undefined,
    duration,
    audioCodec: getString(tags, 'AudioCodec') || getString(tags, 'AudioFormat'),
    audioChannels: getNumber(tags, 'AudioChannels'),
    audioSampleRate: getNumber(tags, 'AudioSampleRate'),
    timecodeStart: getString(tags, 'TimeCode'),
  };
}

/**
 * Extract audio metadata
 */
export async function extractAudioMetadata(filePath: string): Promise<AudioMetadata> {
  const tags = await extractAllMetadata(filePath);

  // Parse duration
  let duration: number | undefined;
  if (tags['Duration'] !== undefined) {
    duration = parseDuration(tags['Duration']);
  }

  // Parse year from various fields
  let year: number | undefined;
  const yearVal = tags['Year'] || tags['Date'];
  if (typeof yearVal === 'number') {
    year = yearVal;
  } else if (yearVal) {
    const match = String(yearVal).match(/\d{4}/);
    if (match) year = parseInt(match[0], 10);
  }

  return {
    album: getString(tags, 'Album'),
    artist: getString(tags, 'Artist') || getString(tags, 'AlbumArtist'),
    title: getString(tags, 'Title'),
    track: getString(tags, 'Track') || getString(tags, 'TrackNumber'),
    disc: getString(tags, 'DiscNumber') || getString(tags, 'Disc'),
    year,
    genre: getString(tags, 'Genre'),
    duration,
    format: getString(tags, 'FileType'),
    hasArt: tags['Picture'] !== undefined || tags['CoverArt'] !== undefined,
    comment: getString(tags, 'Comment'),
  };
}

/**
 * Extract document metadata
 */
export async function extractDocumentMetadata(filePath: string): Promise<DocumentMetadata> {
  const tags = await extractAllMetadata(filePath);

  return {
    title: getString(tags, 'Title'),
    author: getString(tags, 'Author') || getString(tags, 'Creator'),
    subject: getString(tags, 'Subject'),
    keywords: parseKeywords(tags['Keywords']),
    created: formatExifDate(tags['CreateDate'] || tags['CreationDate']),
    modified: formatExifDate(tags['ModifyDate']),
    pageCount: getNumber(tags, 'PageCount') || getNumber(tags, 'Pages'),
    pdfVersion: getString(tags, 'PDFVersion'),
    pdfProducer: getString(tags, 'Producer'),
    pdfEncrypted: tags['Encryption'] !== undefined && tags['Encryption'] !== 'None',
  };
}

/**
 * Get camera body serial number (for chain of custody)
 */
export async function getCameraSerial(filePath: string): Promise<string | undefined> {
  const tags = await extractAllMetadata(filePath);
  return getString(tags, 'SerialNumber') || getString(tags, 'InternalSerialNumber');
}

/**
 * Get lens serial number
 */
export async function getLensSerial(filePath: string): Promise<string | undefined> {
  const tags = await extractAllMetadata(filePath);
  return getString(tags, 'LensSerialNumber');
}

/**
 * Format ExifTool date to ISO string
 */
function formatExifDate(date: unknown): string | undefined {
  if (!date) return undefined;

  // ExifTool returns ExifDateTime objects
  if (typeof date === 'object' && date !== null && 'toISOString' in date && typeof (date as { toISOString: () => string }).toISOString === 'function') {
    return (date as { toISOString: () => string }).toISOString();
  }

  // Handle string dates
  if (typeof date === 'string') {
    // Convert EXIF format (YYYY:MM:DD HH:MM:SS) to ISO
    const match = date.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const [, y, m, d, h, min, s] = match;
      return `${y}-${m}-${d}T${h}:${min}:${s}`;
    }
  }

  return String(date);
}

/**
 * Format focal length
 */
function formatFocalLength(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'number') return `${value}mm`;
  return String(value);
}

/**
 * Format aperture (f-number)
 */
function formatAperture(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'number') return `f/${value.toFixed(1)}`;
  return String(value);
}

/**
 * Format shutter speed
 */
function formatShutterSpeed(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'number') {
    if (value >= 1) return `${value}s`;
    return `1/${Math.round(1 / value)}`;
  }
  return String(value);
}

/**
 * Parse duration to seconds
 */
function parseDuration(value: unknown): number | undefined {
  if (!value) return undefined;

  if (typeof value === 'number') return value;

  const str = String(value);

  // Handle "X.XX s" format
  const secMatch = str.match(/^([\d.]+)\s*s$/i);
  if (secMatch) return parseFloat(secMatch[1]);

  // Handle "HH:MM:SS" format
  const hmsMatch = str.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (hmsMatch) {
    const [, h, m, s] = hmsMatch;
    return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
  }

  // Handle "MM:SS" format
  const msMatch = str.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (msMatch) {
    const [, m, s] = msMatch;
    return parseInt(m, 10) * 60 + parseFloat(s);
  }

  return undefined;
}

/**
 * Parse keywords (can be string or array)
 */
function parseKeywords(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(/[,;]/).map(s => s.trim());
  return undefined;
}
