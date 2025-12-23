/**
 * Wake-n-Blake Zod Schemas
 * Validation schemas for all data types
 */

import { z } from 'zod';

// ============================================
// HASH SCHEMAS
// ============================================

export const Blake3HashSchema = z.string()
  .length(16)
  .regex(/^[a-f0-9]+$/, 'Must be 16 lowercase hex characters');

export const Blake3FullHashSchema = z.string()
  .length(64)
  .regex(/^[a-f0-9]+$/, 'Must be 64 lowercase hex characters');

export const Sha256HashSchema = z.string()
  .length(64)
  .regex(/^[a-f0-9]+$/, 'Must be 64 lowercase hex characters');

export const Sha512HashSchema = z.string()
  .length(128)
  .regex(/^[a-f0-9]+$/, 'Must be 128 lowercase hex characters');

export const Md5HashSchema = z.string()
  .length(32)
  .regex(/^[a-f0-9]+$/, 'Must be 32 lowercase hex characters');

export const Xxhash64HashSchema = z.string()
  .length(16)
  .regex(/^[a-f0-9]+$/, 'Must be 16 lowercase hex characters');

// Union for any supported hash
export const AnyHashSchema = z.union([
  Blake3HashSchema,
  Blake3FullHashSchema,
  Sha256HashSchema,
  Sha512HashSchema,
  Md5HashSchema,
  Xxhash64HashSchema
]);

// ============================================
// ID SCHEMAS
// ============================================

export const Blake3IdSchema = Blake3HashSchema; // Same format

export const UuidSchema = z.string().uuid();

export const UlidSchema = z.string()
  .length(26)
  .regex(/^[0-9A-HJKMNP-TV-Z]+$/, 'Must be valid ULID');

// Union for any ID type
export const AnyIdSchema = z.union([
  Blake3IdSchema,
  UuidSchema,
  UlidSchema
]);

// ============================================
// ALGORITHM & FORMAT SCHEMAS
// ============================================

export const AlgorithmSchema = z.enum(['blake3', 'blake3-full', 'sha256', 'sha512', 'md5', 'xxhash64']);

export const OutputFormatSchema = z.enum(['text', 'json', 'csv', 'bsd', 'sfv']);

// ============================================
// FILE & RESULT SCHEMAS
// ============================================

export const HashResultSchema = z.object({
  path: z.string().min(1),
  hash: z.string(),
  algorithm: AlgorithmSchema,
  size: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative()
});

export const VerifyResultSchema = z.object({
  path: z.string(),
  expected: z.string(),
  actual: z.string(),
  algorithm: AlgorithmSchema,
  match: z.boolean(),
  size: z.number().int().nonnegative()
});

// ============================================
// MANIFEST SCHEMAS
// ============================================

export const ManifestEntrySchema = z.object({
  path: z.string().min(1),
  hash: Blake3HashSchema,
  size: z.number().int().nonnegative(),
  mtime: z.string().datetime().optional()
});

