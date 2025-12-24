/**
 * File Type Detection Service
 *
 * Detects file types using magic bytes (not extension).
 * Routes files to appropriate metadata extractors.
 */

import { fileTypeFromFile, fileTypeFromBuffer } from 'file-type';
import * as path from 'node:path';

/**
 * File categories for routing to extractors
 */
export type FileCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'archive'
  | 'sidecar'
  | 'ebook'
  | 'executable'
  | 'data'
  | 'other'
  // Extended categories for universal extraction
  | 'email'       // .eml, .msg
  | 'font'        // .ttf, .otf, .woff, .woff2
  | 'model3d'     // .glb, .gltf, .obj, .fbx
  | 'calendar'    // .ics, .vcs
  | 'contact'     // .vcf
  | 'geospatial'  // .gpx, .kml, .geojson
  | 'subtitle';   // .srt, .vtt, .ass (separate from sidecar for text extraction)

/**
 * Subcategories for more specific classification
 */
export type FileSubcategory =
  // Image
  | 'photo'
  | 'raw'
  | 'graphic'
  | 'screenshot'
  | 'scan'
  // Video
  | 'clip'
  | 'movie'
  | 'timelapse'
  | 'screen_recording'
  // Audio
  | 'music'
  | 'voice'
  | 'podcast'
  | 'sound_effect'
  // Document
  | 'text'
  | 'spreadsheet'
  | 'presentation'
  | 'pdf'
  // Archive
  | 'compressed'
  | 'disk_image'
  | 'backup'
  // Sidecar
  | 'xmp'
  | 'json'
  | 'xml'
  | 'thm';

/**
 * Detection result
 */
export interface FileTypeResult {
  category: FileCategory;
  subcategory?: FileSubcategory;
  mimeType: string;
  extension: string;
  declaredExtension: string;
  extensionMismatch: boolean;
}

/**
 * RAW camera format extensions
 */
const RAW_EXTENSIONS = new Set([
  '.dng', '.cr2', '.cr3', '.crw', '.ciff',
  '.nef', '.nrw', '.arw', '.arq', '.srf', '.sr2',
  '.raf', '.orf', '.ori', '.rw2', '.raw', '.rwl',
  '.pef', '.ptx', '.srw', '.x3f', '.3fr', '.fff',
  '.iiq', '.mef', '.mos', '.dcr', '.k25', '.kdc',
  '.mrw', '.erf', '.gpr', '.rwz'
]);

/**
 * MIME type to category mapping
 */
const MIME_TO_CATEGORY: Record<string, FileCategory> = {
  // Images
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/avif': 'image',
  'image/heic': 'image',
  'image/heif': 'image',
  'image/tiff': 'image',
  'image/bmp': 'image',
  'image/svg+xml': 'image',
  'image/x-icon': 'image',
  'image/vnd.adobe.photoshop': 'image',
  'image/x-canon-cr2': 'image',
  'image/x-canon-cr3': 'image',
  'image/x-nikon-nef': 'image',
  'image/x-sony-arw': 'image',
  'image/x-fuji-raf': 'image',
  'image/x-olympus-orf': 'image',
  'image/x-panasonic-rw2': 'image',
  'image/x-adobe-dng': 'image',

  // Video
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/x-msvideo': 'video',
  'video/x-matroska': 'video',
  'video/webm': 'video',
  'video/x-m4v': 'video',
  'video/mpeg': 'video',
  'video/3gpp': 'video',
  'video/3gpp2': 'video',
  'video/x-flv': 'video',
  'video/MP2T': 'video',
  'video/x-ms-wmv': 'video',

  // Audio
  'audio/mpeg': 'audio',
  'audio/mp4': 'audio',
  'audio/aac': 'audio',
  'audio/ogg': 'audio',
  'audio/flac': 'audio',
  'audio/wav': 'audio',
  'audio/x-wav': 'audio',
  'audio/webm': 'audio',
  'audio/x-m4a': 'audio',
  'audio/x-aiff': 'audio',
  'audio/x-ms-wma': 'audio',
  'audio/opus': 'audio',

  // Documents
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  'application/rtf': 'document',
  'text/plain': 'document',
  'text/html': 'document',
  'text/markdown': 'document',
  'text/csv': 'document',

  // Archives
  'application/zip': 'archive',
  'application/x-rar-compressed': 'archive',
  'application/x-7z-compressed': 'archive',
  'application/x-tar': 'archive',
  'application/gzip': 'archive',
  'application/x-bzip2': 'archive',
  'application/x-xz': 'archive',

  // Ebooks
  'application/epub+zip': 'ebook',
  'application/x-mobipocket-ebook': 'ebook',

  // Data/Config
  'application/json': 'data',
  'application/xml': 'data',
  'text/xml': 'data',
  'application/x-yaml': 'data',

  // Executables
  'application/x-executable': 'executable',
  'application/x-mach-binary': 'executable',
  'application/x-dosexec': 'executable',
  'application/x-sharedlib': 'executable',
};

