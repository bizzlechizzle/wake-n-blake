/**
 * Comprehensive Media File Type Definitions
 *
 * Categories:
 * - MEDIA: image, video, audio, sidecar (finite, well-known formats)
 * - DOCUMENT: everything else (infinite, treated as generic)
 *
 * Philosophy: Enumerate what we know, learn what we don't.
 */

// =============================================================================
// IMAGE FORMATS
// =============================================================================

/** Standard raster image formats */
export const IMAGE_EXTENSIONS = new Set([
  // Common web/display formats
  '.jpg', '.jpeg', '.jpe', '.jif', '.jfif',
  '.png', '.apng',
  '.gif',
  '.webp',
  '.avif',
  '.bmp', '.dib',
  '.tiff', '.tif',
  '.ico', '.cur',

  // Apple formats
  '.heic', '.heif', '.hif',

  // Modern formats
  '.jxl',      // JPEG XL
  '.jp2',      // JPEG 2000
  '.jpx',      // JPEG 2000 extended
  '.j2k', '.j2c',

  // Professional/editing
  '.psd',      // Photoshop
  '.psb',      // Photoshop Big
  '.xcf',      // GIMP
  '.kra',      // Krita

  // Vector (rasterizable)
  '.svg', '.svgz',

  // Legacy/specialized
  '.tga', '.icb', '.vda', '.vst',  // Targa
  '.pcx',      // PC Paintbrush
  '.ppm', '.pgm', '.pbm', '.pnm', // Netpbm
  '.hdr', '.exr',  // HDR formats
  '.dpx',      // Digital Picture Exchange (film)
  '.cin',      // Cineon (film)
  '.sgi', '.rgb', '.rgba', '.bw',  // Silicon Graphics
  '.pict', '.pct', '.pic',  // Mac PICT
  '.wmf', '.emf',  // Windows Metafile
  '.dds',      // DirectDraw Surface (textures)
  '.vtf',      // Valve Texture Format
  '.ktx', '.ktx2',  // Khronos Texture

  // Scanner/fax
  '.dcx',      // Multi-page PCX
  '.pcd',      // Kodak Photo CD
  '.fpx',      // FlashPix

  // Scientific/medical
  '.fits', '.fit', '.fts',  // FITS (astronomy)
  '.dcm', '.dicom',  // DICOM (medical)
]);

/** RAW camera formats (all manufacturers) */
export const RAW_EXTENSIONS = new Set([
  // Adobe
  '.dng',

  // Canon
  '.cr2', '.cr3', '.crw', '.ciff',

  // Nikon
  '.nef', '.nrw',

  // Sony
  '.arw', '.arq', '.srf', '.sr2',

  // Fujifilm
  '.raf',

  // Olympus/OM System
  '.orf', '.ori',

  // Panasonic/Lumix
  '.rw2', '.rwl',

  // Pentax/Ricoh
  '.pef', '.ptx', '.dcs',

  // Samsung
  '.srw',

  // Sigma
  '.x3f',

  // Leica
  '.rwl', '.dng',  // Leica uses DNG natively

  // Hasselblad
  '.3fr', '.fff',

  // Phase One
  '.iiq', '.cap',

  // Mamiya/Leaf
  '.mef', '.mos',

  // Kodak
  '.dcr', '.k25', '.kdc',

  // Minolta
  '.mrw', '.mdc',

  // Epson
  '.erf',

  // GoPro
  '.gpr',

  // Generic
  '.raw', '.rwz', '.bay',
]);

// =============================================================================
// VIDEO FORMATS
// =============================================================================

/** Video container formats */
export const VIDEO_EXTENSIONS = new Set([
  // Common containers
  '.mp4', '.m4v',
  '.mov',        // QuickTime
  '.mkv',        // Matroska
  '.webm',
  '.avi',
  '.wmv', '.asf',
  '.flv', '.f4v',

  // MPEG
  '.mpg', '.mpeg', '.mpe', '.m1v', '.m2v',
  '.vob',        // DVD Video Object
  '.m2p',        // MPEG-2 Program Stream

  // Transport streams
  '.ts', '.mts', '.m2ts',  // MPEG-TS, AVCHD
  '.tod',        // JVC AVCHD
  '.trp',

  // Mobile
  '.3gp', '.3g2', '.3gpp', '.3gpp2',

  // Professional
  '.mxf',        // Material Exchange Format
  '.gxf',        // General Exchange Format
  '.lxf',        // Leitch Exchange Format

  // Camera RAW video
  '.r3d',        // RED RAW
  '.braw',       // Blackmagic RAW
  '.ari',        // ARRI RAW
  '.rmv',        // CinemaDNG sequence

  // Legacy
  '.rm', '.rmvb',  // RealMedia
  '.ogv', '.ogg',  // Ogg Video
  '.divx',
  '.xvid',
  '.dv',         // DV format
  '.mj2',        // Motion JPEG 2000

  // Screen capture
  '.swf',        // Flash
  '.gif',        // Animated (also in images)

  // Image sequences (treated as video)
  '.dpx',        // Also in images
]);