export const ManifestSchema = z.object({
  version: z.literal('1.0'),
  generated: z.string().datetime(),
  algorithm: z.literal('blake3'),
  hashLength: z.literal(16),
  root: z.string(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  files: z.array(ManifestEntrySchema)
});

// ============================================
// AUDIT SCHEMAS
// ============================================

export const AuditResultSchema = z.object({
  valid: z.boolean(),
  total: z.number().int(),
  matched: z.number().int(),
  mismatched: z.array(ManifestEntrySchema),
  missing: z.array(ManifestEntrySchema),
  extra: z.array(z.string()),
  duplicates: z.array(z.object({
    hash: Blake3HashSchema,
    paths: z.array(z.string())
  }))
});

// ============================================
// COPY & IMPORT SCHEMAS
// ============================================

export const CopyResultSchema = z.object({
  source: z.string(),
  destination: z.string(),
  hash: Blake3HashSchema,
  size: z.number().int().nonnegative(),
  verified: z.boolean(),
  durationMs: z.number().nonnegative()
});

export const ImportStatusSchema = z.enum([
  'pending', 'scanning', 'detecting-device', 'detecting-related',
  'hashing', 'copying', 'renaming', 'validating',
  'extracting-metadata', 'generating-sidecars', 'generating-manifest',
  'completed', 'paused', 'failed'
]);

// ============================================
// XMP & DEVICE SCHEMAS
// ============================================

export const SourceTypeSchema = z.enum([
  'memory_card', 'camera_direct', 'phone_direct', 'local_disk',
  'network_share', 'cloud_sync', 'cloud_download', 'web_download',
  'email_attachment', 'messaging_app', 'airdrop', 'bluetooth',
  'optical_disc', 'tape', 'ftp_sftp', 'version_control',
  'backup_restore', 'forensic_recovery', 'unknown'
]);

export const FileCategorySchema = z.enum([
  'image', 'video', 'audio', 'document', 'archive',
  'sidecar', 'ebook', 'executable', 'data', 'other'
]);

export const MediaTypeSchema = z.enum(['sd', 'cf', 'cfexpress', 'ssd', 'hdd', 'nvme']);

export const CustodyEventActionSchema = z.enum([
  'creation', 'ingestion', 'message_digest_calculation', 'fixity_check',
  'virus_check', 'format_identification', 'format_validation',
  'migration', 'normalization', 'replication', 'deletion', 'modification',
  'metadata_modification', 'deaccession', 'recovery', 'quarantine',
  'release', 'access', 'redaction', 'decryption', 'compression', 'decompression'
]);

export const USBDeviceInfoSchema = z.object({
  vendorId: z.string().optional(),
  productId: z.string().optional(),
  serial: z.string().optional(),
  devicePath: z.string().optional(),
  deviceName: z.string().optional(),
  busLocation: z.string().optional()
});

export const CardReaderInfoSchema = z.object({
  vendor: z.string().optional(),
  model: z.string().optional(),
  serial: z.string().optional(),
  port: z.string().optional()
});

export const MediaInfoSchema = z.object({
  type: MediaTypeSchema.optional(),
  serial: z.string().optional(),
  manufacturer: z.string().optional(),
  capacity: z.number().optional(),
  firmware: z.string().optional()
});

export const ImportSourceDeviceSchema = z.object({
  usb: USBDeviceInfoSchema.optional(),
  cardReader: CardReaderInfoSchema.optional(),
  media: MediaInfoSchema.optional(),
  cameraBodySerial: z.string().optional(),
  cameraInternalName: z.string().optional(),
  phoneDeviceId: z.string().optional(),
  tetheredConnection: z.enum(['usb', 'wifi', 'bluetooth', 'thunderbolt']).optional()
});

export const CustodyEventSchema = z.object({
  eventId: z.string(),
  eventTimestamp: z.string(),
  eventAction: CustodyEventActionSchema,
  eventOutcome: z.enum(['success', 'failure', 'partial']),
  eventLocation: z.string().optional(),
  eventHost: z.string().optional(),
  eventUser: z.string().optional(),
  eventTool: z.string().optional(),
  eventHash: z.string().optional(),
  eventHashAlgorithm: z.string().optional(),
  eventNotes: z.string().optional(),
  eventDetails: z.string().optional()
});

export const RelationTypeSchema = z.enum([
  'raw_jpeg_pair', 'raw_sidecar', 'video_audio', 'video_proxy',
  'burst_sequence', 'hdr_bracket', 'panorama_set', 'focus_stack',
  'stereo_pair', 'live_photo', 'motion_photo', 'sdr_hdr_pair',
  'drone_telemetry', 'document_assets'
]);

export const PhotoMetadataSchema = z.object({
  creationDevice: z.string().optional(),
  creationSoftware: z.string().optional(),
  captureDate: z.string().optional(),
  gpsLatitude: z.number().optional(),
  gpsLongitude: z.number().optional(),
  gpsAltitude: z.number().optional(),
  lensModel: z.string().optional(),
  focalLength: z.string().optional(),
  aperture: z.string().optional(),
  shutterSpeed: z.string().optional(),
  iso: z.number().optional(),
  colorSpace: z.string().optional(),
  bitDepth: z.number().optional(),
  iccProfile: z.string().optional()
});

export const VideoMetadataSchema = z.object({
  container: z.string().optional(),
  codec: z.string().optional(),
  resolution: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  frameRate: z.number().optional(),
  frameRateMode: z.enum(['constant', 'variable']).optional(),
  bitRate: z.number().optional(),
  duration: z.number().optional(),
  frameCount: z.number().optional(),
  colorSpace: z.string().optional(),
  hdr: z.string().optional(),
  scanType: z.enum(['progressive', 'interlaced']).optional(),
  audioCodec: z.string().optional(),
  audioChannels: z.number().optional(),
  audioSampleRate: z.number().optional(),
  audioBitRate: z.number().optional(),
  audioBitDepth: z.number().optional(),
  timecodeStart: z.string().optional(),
  chapterCount: z.number().optional()
});

export const AudioMetadataSchema = z.object({
  album: z.string().optional(),
  artist: z.string().optional(),
  title: z.string().optional(),
  track: z.string().optional(),
  disc: z.string().optional(),
  year: z.number().optional(),
  genre: z.string().optional(),
  duration: z.number().optional(),
  format: z.string().optional(),
  hasArt: z.boolean().optional(),
  replayGain: z.number().optional(),
  bpm: z.number().optional(),
  comment: z.string().optional()
});

export const DocumentMetadataSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  subject: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  created: z.string().optional(),
  modified: z.string().optional(),
  pageCount: z.number().optional(),
  wordCount: z.number().optional(),
  language: z.string().optional(),
  pdfVersion: z.string().optional(),
  pdfProducer: z.string().optional(),
  pdfEncrypted: z.boolean().optional(),
  pdfHasForm: z.boolean().optional(),
  pdfHasSignature: z.boolean().optional(),
  officeApplication: z.string().optional(),
  officeTemplate: z.string().optional()
});

