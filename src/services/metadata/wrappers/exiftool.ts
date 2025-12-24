/**
 * ExifTool Wrapper
 *
 * Uses exiftool-vendored for metadata extraction from
 * photos, videos, PDFs, and audio files.
 */

import { ExifTool } from 'exiftool-vendored';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

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
 * Write full metadata JSON dump to file
 * Creates a .meta.json file next to the source file with complete exiftool output
 */
export async function writeFullMetadataJson(filePath: string): Promise<string> {
  const tags = await extractAllMetadata(filePath);

  // Clean up the tags for JSON output - convert non-serializable values
  const cleanTags: FlexibleTags = {};
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined || value === null) continue;

    // Handle ExifDateTime objects
    if (typeof value === 'object' && value !== null && 'toISOString' in value && typeof (value as { toISOString: () => string }).toISOString === 'function') {
      cleanTags[key] = (value as { toISOString: () => string }).toISOString();
    } else if (Buffer.isBuffer(value)) {
      // Skip binary buffers, indicate they exist
      cleanTags[key] = `(Binary data ${value.length} bytes)`;
    } else {
      cleanTags[key] = value;
    }
  }

  const outputPath = `${filePath}.meta.json`;
  const jsonContent = JSON.stringify([cleanTags], null, 2);
  await fs.writeFile(outputPath, jsonContent, 'utf-8');

  return outputPath;
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

/**
 * Companion sidecar extensions that may contain metadata for media files.
 * Ordered by priority (first match wins for conflicting fields).
 */
export const COMPANION_SIDECAR_EXTENSIONS = [
  // Telemetry
  '.srt',      // DJI drone telemetry (GPS, camera settings per frame)
  '.lrf',      // DJI low-res flyback proxy video

  // Professional cameras
  '.xml',      // Sony professional cameras (NonRealTimeMeta), generic XML
  '.rmd',      // RED camera settings, LUT, CDL
  '.ale',      // ARRI Avid Log Exchange
  '.sidecar',  // Blackmagic BRAW metadata

  // AVCHD structure
  '.moi',      // Sony AVCHD metadata (paired with .TOD/.MTS)
  '.cpi',      // AVCHD clip info
  '.bdm',      // Blu-ray disc metadata
  '.mpl',      // AVCHD playlist

  // Thumbnails/proxies
  '.thm',      // Canon, GoPro thumbnail with EXIF (often has GPS!)
  '.lrv',      // GoPro low-res video proxy

  // RAW/edit sidecars
  '.gpr',      // GoPro RAW (DNG variant)
  '.xmp',      // Adobe XMP sidecar
  '.aae',      // Apple photo adjustments
  '.nksc',     // Nikon NX Studio
];

/**
 * Sony professional camera XML sidecar patterns.
 * Sony uses suffixes like M01.XML for metadata clips.
 */
const _SONY_XML_SUFFIXES = ['M01.XML', 'M01.xml', 'C01.XML', 'C01.xml'];

/**
 * OPTIMIZATION: Module-level Set for O(1) sidecar extension lookup
 * Created once at module load, not per function call
 */
const SIDECAR_EXT_SET = new Set(COMPANION_SIDECAR_EXTENSIONS.map(e => e.toLowerCase()));

/**
 * Video extensions that commonly have companion sidecars
 */
const VIDEO_WITH_SIDECAR_EXTENSIONS = new Set([
  '.mov',   // QuickTime (DJI drones, iPhones, etc.)
  '.mp4',   // MPEG-4
  '.m4v',   // Apple video
  '.tod',   // Sony AVCHD transport stream
  '.mts',   // AVCHD
  '.m2ts',  // AVCHD/Blu-ray
  '.mpg',   // MPEG
  '.mpeg',
  '.r3d',   // RED
  '.braw',  // Blackmagic RAW
  '.mxf',   // Professional broadcast (Sony, Panasonic, ARRI)
  '.avi',   // Legacy AVI
]);

/**
 * Photo extensions that commonly have companion sidecars
 */
