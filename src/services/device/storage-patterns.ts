/**
 * Storage Detection Patterns
 *
 * Patterns for identifying storage types, camera folder structures,
 * and optimizing I/O based on source.
 */

// =============================================================================
// NETWORK PATH DETECTION
// =============================================================================

/** Explicit network path prefixes */
export const NETWORK_PATH_PREFIXES = [
  '//',       // UNC paths (Windows-style)
  'smb://',   // SMB protocol
  'nfs://',   // NFS protocol
  'afp://',   // AFP protocol (legacy macOS)
  'cifs://',  // CIFS (SMB variant)
];

/** Known local volume name patterns (macOS) */
export const LOCAL_VOLUME_PATTERNS = [
  'macintosh hd',
  'ssd',
  'internal',
  'system',
  'data',           // macOS Catalina+ data volume
  'preboot',
  'recovery',
  'vm',
];

// =============================================================================
// SD CARD / CAMERA MEDIA DETECTION
// =============================================================================

/** Volume name patterns indicating external camera media */
export const CAMERA_VOLUME_PATTERNS = [
  // Generic
  'sdcard',
  'sd card',
  'no name',
  'untitled',
  'dcim',

  // Canon
  'eos_digital',
  'canon_dc',
  'canon',

  // Nikon
  'nikon',
  'nikon d',

  // Sony
  'sony',
  'pmhome',
  'private',

  // Panasonic/Lumix
  'panasonic',
  'lumix',

  // Fujifilm
  'fuji',
  'fujifilm',

  // GoPro
  'gopro',
  'hero',

  // DJI
  'dji',
  'mavic',
  'phantom',

  // Blackmagic
  'blackmagic',
  'bmpcc',

  // RED
  'red',
  'r3d',
];

// =============================================================================
// CAMERA FOLDER STRUCTURES
// =============================================================================

/** Camera-specific folder patterns for identifying source camera */
export const CAMERA_FOLDER_PATTERNS: Record<string, string[]> = {
  // Sony
  sony: [
    'PRIVATE/M4ROOT/CLIP',
    'PRIVATE/AVCHD/BDMV/STREAM',
    'XDROOT/Clip',
    'MP_ROOT',
  ],

  // Canon
  canon: [
    'DCIM/100CANON',
    'DCIM/100EOS',
    'CONTENTS/CLIPS',
    'PRIVATE/AVCHD',
  ],

  // Panasonic
  panasonic: [
    'PRIVATE/PANA_GRP',
    'PRIVATE/AVCHD',
    'DCIM/100_PANA',
  ],

  // Blackmagic
  blackmagic: [
    'Blackmagic',
  ],

  // RED
  red: [
    'R3D',
    '.RDC',
  ],

  // GoPro
  gopro: [
    'DCIM/100GOPRO',
    'DCIM/101GOPRO',
  ],

  // DJI
  dji: [
    'DCIM/100MEDIA',
    'DCIM/DJI_',
    'DJI_',
  ],

  // iPhone
  iphone: [
    'DCIM/100APPLE',
    'DCIM/101APPLE',
  ],

  // Generic DCIM
  generic: [
    'DCIM',
  ],
};

// =============================================================================
// FILENAME PATTERNS
// =============================================================================

/** Filename patterns by camera manufacturer */
export const FILENAME_PATTERNS: Record<string, string[]> = {
  sony: ['C*.MP4', 'C*.MXF', 'A*.MP4'],
  canon: ['MVI_*.MP4', 'MVI_*.MOV', '*.MXF'],
  panasonic: ['P*.MOV', 'P*.MP4'],
  blackmagic: ['*.BRAW', 'A*.MOV', 'B*.MOV'],
  red: ['*.R3D'],
  gopro: ['GH*.MP4', 'GX*.MP4', 'GOPR*.MP4', 'GP*.MP4'],
  dji: ['DJI_*.MP4', 'DJI_*.MOV'],
  iphone: ['IMG_*.MOV', 'IMG_*.MP4', 'RPReplay_*.MP4'],
  jvc: ['MOV*.MP4', 'MOV*.MTS'],

  // Legacy/dadcam patterns
  dadcam: [
    'MVI_*',
    'MOV*',
    'DSCN*',
    'VID_*',
    'CLIP*',
    '*.MTS',
    '*.M2TS',
  ],
};