// =============================================================================
// AUDIO FORMATS
// =============================================================================

/** Audio formats */
export const AUDIO_EXTENSIONS = new Set([
  // Lossy compressed
  '.mp3',
  '.aac', '.m4a', '.m4b', '.m4p', '.m4r',
  '.ogg', '.oga', '.opus',
  '.wma',
  '.mka',        // Matroska Audio
  '.webm',       // Can be audio-only
  '.ra', '.ram', // RealAudio

  // Lossless compressed
  '.flac',
  '.alac',       // Apple Lossless (usually in .m4a)
  '.ape',        // Monkey's Audio
  '.wv',         // WavPack
  '.tta',        // True Audio
  '.tak',        // Tom's Audio Kompressor
  '.ofr', '.ofs', // OptimFROG
  '.shn',        // Shorten

  // Uncompressed
  '.wav', '.wave',
  '.aiff', '.aif', '.aifc',
  '.au', '.snd',  // Sun/Unix audio
  '.pcm', '.raw',

  // Module/tracker
  '.mod', '.s3m', '.xm', '.it', '.mptm',
  '.umx',        // Unreal Music

  // MIDI
  '.mid', '.midi', '.kar', '.rmi',

  // Voice/speech
  '.amr', '.awb',  // Adaptive Multi-Rate
  '.spx',        // Speex
  '.gsm',

  // Professional
  '.dsd', '.dsf', '.dff',  // DSD Audio
  '.rf64', '.bwf',  // Broadcast Wave
  '.w64',        // Sony Wave64

  // Podcast/audiobook
  '.m4b',        // Audiobook
  '.aa', '.aax', // Audible

  // Playlists (not audio, but related)
  // '.m3u', '.m3u8', '.pls', '.wpl', '.xspf',
]);

// =============================================================================
// SIDECAR / METADATA FILES
// =============================================================================

/** Sidecar and metadata files that accompany media */
export const SIDECAR_EXTENSIONS = new Set([
  // Adobe/XMP
  '.xmp',

  // Apple
  '.aae',        // iOS photo adjustments

  // Subtitles/captions
  '.srt',        // SubRip
  '.vtt',        // WebVTT
  '.sub', '.idx', // VobSub
  '.ass', '.ssa', // Advanced SubStation
  '.smi', '.sami', // SAMI
  '.usf',        // Universal Subtitle Format
  '.ttml', '.dfxp', // Timed Text

  // DJI/Drone telemetry
  '.srt',        // DJI uses SRT for GPS/telemetry

  // GoPro
  '.lrv',        // Low-res video proxy
  '.thm',        // Thumbnail with EXIF

  // AVCHD structure
  '.moi',        // Metadata Object Index
  '.cpi',        // Clip Information
  '.bdm',        // Blu-ray Disc Metadata
  '.mpl',        // Movie Playlist

  // Professional camera
  '.rmd',        // RED metadata
  '.ale',        // ARRI Log Exchange
  '.sidecar',    // Blackmagic
  '.cdl',        // Color Decision List
  '.cube',       // 3D LUT

  // Nikon
  '.nksc',       // NX Studio

  // Canon
  '.thm',        // Thumbnail

  // Sony
  // Note: Sony uses XML sidecars (M01.XML) detected by pattern

  // Photo editing history
  '.xmp',
  '.pp3',        // RawTherapee
  '.arp',        // AfterShot Pro
  '.nef.xmp',    // Darktable

  // Checksum/verification
  '.md5', '.sha1', '.sha256', '.sfv',

  // Media info
  '.nfo',        // Scene info (text)
  '.diz',        // file_id.diz
]);

// =============================================================================
// EBOOK FORMATS
// =============================================================================

/** Ebook and digital publication formats */
export const EBOOK_EXTENSIONS = new Set([
  '.epub',
  '.kepub',      // Kobo EPUB
  '.mobi',
  '.azw', '.azw3', '.azw4', '.kfx',  // Kindle
  '.pdb', '.prc', // Palm
  '.fb2', '.fb2.zip',  // FictionBook
  '.lit',        // Microsoft Reader
  '.lrf', '.lrx', // Sony Reader (note: .lrf also used as video sidecar)
  '.cbz', '.cbr', '.cb7', '.cbt', '.cba',  // Comic books
  '.djvu', '.djv',
  '.ibooks',
  '.opf',        // EPUB metadata
]);

// =============================================================================
// GAME/ROM FORMATS (special category)
// =============================================================================