const PHOTO_WITH_SIDECAR_EXTENSIONS = new Set([
  // RAW formats
  '.dng', '.cr2', '.cr3', '.crw',
  '.nef', '.nrw', '.arw', '.arq', '.srf', '.sr2',
  '.raf', '.orf', '.ori', '.rw2', '.raw', '.rwl',
  '.pef', '.ptx', '.srw', '.x3f', '.3fr', '.fff',
  '.iiq', '.mef', '.mos', '.dcr', '.k25', '.kdc',
  '.mrw', '.erf', '.gpr', '.rwz',
  // Standard formats
  '.jpg', '.jpeg', '.heic', '.heif', '.tif', '.tiff',
]);

/**
 * Extensions that should NOT have content embedded (too large, binary video)
 */
const NO_EMBED_EXTENSIONS = new Set([
  '.lrf',     // DJI low-res video (can be large)
  '.lrv',     // GoPro low-res video (can be large)
  '.gpr',     // GoPro RAW (large binary)
  '.sidecar', // BRAW sidecar (binary)
  '.nksc',    // Nikon sidecar (binary)
]);

/**
 * Max size for embedding sidecar content as base64 (10 MB)
 */
const MAX_EMBED_SIZE = 10 * 1024 * 1024;

/**
 * Determine whether a sidecar's content should be embedded in XMP.
 * Text-based sidecars under 10MB get embedded; binary proxies do not.
 */
export function shouldEmbedContent(ext: string, size: number): boolean {
  if (size > MAX_EMBED_SIZE) return false;
  if (NO_EMBED_EXTENSIONS.has(ext.toLowerCase())) return false;
  return true;
}

export interface CompanionSidecarResult {
  /** Path to the companion sidecar file */
  path: string;
  /** Extension of the sidecar (e.g., '.moi') */
  extension: string;
  /** All metadata from the sidecar */
  metadata: FlexibleTags;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find companion sidecar files for a media file.
 * Returns paths to any matching sidecars (e.g., MOV001.MOI for MOV001.TOD).
 * Handles special naming patterns like Sony's M01.XML suffix.
 * Uses case-insensitive matching for FAT32 compatibility.
 */
export async function findCompanionSidecars(filePath: string): Promise<string[]> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, path.extname(filePath));

  // Only look for companions for media files that commonly have them
  if (!VIDEO_WITH_SIDECAR_EXTENSIONS.has(ext) && !PHOTO_WITH_SIDECAR_EXTENSIONS.has(ext)) {
    return [];
  }

  const companions: string[] = [];

  // Read directory once for efficiency (avoids multiple fs.access calls)
  let dirContents: string[] = [];
  try {
    dirContents = await fs.readdir(dir);
  } catch {
    return [];
  }

  const baseLower = base.toLowerCase();
  const primaryFileName = path.basename(filePath);

  // OPTIMIZATION: Use module-level Set for O(1) lookup (created once, not per call)
  const sidecarExtSet = SIDECAR_EXT_SET;

  for (const file of dirContents) {
    // Skip the primary file itself
    if (file === primaryFileName) continue;

    const fileExt = path.extname(file).toLowerCase();
    const fileBase = path.basename(file, path.extname(file));
    const fileBaseLower = fileBase.toLowerCase();

    // Standard same-basename matching (case-insensitive for FAT32)
    if (fileBaseLower === baseLower && sidecarExtSet.has(fileExt)) {
      companions.push(path.join(dir, file));
      continue;
    }

    // Sony professional camera suffix patterns: base + M01/C01/S01 + .XML
    // e.g., "ZV-E1 2304.MP4" -> "ZV-E1 2304M01.XML"
    if (fileExt === '.xml') {
      // Check if file matches pattern: baseLower + [mcs]0[1-9]
      const sonyPattern = new RegExp(`^${escapeRegex(baseLower)}[mcs]0[1-9]$`, 'i');
      if (sonyPattern.test(fileBaseLower)) {
        companions.push(path.join(dir, file));
      }
    }
  }

  return companions;
}

/**
 * OPTIMIZATION: Batch discover companion sidecars for multiple files.
 * Reads each directory only once, caching the listing for all files in that directory.
 * Returns a Map from primary file path to its companion sidecar paths.
 */
