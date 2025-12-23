/**
 * XMP Schema Definitions
 *
 * Namespace URIs and property definitions for wake-n-blake XMP sidecars.
 */

/**
 * XMP Namespaces
 */
export const XMP_NAMESPACES = {
  // Standard namespaces
  x: 'adobe:ns:meta/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  dc: 'http://purl.org/dc/elements/1.1/',
  xmp: 'http://ns.adobe.com/xap/1.0/',
  xmpMM: 'http://ns.adobe.com/xap/1.0/mm/',
  photoshop: 'http://ns.adobe.com/photoshop/1.0/',
  exif: 'http://ns.adobe.com/exif/1.0/',
  tiff: 'http://ns.adobe.com/tiff/1.0/',

  // Wake-n-Blake namespace
  wnb: 'http://wake-n-blake.dev/xmp/1.0/',
} as const;

/**
 * Current schema version
 */
export const SCHEMA_VERSION = 2;

/**
 * Source type classification
 */
export type SourceType =
  | 'memory_card'
  | 'camera_direct'
  | 'phone_direct'
  | 'local_disk'
  | 'network_share'
  | 'cloud_sync'
  | 'cloud_download'
  | 'web_download'
  | 'email_attachment'
  | 'messaging_app'
  | 'airdrop'
  | 'bluetooth'
  | 'optical_disc'
  | 'tape'
  | 'ftp_sftp'
  | 'version_control'
  | 'backup_restore'
  | 'forensic_recovery'
  | 'unknown';

/**
 * File category
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
  | 'other';

/**
 * Media type (for physical media)
 */
export type MediaType = 'sd' | 'cf' | 'cfexpress' | 'ssd' | 'hdd' | 'nvme';

/**
 * Custody event action (PREMIS-aligned)
 */
export type CustodyEventAction =
  | 'creation'
  | 'ingestion'
  | 'message_digest_calculation'
  | 'fixity_check'
  | 'virus_check'
  | 'format_identification'
  | 'format_validation'
  | 'migration'
  | 'normalization'
  | 'replication'
  | 'deletion'
  | 'modification'
  | 'metadata_modification'
  | 'deaccession'
  | 'recovery'
  | 'quarantine'
  | 'release'
  | 'access'
  | 'redaction'
  | 'decryption'
  | 'compression'
  | 'decompression';

/**
 * Related file relationship type
 */
export type RelationType =
  | 'raw_jpeg_pair'
  | 'raw_sidecar'
  | 'video_audio'
  | 'video_proxy'
  | 'burst_sequence'
  | 'hdr_bracket'
  | 'panorama_set'
  | 'focus_stack'
  | 'stereo_pair'
  | 'live_photo'
  | 'motion_photo'
  | 'sdr_hdr_pair'
  | 'drone_telemetry'
  | 'document_assets';

/**
 * USB device information
 */
export interface USBDeviceInfo {
  vendorId?: string;
  productId?: string;
  serial?: string;
  devicePath?: string;
  deviceName?: string;
  busLocation?: string;
}

/**
 * Card reader information
 */
export interface CardReaderInfo {
  vendor?: string;
  model?: string;
  serial?: string;
  port?: string;
}

/**
 * Physical media information
 */
export interface MediaInfo {
  type?: MediaType;
  serial?: string;
  manufacturer?: string;
  capacity?: number;
  firmware?: string;
}

/**
 * Import source device
 */
export interface ImportSourceDevice {
  usb?: USBDeviceInfo;
  cardReader?: CardReaderInfo;
  media?: MediaInfo;
  cameraBodySerial?: string;
  cameraInternalName?: string;
  phoneDeviceId?: string;
  tetheredConnection?: 'usb' | 'wifi' | 'bluetooth' | 'thunderbolt';
}

/**
 * Custody chain event
 */
export interface CustodyEvent {
  eventId: string;
  eventTimestamp: string;
  eventAction: CustodyEventAction;
  eventOutcome: 'success' | 'failure' | 'partial';
  eventLocation?: string;
  eventHost?: string;
  eventUser?: string;
  eventTool?: string;
  eventHash?: string;
  eventHashAlgorithm?: string;
  eventNotes?: string;
  eventDetails?: string;
}

/**
 * Photo metadata (from EXIF)
 */
export interface PhotoMetadata {
  creationDevice?: string;
  creationSoftware?: string;
  captureDate?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;
  lensModel?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: number;
  colorSpace?: string;
  bitDepth?: number;
  iccProfile?: string;
}

/**
 * Video metadata (from MediaInfo/ffprobe)
 */
export interface VideoMetadata {
  container?: string;
  codec?: string;
  resolution?: string;
  width?: number;
  height?: number;
  frameRate?: number;
  frameRateMode?: 'constant' | 'variable';
  bitRate?: number;
  duration?: number;
  frameCount?: number;
  colorSpace?: string;
  hdr?: string;
  scanType?: 'progressive' | 'interlaced';
  audioCodec?: string;
  audioChannels?: number;
  audioSampleRate?: number;
  audioBitRate?: number;
  audioBitDepth?: number;
  timecodeStart?: string;
  chapterCount?: number;
}

/**
 * Audio metadata (from mutagen/id3v2)
 */