export const XmpSidecarSchema = z.object({
  // Sidecar self-integrity
  schemaVersion: z.number().int().min(1),
  sidecarCreated: z.string(),
  sidecarUpdated: z.string(),

  // Core identity
  contentHash: Blake3FullHashSchema,
  hashAlgorithm: z.literal('blake3'),
  fileSize: z.number().int().nonnegative(),
  verified: z.boolean(),

  // File classification
  fileCategory: FileCategorySchema,
  fileSubcategory: z.string().optional(),
  detectedMimeType: z.string(),
  declaredExtension: z.string(),
  extensionMismatch: z.boolean().optional(),
  formatValid: z.boolean().optional(),

  // Source provenance
  sourcePath: z.string(),
  sourceFilename: z.string(),
  sourceHost: z.string(),
  sourceVolume: z.string().optional(),
  sourceVolumeSerial: z.string().optional(),
  sourceType: SourceTypeSchema,

  // Import source device
  sourceDevice: ImportSourceDeviceSchema.optional(),

  // Timestamps
  originalMtime: z.string(),
  originalCtime: z.string().optional(),
  originalBtime: z.string().optional(),
  originalAtime: z.string().optional(),
  sourceTimezone: z.string().optional(),
  importTimezone: z.string().optional(),

  // Import context
  importTimestamp: z.string(),
  sessionId: Blake3IdSchema,
  toolVersion: z.string(),
  importUser: z.string(),
  importHost: z.string(),
  importPlatform: z.enum(['darwin', 'linux', 'win32']),
  importOSVersion: z.string().optional(),
  importMethod: z.enum(['copy', 'move', 'hardlink', 'symlink']).optional(),

  // Batch context
  batchId: z.string().optional(),
  batchName: z.string().optional(),
  batchDescription: z.string().optional(),
  batchFileCount: z.number().optional(),
  batchSequence: z.number().optional(),
  batchTotalBytes: z.number().optional(),

  // Deduplication
  dedupStatus: z.enum(['unique', 'duplicate', 'hardlinked']).optional(),
  duplicateOf: z.string().optional(),
  duplicateCount: z.number().optional(),

  // File renaming
  wasRenamed: z.boolean().optional(),
  destFilename: z.string().optional(),
  renameReason: z.enum(['hash_naming', 'collision', 'sanitization']).optional(),

  // Related files
  relatedFiles: z.array(z.string()).optional(),
  relationType: RelationTypeSchema.optional(),
  isPrimaryFile: z.boolean().optional(),
  isLivePhoto: z.boolean().optional(),
  livePhotoRole: z.enum(['image', 'video']).optional(),
  livePhotoPairHash: z.string().optional(),
  motionHidden: z.boolean().optional(),
  sdrDuplicate: z.boolean().optional(),
  hdrPrimaryHash: z.string().optional(),

  // Inherited metadata
  inheritedXMP: z.string().optional(),
  inheritedSidecar: z.string().optional(),
  inheritedSidecarFormat: z.enum(['xmp', 'json', 'xml']).optional(),

  // Category-specific metadata
  photo: PhotoMetadataSchema.optional(),
  video: VideoMetadataSchema.optional(),
  audio: AudioMetadataSchema.optional(),
  document: DocumentMetadataSchema.optional(),

  // Cloud/download provenance
  downloadURL: z.string().optional(),
  downloadTimestamp: z.string().optional(),
  downloadReferrer: z.string().optional(),
  cloudService: z.string().optional(),
  cloudPath: z.string().optional(),
  cloudSharedBy: z.string().optional(),
  cloudShareDate: z.string().optional(),
  emailSubject: z.string().optional(),
  emailSender: z.string().optional(),
  emailDate: z.string().optional(),

  // Platform-specific
  quarantineOrigin: z.string().optional(),
  quarantineTimestamp: z.string().optional(),
  quarantineAgent: z.string().optional(),
  zoneIdentifier: z.string().optional(),

  // Chain of custody
  custodyChain: z.array(CustodyEventSchema),
  firstSeen: z.string(),
  eventCount: z.number().int().nonnegative(),

  // Errors/warnings
  importWarnings: z.array(z.string()).optional(),
  importErrors: z.array(z.string()).optional()
});