export async function batchFindCompanionSidecars(
  filePaths: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const dirCache = new Map<string, string[]>();

  for (const filePath of filePaths) {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath, path.extname(filePath));

    // Only look for companions for media files that commonly have them
    if (!VIDEO_WITH_SIDECAR_EXTENSIONS.has(ext) && !PHOTO_WITH_SIDECAR_EXTENSIONS.has(ext)) {
      result.set(filePath, []);
      continue;
    }

    // OPTIMIZATION: Read directory only once per directory
    if (!dirCache.has(dir)) {
      try {
        dirCache.set(dir, await fs.readdir(dir));
      } catch {
        dirCache.set(dir, []);
      }
    }

    const dirContents = dirCache.get(dir)!;
    const companions: string[] = [];
    const baseLower = base.toLowerCase();
    const primaryFileName = path.basename(filePath);

    for (const file of dirContents) {
      if (file === primaryFileName) continue;

      const fileExt = path.extname(file).toLowerCase();
      const fileBase = path.basename(file, path.extname(file));
      const fileBaseLower = fileBase.toLowerCase();

      // Standard same-basename matching (case-insensitive for FAT32)
      if (fileBaseLower === baseLower && SIDECAR_EXT_SET.has(fileExt)) {
        companions.push(path.join(dir, file));
        continue;
      }

      // Sony professional camera suffix patterns
      if (fileExt === '.xml') {
        const sonyPattern = new RegExp(`^${escapeRegex(baseLower)}[mcs]0[1-9]$`, 'i');
        if (sonyPattern.test(fileBaseLower)) {
          companions.push(path.join(dir, file));
        }
      }
    }

    result.set(filePath, companions);
  }

  return result;
}

/**
 * Parse DJI SRT telemetry file to extract GPS and camera metadata.
 * DJI SRT files contain per-frame telemetry data.
 * Returns metadata from first frame (start) with GPS coordinates.
 */
async function parseDjiSrt(srtPath: string): Promise<FlexibleTags> {
  const content = await fs.readFile(srtPath, 'utf-8');
  const metadata: FlexibleTags = {};

  // Parse first subtitle block for initial metadata
  // Format: [iso: 100] [shutter: 1/640.0] [fnum: 2.8] [ev: 0.3] [ct: 5417]
  //         [color_md : dlog_m] [focal_len: 24.00]
  //         [latitude: 41.98172] [longitude: -76.24034]
  //         [rel_alt: 5.000 abs_alt: 228.818]

  // Extract timestamp from first frame
  const timestampMatch = content.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/);
  if (timestampMatch) {
    metadata['DJI:DateTimeOriginal'] = timestampMatch[0];
    metadata['DateTimeOriginal'] = timestampMatch[0].replace(' ', 'T');
  }

  // Extract GPS from first frame
  const latMatch = content.match(/\[latitude:\s*([-\d.]+)\]/);
  const lonMatch = content.match(/\[longitude:\s*([-\d.]+)\]/);
  if (latMatch && lonMatch) {
    metadata['DJI:GPSLatitude'] = parseFloat(latMatch[1]);
    metadata['DJI:GPSLongitude'] = parseFloat(lonMatch[1]);
    metadata['GPSLatitude'] = parseFloat(latMatch[1]);
    metadata['GPSLongitude'] = parseFloat(lonMatch[1]);
  }

  // Extract altitude
  const relAltMatch = content.match(/\[rel_alt:\s*([-\d.]+)/);
  const absAltMatch = content.match(/abs_alt:\s*([-\d.]+)\]/);
  if (relAltMatch) {
    metadata['DJI:RelativeAltitude'] = parseFloat(relAltMatch[1]);
  }
  if (absAltMatch) {
    metadata['DJI:AbsoluteAltitude'] = parseFloat(absAltMatch[1]);
    metadata['GPSAltitude'] = parseFloat(absAltMatch[1]);
  }

  // Extract camera settings from first frame
  const isoMatch = content.match(/\[iso:\s*(\d+)\]/);
  const shutterMatch = content.match(/\[shutter:\s*([^\]]+)\]/);
  const fnumMatch = content.match(/\[fnum:\s*([\d.]+)\]/);
  const evMatch = content.match(/\[ev:\s*([-\d.]+)\]/);
  const ctMatch = content.match(/\[ct:\s*(\d+)\]/);
  const colorMdMatch = content.match(/\[color_md\s*:\s*([^\]]+)\]/);
  const focalLenMatch = content.match(/\[focal_len:\s*([\d.]+)\]/);

  if (isoMatch) metadata['DJI:ISO'] = parseInt(isoMatch[1], 10);
  if (shutterMatch) metadata['DJI:ShutterSpeed'] = shutterMatch[1].trim();
  if (fnumMatch) metadata['DJI:FNumber'] = parseFloat(fnumMatch[1]);
  if (evMatch) metadata['DJI:ExposureCompensation'] = parseFloat(evMatch[1]);
  if (ctMatch) metadata['DJI:ColorTemperature'] = parseInt(ctMatch[1], 10);
  if (colorMdMatch) metadata['DJI:ColorMode'] = colorMdMatch[1].trim();
  if (focalLenMatch) metadata['DJI:FocalLength'] = parseFloat(focalLenMatch[1]);

  // Count total frames for duration estimate
  const frameMatches = content.match(/FrameCnt:\s*\d+/g);
  if (frameMatches) {
    metadata['DJI:FrameCount'] = frameMatches.length;
  }

  // Extract last GPS position for flight path info
  const allLats = content.match(/\[latitude:\s*([-\d.]+)\]/g);
  const allLons = content.match(/\[longitude:\s*([-\d.]+)\]/g);
  if (allLats && allLons && allLats.length > 1) {
    const lastLat = allLats[allLats.length - 1].match(/([-\d.]+)/);
    const lastLon = allLons[allLons.length - 1].match(/([-\d.]+)/);
    if (lastLat && lastLon) {
      metadata['DJI:GPSLatitudeEnd'] = parseFloat(lastLat[1]);
      metadata['DJI:GPSLongitudeEnd'] = parseFloat(lastLon[1]);
    }
  }

  metadata['DJI:TelemetrySource'] = 'SRT';
  return metadata;
}