export interface AudioMetadata {
  album?: string;
  artist?: string;
  title?: string;
  track?: string;
  disc?: string;
  year?: number;
  genre?: string;
  duration?: number;
  format?: string;
  hasArt?: boolean;
  replayGain?: number;
  bpm?: number;
  comment?: string;
}

/**
 * Document metadata (from Tika/Poppler)
 */
export interface DocumentMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  created?: string;
  modified?: string;
  pageCount?: number;
  wordCount?: number;
  language?: string;
  pdfVersion?: string;
  pdfProducer?: string;
  pdfEncrypted?: boolean;
  pdfHasForm?: boolean;
  pdfHasSignature?: boolean;
  officeApplication?: string;
  officeTemplate?: string;
}

/**
 * Complete XMP sidecar data
 */
export interface XmpSidecarData {
  // Sidecar self-integrity
  schemaVersion: number;
  sidecarCreated: string;
  sidecarUpdated: string;

  // Core identity
  contentHash: string;  // Short hash (16 chars) for filename
  contentHashFull?: string;  // Full hash (64 chars) for verification - optional for backwards compat
  hashAlgorithm: 'blake3';
  fileSize: number;
  verified: boolean;

  // Verification proof (source vs destination)
  sourceHash?: string;  // Hash of source file before copy
  destHash?: string;  // Hash of destination file after copy
  hashMatch?: boolean;  // True if source === dest

  // File classification
  fileCategory: FileCategory;
  fileSubcategory?: string;
  detectedMimeType: string;
  declaredExtension: string;
  extensionMismatch?: boolean;
  formatValid?: boolean;

  // Source provenance
  sourcePath: string;
  sourceFilename: string;
  sourceHost: string;
  sourceVolume?: string;
  sourceVolumeSerial?: string;
  sourceType: SourceType;

  // Import source device
  sourceDevice?: ImportSourceDevice;

  // Timestamps
  originalMtime: string;
  originalCtime?: string;
  originalBtime?: string;
  originalAtime?: string;
  sourceTimezone?: string;
  importTimezone?: string;

  // Import context
  importTimestamp: string;
  sessionId: string;
  toolVersion: string;
  importUser: string;
  importHost: string;
  importPlatform: 'darwin' | 'linux' | 'win32';
  importOSVersion?: string;
  importMethod?: 'copy' | 'move' | 'hardlink' | 'symlink';

  // Batch context
  batchId?: string;
  batchName?: string;
  batchDescription?: string;
  batchFileCount?: number;
  batchSequence?: number;
  batchTotalBytes?: number;

  // Deduplication
  dedupStatus?: 'unique' | 'duplicate' | 'hardlinked';
  duplicateOf?: string;
  duplicateCount?: number;

  // File renaming
  wasRenamed?: boolean;
  destFilename?: string;
  renameReason?: 'hash_naming' | 'collision' | 'sanitization';

  // Related files
  relatedFiles?: string[];
  relationType?: RelationType;
  isPrimaryFile?: boolean;
  isLivePhoto?: boolean;
  livePhotoRole?: 'image' | 'video';
  livePhotoPairHash?: string;
  motionHidden?: boolean;
  sdrDuplicate?: boolean;
  hdrPrimaryHash?: string;

  // Inherited metadata
  inheritedXMP?: string;
  inheritedSidecar?: string;
  inheritedSidecarFormat?: 'xmp' | 'json' | 'xml';

  // Category-specific metadata (curated)
  photo?: PhotoMetadata;
  video?: VideoMetadata;
  audio?: AudioMetadata;
  document?: DocumentMetadata;

  // Raw exiftool metadata (complete dump - all fields)
  rawMetadata?: Record<string, unknown>;

  // Copied companion sidecars (e.g., .SRT, .MOI - preserved alongside primary file)
  copiedCompanions?: Array<{
    sourcePath: string;      // Original path of the companion sidecar
    destPath: string;        // Destination path (relative to primary file)
    extension: string;       // File extension (e.g., '.srt', '.moi')
    hash: string;            // BLAKE3 hash for integrity verification
    size: number;            // File size in bytes
    contentBase64?: string;  // Full file content as base64 (for archival embedding)
  }>;

  // Ingested companion sidecars (metadata extracted and merged into rawMetadata)
  ingestedCompanions?: Array<{
    sourcePath: string;      // Original path of the companion sidecar
    extension: string;       // File extension (e.g., '.moi')
    fieldsAdded: string[];   // List of metadata fields added from this sidecar
  }>;

  // Cloud/download provenance
  downloadURL?: string;
  downloadTimestamp?: string;
  downloadReferrer?: string;
  cloudService?: string;
  cloudPath?: string;
  cloudSharedBy?: string;
  cloudShareDate?: string;
  emailSubject?: string;
  emailSender?: string;
  emailDate?: string;

  // Platform-specific
  quarantineOrigin?: string;
  quarantineTimestamp?: string;
  quarantineAgent?: string;
  zoneIdentifier?: string;

  // Chain of custody
  custodyChain: CustodyEvent[];
  firstSeen: string;
  eventCount: number;

  // Errors/warnings
  importWarnings?: string[];
  importErrors?: string[];
}