/**
 * Extension to category fallback (when magic bytes fail)
 */
const EXTENSION_TO_CATEGORY: Record<string, FileCategory> = {
  // Sidecar files (metadata companions, NOT subtitles)
  '.xmp': 'sidecar',
  '.thm': 'sidecar',
  '.lrf': 'sidecar',
  '.lrv': 'sidecar',   // GoPro low-res proxy
  '.aae': 'sidecar',
  '.moi': 'sidecar',   // Sony AVCHD metadata (pairs with .TOD/.MTS)
  '.cpi': 'sidecar',   // AVCHD clip info
  '.bdm': 'sidecar',   // Blu-ray disc metadata
  '.mpl': 'sidecar',   // AVCHD playlist
  '.rmd': 'sidecar',   // RED camera settings
  '.ale': 'sidecar',   // ARRI Avid Log Exchange
  '.sidecar': 'sidecar', // Blackmagic BRAW
  '.nksc': 'sidecar',  // Nikon NX Studio
  '.gpr': 'sidecar',   // GoPro RAW (companion to JPG)
  // Note: .xml is NOT added here because generic XML files are 'data'
  // Sony XML sidecars (M01.XML) are detected by naming pattern in exiftool.ts

  // Text documents
  '.txt': 'document',
  '.md': 'document',
  '.markdown': 'document',
  '.rst': 'document',
  '.log': 'data',

  // Config/data
  '.json': 'data',
  '.yaml': 'data',
  '.yml': 'data',
  '.xml': 'data',
  '.csv': 'document',
  '.tsv': 'document',

  // Ebooks
  '.epub': 'ebook',
  '.mobi': 'ebook',
  '.azw': 'ebook',
  '.azw3': 'ebook',
  '.azw4': 'ebook',
  '.kfx': 'ebook',
  '.fb2': 'ebook',

  // Email
  '.eml': 'email',
  '.msg': 'email',
  '.mbox': 'email',

  // Fonts
  '.ttf': 'font',
  '.otf': 'font',
  '.woff': 'font',
  '.woff2': 'font',
  '.eot': 'font',

  // 3D Models
  '.glb': 'model3d',
  '.gltf': 'model3d',
  '.obj': 'model3d',
  '.fbx': 'model3d',
  '.stl': 'model3d',
  '.dae': 'model3d',    // Collada
  '.3ds': 'model3d',
  '.blend': 'model3d',  // Blender
  '.usdz': 'model3d',   // Apple AR

  // Calendar
  '.ics': 'calendar',
  '.ical': 'calendar',
  '.vcs': 'calendar',   // vCalendar (older)

  // Contacts
  '.vcf': 'contact',
  '.vcard': 'contact',

  // Geospatial
  '.gpx': 'geospatial',
  '.kml': 'geospatial',
  '.kmz': 'geospatial',
  '.geojson': 'geospatial',
  '.shp': 'geospatial',
  '.gpkg': 'geospatial', // GeoPackage
  '.fit': 'geospatial',  // Garmin FIT
  '.tcx': 'geospatial',  // Training Center XML

  // Subtitles (separate from sidecar for text extraction)
  '.srt': 'subtitle',
  '.vtt': 'subtitle',
  '.ass': 'subtitle',
  '.ssa': 'subtitle',
  '.sub': 'subtitle',
  '.sbv': 'subtitle',   // YouTube
};

/**
 * Detect file type from file path
 */
export async function detectFileType(filePath: string): Promise<FileTypeResult> {
  const declaredExt = path.extname(filePath).toLowerCase();

  // Try magic bytes detection first
  let detected: Awaited<ReturnType<typeof fileTypeFromFile>> | undefined;
  try {
    detected = await fileTypeFromFile(filePath);
  } catch {
    // File might not exist or be readable
  }

  if (detected) {
    const category = MIME_TO_CATEGORY[detected.mime] ?? 'other';
    const subcategory = getSubcategory(category, detected.mime, declaredExt);

    return {
      category,
      subcategory,
      mimeType: detected.mime,
      extension: `.${detected.ext}`,
      declaredExtension: declaredExt,
      extensionMismatch: declaredExt !== `.${detected.ext}`,
    };
  }

  // Fallback to extension-based detection
  const category = EXTENSION_TO_CATEGORY[declaredExt] ??
    (RAW_EXTENSIONS.has(declaredExt) ? 'image' : 'other');

  const mimeType = getMimeFromExtension(declaredExt);
  const subcategory = getSubcategory(category, mimeType, declaredExt);

  return {
    category,
    subcategory,
    mimeType,
    extension: declaredExt,
    declaredExtension: declaredExt,
    extensionMismatch: false,
  };
}