/** Video game ROMs and packages */
export const GAME_EXTENSIONS = new Set([
  // Nintendo Switch
  '.nsp',        // Nintendo Submission Package
  '.xci',        // Nintendo Switch Cartridge
  '.nsz',        // Compressed NSP
  '.xcz',        // Compressed XCI

  // Nintendo 3DS
  '.3ds', '.cia', '.cxi',

  // Nintendo DS
  '.nds', '.dsi',

  // Game Boy
  '.gb', '.gbc', '.gba', '.sgb',

  // Nintendo 64
  '.n64', '.z64', '.v64',

  // SNES/NES
  '.sfc', '.smc', '.nes', '.fds',

  // GameCube/Wii
  '.iso', '.gcm', '.wbfs', '.wad', '.rvz', '.nkit',

  // PlayStation
  '.iso', '.bin', '.cue', '.img',
  '.pkg',        // PS3/PS4/PS5 packages
  '.pbp',        // PSP

  // Xbox
  '.xbe', '.xex',

  // Sega
  '.md', '.smd', '.gen',  // Genesis (note: .md conflicts)
  '.32x', '.sms', '.gg',
  '.cdi', '.gdi', // Dreamcast

  // PC
  '.iso',
  '.mdf', '.mds',

  // Arcade - Note: MAME ROMs often use .zip/.7z but those are generic archive formats
  // Identify MAME by folder structure, not extension

  // Save states
  '.sav', '.srm', '.state',
]);

// =============================================================================
// ARCHIVE FORMATS
// =============================================================================

/** Compressed archive formats */
export const ARCHIVE_EXTENSIONS = new Set([
  '.zip',
  '.rar', '.r00', '.r01',  // RAR volumes
  '.7z',
  '.tar',
  '.gz', '.gzip', '.tgz', '.tar.gz',
  '.bz2', '.bzip2', '.tbz', '.tbz2', '.tar.bz2',
  '.xz', '.txz', '.tar.xz',
  '.zst', '.zstd', '.tar.zst',
  '.lz', '.lzma', '.tlz',
  '.lz4', '.tar.lz4',
  '.lzh', '.lha',  // LHA/LZH (legacy Japanese)
  '.arj',
  '.cab',
  '.ace',
  '.zoo',
  '.arc',
  '.pak',
  '.sit', '.sitx',  // StuffIt
  '.sea',        // Self-extracting
  '.dmg',        // macOS disk image
  '.iso',        // ISO 9660
  '.img',
  '.toast',
  '.vhd', '.vhdx', '.vmdk', '.vdi',  // Virtual disks
  '.wim',        // Windows Imaging
  '.squashfs', '.snap',
  '.apk',        // Android package
  '.ipa',        // iOS package
  '.deb', '.rpm', // Linux packages
  '.msi', '.msix', // Windows installer
  '.appx', '.appxbundle',
]);

// =============================================================================
// COMBINED SETS FOR QUICK LOOKUP
// =============================================================================

/** All media file extensions (image + video + audio) */
export const ALL_MEDIA_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...RAW_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
]);

/** All extensions we explicitly categorize (not "document/other") */
export const ALL_KNOWN_EXTENSIONS = new Set([
  ...ALL_MEDIA_EXTENSIONS,
  ...SIDECAR_EXTENSIONS,
  ...EBOOK_EXTENSIONS,
  ...GAME_EXTENSIONS,
  ...ARCHIVE_EXTENSIONS,
]);

// =============================================================================
// TYPE GUARDS AND HELPERS
// =============================================================================

export type MediaCategory = 'image' | 'raw' | 'video' | 'audio' | 'sidecar' | 'ebook' | 'game' | 'archive' | 'document';

/**
 * Get the category for a file extension
 */
export function getMediaCategory(ext: string): MediaCategory {
  const lowerExt = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;

  if (RAW_EXTENSIONS.has(lowerExt)) return 'raw';
  if (IMAGE_EXTENSIONS.has(lowerExt)) return 'image';
  if (VIDEO_EXTENSIONS.has(lowerExt)) return 'video';
  if (AUDIO_EXTENSIONS.has(lowerExt)) return 'audio';
  if (SIDECAR_EXTENSIONS.has(lowerExt)) return 'sidecar';
  if (EBOOK_EXTENSIONS.has(lowerExt)) return 'ebook';
  if (GAME_EXTENSIONS.has(lowerExt)) return 'game';
  if (ARCHIVE_EXTENSIONS.has(lowerExt)) return 'archive';

  return 'document';  // Everything else
}

/**
 * Check if extension is a known media type
 */
export function isMediaExtension(ext: string): boolean {
  const lowerExt = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return ALL_MEDIA_EXTENSIONS.has(lowerExt);
}

/**
 * Check if extension is known (any category)
 */
export function isKnownExtension(ext: string): boolean {
  const lowerExt = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return ALL_KNOWN_EXTENSIONS.has(lowerExt);
}