/**
 * Parse Sony NonRealTimeMeta XML sidecar to extract professional metadata.
 * These files contain timecode, video format, device info, and acquisition metadata.
 */
async function parseSonyXml(xmlPath: string): Promise<FlexibleTags> {
  const content = await fs.readFile(xmlPath, 'utf-8');
  const metadata: FlexibleTags = {};

  // Extract UMID (Unique Material Identifier)
  const umidMatch = content.match(/umidRef="([^"]+)"/);
  if (umidMatch) {
    metadata['Sony:UMID'] = umidMatch[1];
  }

  // Extract duration
  const durationMatch = content.match(/<Duration\s+value="(\d+)"/);
  if (durationMatch) {
    metadata['Sony:DurationFrames'] = parseInt(durationMatch[1], 10);
  }

  // Extract creation date
  const creationMatch = content.match(/<CreationDate\s+value="([^"]+)"/);
  if (creationMatch) {
    metadata['Sony:CreationDate'] = creationMatch[1];
    metadata['DateTimeOriginal'] = creationMatch[1];
  }

  // Extract timecode
  const ltcMatch = content.match(/tcFps="([^"]+)"/);
  const ltcStartMatch = content.match(/<LtcChange\s+frameCount="0"\s+value="(\d+)"/);
  if (ltcMatch) {
    metadata['Sony:TimecodeFPS'] = ltcMatch[1];
  }
  if (ltcStartMatch) {
    // Convert to timecode format (HHMMSSFF)
    const tc = ltcStartMatch[1].padStart(8, '0');
    metadata['Sony:TimecodeStart'] = `${tc.slice(0,2)}:${tc.slice(2,4)}:${tc.slice(4,6)}:${tc.slice(6,8)}`;
  }

  // Extract video format
  const videoCodecMatch = content.match(/videoCodec="([^"]+)"/);
  const captureFpsMatch = content.match(/captureFps="([^"]+)"/);
  const pixelMatch = content.match(/pixel="(\d+)"/);
  const linesMatch = content.match(/numOfVerticalLine="(\d+)"/);
  const aspectMatch = content.match(/aspectRatio="([^"]+)"/);

  if (videoCodecMatch) metadata['Sony:VideoCodec'] = videoCodecMatch[1];
  if (captureFpsMatch) metadata['Sony:CaptureFPS'] = captureFpsMatch[1];
  if (pixelMatch && linesMatch) {
    metadata['Sony:Resolution'] = `${pixelMatch[1]}x${linesMatch[1]}`;
  }
  if (aspectMatch) metadata['Sony:AspectRatio'] = aspectMatch[1];

  // Extract audio format
  const audioChannelsMatch = content.match(/numOfChannel="(\d+)"/);
  const audioCodecMatch = content.match(/audioCodec="([^"]+)"/);
  if (audioChannelsMatch) metadata['Sony:AudioChannels'] = parseInt(audioChannelsMatch[1], 10);
  if (audioCodecMatch) metadata['Sony:AudioCodec'] = audioCodecMatch[1];

  // Extract device info
  const manufacturerMatch = content.match(/manufacturer="([^"]+)"/);
  const modelMatch = content.match(/modelName="([^"]+)"/);
  const serialMatch = content.match(/serialNo="([^"]+)"/);
  if (manufacturerMatch) metadata['Sony:Manufacturer'] = manufacturerMatch[1];
  if (modelMatch) metadata['Sony:Model'] = modelMatch[1];
  if (serialMatch) metadata['Sony:SerialNumber'] = serialMatch[1];

  // Extract color/gamma settings
  const gammaMatch = content.match(/CaptureGammaEquation"\s+value="([^"]+)"/);
  const colorMatch = content.match(/CaptureColorPrimaries"\s+value="([^"]+)"/);
  if (gammaMatch) metadata['Sony:GammaEquation'] = gammaMatch[1];
  if (colorMatch) metadata['Sony:ColorPrimaries'] = colorMatch[1];

  // Check for gyroscope/accelerometer data
  if (content.includes('Gyroscope')) {
    metadata['Sony:HasGyroscopeData'] = true;
  }
  if (content.includes('Accelerometor')) {
    metadata['Sony:HasAccelerometerData'] = true;
  }

  metadata['Sony:MetadataSource'] = 'NonRealTimeMeta';
  return metadata;
}

/**
 * Parse THM thumbnail file to extract EXIF metadata (especially GPS).
 * THM files are JPEGs with full EXIF data, often containing GPS that
 * the video itself lacks.
 */
async function parseThmMetadata(thmPath: string): Promise<FlexibleTags> {
  // THM files are JPEGs with EXIF - use exiftool
  const tags = await extractAllMetadata(thmPath);

  const metadata: FlexibleTags = {};

  // Copy all meaningful tags with THM: prefix
  for (const [key, value] of Object.entries(tags)) {
    if (key === 'SourceFile' || key === 'Directory' || key === 'FileName') continue;
    if (value === undefined || value === null) continue;

    metadata[`THM:${key}`] = value;

    // Copy GPS to standard fields if present (THM often has GPS video lacks)
    if (key === 'GPSLatitude' && value) metadata['GPSLatitude'] = value;
    if (key === 'GPSLongitude' && value) metadata['GPSLongitude'] = value;
    if (key === 'GPSAltitude' && value) metadata['GPSAltitude'] = value;
    if (key === 'DateTimeOriginal' && value) metadata['DateTimeOriginal'] = value;
    if (key === 'Make' && value) metadata['Make'] = value;
    if (key === 'Model' && value) metadata['Model'] = value;
  }

  metadata['THM:MetadataSource'] = 'Thumbnail';
  return metadata;
}

/**
 * Parse Apple AAE adjustment file to detect edits.
 * AAE files contain non-destructive adjustments applied in iOS Photos.
 */
async function parseAaeMetadata(aaePath: string): Promise<FlexibleTags> {
  const content = await fs.readFile(aaePath, 'utf-8');
  const metadata: FlexibleTags = {};

  // Check if it has adjustments
  metadata['Apple:HasAdjustments'] = content.includes('adjustmentData');

  // Extract format identifier
  const formatMatch = content.match(/<key>adjustmentFormatIdentifier<\/key>\s*<string>([^<]+)/);
  if (formatMatch) {
    metadata['Apple:AdjustmentFormat'] = formatMatch[1];
  }

  // Extract version
  const versionMatch = content.match(/<key>adjustmentFormatVersion<\/key>\s*<integer>(\d+)/);
  if (versionMatch) {
    metadata['Apple:AdjustmentVersion'] = parseInt(versionMatch[1], 10);
  }

  // Detect specific adjustment types
  if (content.includes('crop')) metadata['Apple:HasCrop'] = true;
  if (content.includes('filter')) metadata['Apple:HasFilter'] = true;
  if (content.includes('exposure')) metadata['Apple:HasExposure'] = true;
  if (content.includes('live-photo')) metadata['Apple:HasLivePhotoEdit'] = true;

  metadata['Apple:MetadataSource'] = 'AAE';
  return metadata;
}

/**
 * Parse RED RMD metadata file.
 * RMD files contain camera settings, LUT references, and color metadata.
 */
async function parseRmdMetadata(rmdPath: string): Promise<FlexibleTags> {
  // RMD has binary header but may contain readable XML/text
  const buffer = await fs.readFile(rmdPath);
  const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 20000));
  const metadata: FlexibleTags = {};

  // Look for embedded settings (varies by RED firmware version)
  const isoMatch = content.match(/ISO[:\s=]+(\d+)/i);
  const wbMatch = content.match(/(?:WhiteBalance|Kelvin)[:\s=]+(\d+)/i);
  const shutterMatch = content.match(/Shutter[:\s=]+([^\s<]+)/i);
  const gammaMatch = content.match(/Gamma[:\s=]+([^\s<]+)/i);
  const colorSpaceMatch = content.match(/ColorSpace[:\s=]+([^\s<]+)/i);

  if (isoMatch) metadata['RED:ISO'] = parseInt(isoMatch[1], 10);
  if (wbMatch) metadata['RED:WhiteBalance'] = parseInt(wbMatch[1], 10);
  if (shutterMatch) metadata['RED:Shutter'] = shutterMatch[1];
  if (gammaMatch) metadata['RED:Gamma'] = gammaMatch[1];
  if (colorSpaceMatch) metadata['RED:ColorSpace'] = colorSpaceMatch[1];

  metadata['RED:HasRMD'] = true;
  metadata['RED:MetadataSource'] = 'RMD';
  return metadata;
}

/**
 * Parse ARRI ALE (Avid Log Exchange) file.
 * ALE files are tab-delimited text with clip metadata.
 */
async function parseAleMetadata(alePath: string): Promise<FlexibleTags> {
  const content = await fs.readFile(alePath, 'utf-8');
  const metadata: FlexibleTags = {};

  // Extract video format from header
  const videoFormatMatch = content.match(/VIDEO_FORMAT\s+(.+)/);
  if (videoFormatMatch) {
    metadata['ARRI:VideoFormat'] = videoFormatMatch[1].trim();
  }

  // Extract FPS
  const fpsMatch = content.match(/FPS\s+(\d+(?:\.\d+)?)/);
  if (fpsMatch) {
    metadata['ARRI:FPS'] = parseFloat(fpsMatch[1]);
  }

  // Extract audio format
  const audioMatch = content.match(/AUDIO_FORMAT\s+(.+)/);
  if (audioMatch) {
    metadata['ARRI:AudioFormat'] = audioMatch[1].trim();
  }

  // Count clips in the ALE
  const clipLines = content.split('\n').filter(line => /^[A-Z]\d{3}C\d{3}/.test(line));
  if (clipLines.length > 0) {
    metadata['ARRI:ClipCount'] = clipLines.length;
  }

  metadata['ARRI:MetadataSource'] = 'ALE';
  return metadata;
}

/**
 * Extract metadata from all companion sidecar files.
 * Returns an array of results with metadata from each sidecar found.
 */
export async function extractCompanionMetadata(
  filePath: string
): Promise<CompanionSidecarResult[]> {
  const companions = await findCompanionSidecars(filePath);
  const results: CompanionSidecarResult[] = [];

  for (const companionPath of companions) {
    try {
      const ext = path.extname(companionPath).toLowerCase();
      let metadata: FlexibleTags;

      // Use specialized parsers for specific formats
      if (ext === '.srt') {
        metadata = await parseDjiSrt(companionPath);
      } else if (ext === '.xml') {
        // Check if it's a Sony NonRealTimeMeta XML
        const content = await fs.readFile(companionPath, 'utf-8');
        if (content.includes('NonRealTimeMeta') || content.includes('professionalDisc')) {
          metadata = await parseSonyXml(companionPath);
        } else {
          // Generic XML - use exiftool
          metadata = await extractAllMetadata(companionPath);
        }
      } else if (ext === '.thm') {
        // Thumbnail with EXIF (Canon, GoPro) - important for GPS
        metadata = await parseThmMetadata(companionPath);
      } else if (ext === '.aae') {
        // Apple adjustments
        metadata = await parseAaeMetadata(companionPath);
      } else if (ext === '.rmd') {
        // RED camera metadata
        metadata = await parseRmdMetadata(companionPath);
      } else if (ext === '.ale') {
        // ARRI Avid Log Exchange
        metadata = await parseAleMetadata(companionPath);
      } else if (ext === '.lrf' || ext === '.lrv' || ext === '.gpr' || ext === '.sidecar' || ext === '.nksc') {
        // Binary files - just mark as present, don't extract
        metadata = {
          [`${ext.slice(1).toUpperCase()}:Present`]: true,
          [`${ext.slice(1).toUpperCase()}:MetadataSource`]: ext.slice(1).toUpperCase(),
        };
      } else {
        metadata = await extractAllMetadata(companionPath);
      }

      results.push({
        path: companionPath,
        extension: ext,
        metadata,
      });
    } catch {
      // Skip sidecars we can't read
    }
  }

  return results;
}

/**
 * Merge companion sidecar metadata into primary file metadata.
 * Priority: primary file > first sidecar > second sidecar > etc.
 * Returns the merged metadata and list of ingested sidecars.
 */
export async function mergeCompanionMetadata(
  filePath: string,
  primaryMetadata: FlexibleTags
): Promise<{
  merged: FlexibleTags;
  ingestedSidecars: Array<{ path: string; extension: string }>;
}> {
  const companions = await extractCompanionMetadata(filePath);
  const ingestedSidecars: Array<{ path: string; extension: string }> = [];

  if (companions.length === 0) {
    return { merged: primaryMetadata, ingestedSidecars };
  }

  // Start with primary metadata
  const merged: FlexibleTags = { ...primaryMetadata };

  // Merge in companion metadata (lower priority than primary)
  for (const companion of companions) {
    ingestedSidecars.push({
      path: companion.path,
      extension: companion.extension,
    });

    for (const [key, value] of Object.entries(companion.metadata)) {
      // Skip internal exiftool fields
      if (key === 'SourceFile' || key === 'Directory' || key === 'FileName') {
        continue;
      }

      // Only add if primary doesn't have this field or it's empty/undefined
      if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
        merged[key] = value;
      }
    }

    // Special handling: prefer DateTimeOriginal from MOI files
    // (they often have more precise timestamps than the video container)
    if (companion.extension === '.moi' && companion.metadata['DateTimeOriginal']) {
      merged['DateTimeOriginal'] = companion.metadata['DateTimeOriginal'];
      merged['DateTimeOriginalSource'] = 'companion:moi';
    }

    // Special handling for DJI SRT telemetry files
    // Prefer GPS from SRT as it's frame-accurate telemetry
    if (companion.extension === '.srt' && companion.metadata['DJI:TelemetrySource']) {
      // GPS coordinates from SRT are more precise (per-frame telemetry)
      if (companion.metadata['GPSLatitude'] !== undefined) {
        merged['GPSLatitude'] = companion.metadata['GPSLatitude'];
        merged['GPSLongitude'] = companion.metadata['GPSLongitude'];
        merged['GPSAltitude'] = companion.metadata['GPSAltitude'];
        merged['GPSSource'] = 'companion:srt';
      }
      // DJI-specific fields always get added
      for (const [key, value] of Object.entries(companion.metadata)) {
        if (key.startsWith('DJI:')) {
          merged[key] = value;
        }
      }
    }
  }

  return { merged, ingestedSidecars };
}