export const ImportSessionSchema = z.object({
  id: Blake3IdSchema,
  status: ImportStatusSchema,
  source: z.string(),
  destination: z.string(),
  totalFiles: z.number().int().nonnegative(),
  processedFiles: z.number().int().nonnegative(),
  duplicateFiles: z.number().int().nonnegative(),
  renamedFiles: z.number().int().nonnegative().optional(),
  sidecarFiles: z.number().int().nonnegative().optional(),
  errorFiles: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  processedBytes: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  checkpoint: z.any().optional(),
  // XMP-related fields
  batchId: z.string().optional(),
  batchName: z.string().optional(),
  sourceDevice: ImportSourceDeviceSchema.optional(),
  sourceType: SourceTypeSchema.optional(),
  sourceVolume: z.string().optional(),
  sourceVolumeSerial: z.string().optional()
});

// ============================================
// TYPE EXPORTS
// ============================================

export type Blake3Hash = z.infer<typeof Blake3HashSchema>;
export type Blake3FullHash = z.infer<typeof Blake3FullHashSchema>;
export type Sha256Hash = z.infer<typeof Sha256HashSchema>;
export type Sha512Hash = z.infer<typeof Sha512HashSchema>;
export type Md5Hash = z.infer<typeof Md5HashSchema>;
export type Xxhash64Hash = z.infer<typeof Xxhash64HashSchema>;
export type Blake3Id = z.infer<typeof Blake3IdSchema>;
export type Uuid = z.infer<typeof UuidSchema>;
export type Ulid = z.infer<typeof UlidSchema>;
export type Algorithm = z.infer<typeof AlgorithmSchema>;
export type OutputFormat = z.infer<typeof OutputFormatSchema>;
export type HashResult = z.infer<typeof HashResultSchema>;
export type VerifyResult = z.infer<typeof VerifyResultSchema>;
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type AuditResult = z.infer<typeof AuditResultSchema>;
export type CopyResult = z.infer<typeof CopyResultSchema>;
export type ImportStatus = z.infer<typeof ImportStatusSchema>;
export type ImportSession = z.infer<typeof ImportSessionSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
export type FileCategory = z.infer<typeof FileCategorySchema>;
export type MediaType = z.infer<typeof MediaTypeSchema>;
export type CustodyEventAction = z.infer<typeof CustodyEventActionSchema>;
export type USBDeviceInfo = z.infer<typeof USBDeviceInfoSchema>;
export type CardReaderInfo = z.infer<typeof CardReaderInfoSchema>;
export type MediaInfoZ = z.infer<typeof MediaInfoSchema>;
export type ImportSourceDevice = z.infer<typeof ImportSourceDeviceSchema>;
export type CustodyEvent = z.infer<typeof CustodyEventSchema>;
export type RelationType = z.infer<typeof RelationTypeSchema>;
export type PhotoMetadata = z.infer<typeof PhotoMetadataSchema>;
export type VideoMetadata = z.infer<typeof VideoMetadataSchema>;
export type AudioMetadata = z.infer<typeof AudioMetadataSchema>;
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;
export type XmpSidecar = z.infer<typeof XmpSidecarSchema>;

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Detect hash algorithm from hash string length
 */
export function detectAlgorithm(hash: string): Algorithm | null {
  const len = hash.length;
  if (len === 16 && /^[a-f0-9]+$/.test(hash)) return 'blake3'; // or xxhash64
  if (len === 32 && /^[a-f0-9]+$/.test(hash)) return 'md5';
  if (len === 64 && /^[a-f0-9]+$/.test(hash)) return 'sha256'; // or blake3-full
  if (len === 128 && /^[a-f0-9]+$/.test(hash)) return 'sha512';
  return null;
}

/**
 * Validate a hash string
 */
export function isValidHash(hash: string, algorithm?: Algorithm): boolean {
  if (algorithm) {
    const schema = {
      'blake3': Blake3HashSchema,
      'blake3-full': Blake3FullHashSchema,
      'sha256': Sha256HashSchema,
      'sha512': Sha512HashSchema,
      'md5': Md5HashSchema,
      'xxhash64': Xxhash64HashSchema
    }[algorithm];
    return schema.safeParse(hash).success;
  }
  return AnyHashSchema.safeParse(hash).success;
}

/**
 * Validate a UUID string
 */
export function isValidUuid(uuid: string): boolean {
  return UuidSchema.safeParse(uuid).success;
}

/**
 * Validate a ULID string
 */
export function isValidUlid(ulid: string): boolean {
  return UlidSchema.safeParse(ulid).success;
}