// =============================================================================
// STORAGE TYPE & I/O CONFIG
// =============================================================================

export type StorageType = 'local' | 'network' | 'camera_media' | 'unknown';

export interface StorageConfig {
  type: StorageType;
  bufferSize: number;        // Bytes
  concurrency: number;       // Parallel operations
  operationDelayMs: number;  // Delay between operations
  description: string;
}

/** I/O configurations by storage type */
export const STORAGE_CONFIGS: Record<StorageType, StorageConfig> = {
  local: {
    type: 'local',
    bufferSize: 64 * 1024,         // 64KB - default Node.js
    concurrency: 8,                 // High parallelism OK
    operationDelayMs: 0,            // No delay needed
    description: 'Local storage (SSD/HDD)',
  },
  camera_media: {
    type: 'camera_media',
    bufferSize: 256 * 1024,         // 256KB - SD cards like larger blocks
    concurrency: 2,                 // Limit parallelism for SD cards
    operationDelayMs: 10,           // Small delay for flash wear leveling
    description: 'Camera media (SD/CFexpress)',
  },
  network: {
    type: 'network',
    bufferSize: 1024 * 1024,        // 1MB - fewer round-trips
    concurrency: 1,                 // Sequential to prevent overwhelm
    operationDelayMs: 50,           // Breathing room between ops
    description: 'Network storage (SMB/NFS)',
  },
  unknown: {
    type: 'unknown',
    bufferSize: 128 * 1024,
    concurrency: 2,
    operationDelayMs: 10,
    description: 'Unknown storage type',
  },
};

// =============================================================================
// DETECTION FUNCTIONS
// =============================================================================

/**
 * Detect storage type from path
 */
export function detectStorageType(filePath: string): StorageType {
  if (!filePath) return 'unknown';

  const lowerPath = filePath.toLowerCase();

  // Check explicit network prefixes
  for (const prefix of NETWORK_PATH_PREFIXES) {
    if (lowerPath.startsWith(prefix)) {
      return 'network';
    }
  }

  // macOS mounted volumes check
  if (filePath.startsWith('/Volumes/')) {
    const volumeName = filePath.split('/')[2] || '';
    const lowerVolume = volumeName.toLowerCase();

    // Check known local volume patterns
    for (const pattern of LOCAL_VOLUME_PATTERNS) {
      if (lowerVolume.includes(pattern)) {
        return 'local';
      }
    }

    // Check camera media patterns
    for (const pattern of CAMERA_VOLUME_PATTERNS) {
      if (lowerVolume.includes(pattern)) {
        return 'camera_media';
      }
    }

    // Unknown volume under /Volumes/ - treat as network to be safe
    return 'network';
  }

  // Linux mount points
  if (filePath.startsWith('/mnt/') || filePath.startsWith('/media/')) {
    // Could be local USB or network - check for camera patterns
    for (const pattern of CAMERA_VOLUME_PATTERNS) {
      if (lowerPath.includes(pattern)) {
        return 'camera_media';
      }
    }
    return 'network';
  }

  // Default: local
  return 'local';
}

/**
 * Get I/O configuration for a path
 */
export function getStorageConfig(filePath: string): StorageConfig {
  const type = detectStorageType(filePath);
  return STORAGE_CONFIGS[type];
}

/**
 * Detect camera manufacturer from folder structure
 */
export function detectCameraFromFolder(folderPath: string): string | null {
  const lowerPath = folderPath.toLowerCase();

  for (const [make, patterns] of Object.entries(CAMERA_FOLDER_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerPath.includes(pattern.toLowerCase())) {
        return make;
      }
    }
  }

  return null;
}

/**
 * Get volume name from macOS path
 */
export function getVolumeName(filePath: string): string | null {
  if (!filePath.startsWith('/Volumes/')) {
    return null;
  }
  return filePath.split('/')[2] || null;
}