/**
 * Detect file type from buffer
 */
export async function detectFileTypeFromBuffer(
  buffer: Buffer,
  filename?: string
): Promise<FileTypeResult> {
  const declaredExt = filename ? path.extname(filename).toLowerCase() : '';

  const detected = await fileTypeFromBuffer(buffer);

  if (detected) {
    const category = MIME_TO_CATEGORY[detected.mime] ?? 'other';
    const subcategory = getSubcategory(category, detected.mime, declaredExt);

    return {
      category,
      subcategory,
      mimeType: detected.mime,
      extension: `.${detected.ext}`,
      declaredExtension: declaredExt,
      extensionMismatch: declaredExt !== '' && declaredExt !== `.${detected.ext}`,
    };
  }

  // Fallback
  const category = declaredExt ? (EXTENSION_TO_CATEGORY[declaredExt] ?? 'other') : 'other';
  const mimeType = getMimeFromExtension(declaredExt);

  return {
    category,
    subcategory: undefined,
    mimeType,
    extension: declaredExt,
    declaredExtension: declaredExt,
    extensionMismatch: false,
  };
}

/**
 * Get subcategory based on category, MIME, and extension
 */
function getSubcategory(
  category: FileCategory,
  mimeType: string,
  extension: string
): FileSubcategory | undefined {
  if (category === 'image') {
    if (RAW_EXTENSIONS.has(extension)) return 'raw';
    if (mimeType.includes('svg')) return 'graphic';
    return 'photo';
  }

  if (category === 'document') {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('spreadsheet') || extension === '.xlsx' || extension === '.xls') {
      return 'spreadsheet';
    }
    if (mimeType.includes('presentation') || extension === '.pptx' || extension === '.ppt') {
      return 'presentation';
    }
    return 'text';
  }

  if (category === 'sidecar') {
    if (extension === '.xmp') return 'xmp';
    if (extension === '.json') return 'json';
    if (extension === '.xml') return 'xml';
    if (extension === '.thm') return 'thm';
  }

  if (category === 'archive') {
    if (extension === '.dmg' || extension === '.iso') return 'disk_image';
    return 'compressed';
  }

  return undefined;
}

/**
 * Get MIME type from extension (fallback)
 */
function getMimeFromExtension(extension: string): string {
  const mimeMap: Record<string, string> = {
    '.xmp': 'application/rdf+xml',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.srt': 'text/plain',
    '.vtt': 'text/vtt',
  };

  // RAW files
  if (RAW_EXTENSIONS.has(extension)) {
    return `image/x-raw`;
  }

  return mimeMap[extension] ?? 'application/octet-stream';
}

/**
 * All recognized sidecar extensions
 */
const SIDECAR_EXTS = new Set([
  '.xmp', '.thm', '.lrf', '.lrv',
  '.aae', '.moi', '.cpi', '.bdm', '.mpl',
  '.rmd', '.ale', '.sidecar', '.nksc', '.gpr',
]);

/**
 * Subtitle file extensions (separate from sidecars for text extraction)
 */
export const SUBTITLE_EXTS = new Set([
  '.srt', '.vtt', '.ass', '.ssa', '.sub', '.sbv',
]);

/**
 * Check if file is a subtitle
 */
export function isSubtitleFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUBTITLE_EXTS.has(ext);
}

/**
 * Check if file is a sidecar
 */
export function isSidecarFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SIDECAR_EXTS.has(ext);
}

/**
 * Check if file should be hidden (but still imported)
 */
export function isHiddenFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);

  // Hidden sidecars (proxies, thumbnails, edit files)
  if (['.aae', '.lrf', '.lrv', '.thm', '.moi', '.cpi', '.bdm', '.mpl'].includes(ext)) return true;

  // SDR duplicates
  if (basename.includes('_SDR.')) return true;

  return false;
}

/**
 * Check if file should be skipped entirely
 */
export function isSkippedFile(filePath: string): boolean {
  const basename = path.basename(filePath);

  const skipPatterns = [
    /^\._/,              // macOS resource forks
    /^\.DS_Store$/,      // macOS folder metadata
    /^Thumbs\.db$/i,     // Windows thumbnails
    /^desktop\.ini$/i,   // Windows folder settings
    /^\.Spotlight-/,     // macOS Spotlight
    /^\.fseventsd$/,     // macOS events
    /^\.Trashes$/,       // macOS trash
  ];

  return skipPatterns.some(p => p.test(basename));
}
