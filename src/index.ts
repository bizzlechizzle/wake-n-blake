/**
 * Wake-n-Blake
 * Universal BLAKE3 hashing, verification, and ID generation
 *
 * This module exports the public API for programmatic use.
 * For CLI usage, see bin/wnb.js
 */

// ============================================
// CORE HASHING & VERIFICATION
// ============================================

export {
  hashFile,
  hashBlake3,
  hashSha256,
  hashSha512,
  hashMd5,
  hashXxhash64,
  hashBuffer,
  hashString,
  hashFileAll,
  hashBatch,
  verifyFile,
  findNativeB3sum,
  hasNativeB3sum,
  setHasherMode,
  getHasherMode
} from './core/hasher.js';

export type {
  HashProgressCallback,
  HashProgressOptions,
  HashBlake3Options,
  HashFileOptions,
  BatchProgressCallback,
  HashBatchOptions,
  HashBatchResult
} from './core/hasher.js';

export type { Algorithm, HashResult } from './schemas/index.js';

// ============================================
// ID GENERATION
// ============================================

export {
  generateBlake3Id,
  generateBlake3Ids,
  generateBlake3IdFrom,
  generateUuid,
  generateUuids,
  generateUuidV1,
  generateUuidV4,
  generateUuidV5,
  generateUuidV7,
  generateULID,
  generateULIDs,
  parseUlidTimestamp,
  id,
  UUID_NAMESPACES
} from './core/id-generator.js';

export type { NamespaceType } from './core/id-generator.js';

// ============================================
// FILE OPERATIONS
// ============================================

export {
  copyWithHash
} from './core/copier.js';

export type { CopyOptions, CopyResult } from './core/copier.js';

export {
  fastHash,
  fastHashBatch
} from './core/fast-hasher.js';

export type {
  FastHashOptions,
  FastHashResult,
  BatchHashOptions,
  BatchFileProgressCallback,
  BatchByteProgressCallback
} from './core/fast-hasher.js';

// ============================================
// IMPORT PIPELINE
// ============================================

export {
  runImport,
  getImportStatus,
  STEP_WEIGHTS,
  STEP_NAMES
} from './services/importer.js';

export type {
  ImportSession,
  ImportFileState,
  ImportOptions,
  ImportStatus
} from './services/importer.js';

// ============================================
// PROGRESS TRACKING
// ============================================

export {
  ProgressTracker,
  formatDuration,
  formatBytes,
  formatThroughput,
  formatETA,
  progressBar
} from './core/progress-tracker.js';

export type {
  ProgressState
} from './core/progress-tracker.js';

// ============================================
// XMP SIDECAR
// ============================================

export {
  generateXmpContent,
  writeSidecar,
  calculateSidecarHash
} from './services/xmp/writer.js';

export {
  readSidecar,
  parseSidecarContent,
  verifySidecar,
  sidecarExists
} from './services/xmp/reader.js';

export type { ParseResult } from './services/xmp/reader.js';

export {
  SCHEMA_VERSION,
  XMP_NAMESPACES
} from './services/xmp/schema.js';

export type {
  XmpSidecarData,
  CustodyEvent,
  ImportSourceDevice,
  SourceType,
  FileCategory,
  PhotoMetadata,
  VideoMetadata,
  AudioMetadata,
  DocumentMetadata
} from './services/xmp/schema.js';

// ============================================
// DEVICE DETECTION
// ============================================

export {
  detectSourceDevice,
  getRemovableVolumes,
  getDeviceChain,
  isRemovableMedia,
  getSourceType,
  getVolumeSerial,
  formatDeviceInfo,
  createDeviceFingerprint
} from './services/device/index.js';

export type {
  DeviceDetectionResult,
  MountedVolume,
  DeviceChain,
  PlatformDeviceDetector
} from './services/device/types.js';

// ============================================
// METADATA EXTRACTION
// ============================================

export {
  extractMetadata,
  getAvailableTools,
  cleanup as cleanupMetadataExtractors
} from './services/metadata/index.js';

// ============================================
// FILE UTILITIES
// ============================================

export {
  scanDirectory
} from './services/scanner.js';

export {
  findDuplicates
} from './services/deduplicator.js';

export {
  detectFileType,
  isSidecarFile,
  isSkippedFile
} from './services/file-type/detector.js';

export {
  findRelatedFiles,
  isPrimaryFile,
  shouldHideFile
} from './services/related-files/index.js';

// ============================================
// FILE TYPE DATABASE (400+ extensions)
// ============================================

export {
  IMAGE_EXTENSIONS,
  RAW_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  SIDECAR_EXTENSIONS,
  EBOOK_EXTENSIONS,
  GAME_EXTENSIONS,
  ARCHIVE_EXTENSIONS,
  ALL_MEDIA_EXTENSIONS,
  ALL_KNOWN_EXTENSIONS,
  getMediaCategory,
  isMediaExtension,
  isKnownExtension
} from './services/file-type/media-types.js';

export type { MediaCategory } from './services/file-type/media-types.js';

export { ExtensionLearner } from './services/file-type/extension-learner.js';

// ============================================
// CAMERA FINGERPRINTING (9,766+ cameras)
// ============================================

export { CameraFingerprinter } from './services/device/camera-fingerprint.js';

export type {
  CameraCategory,
  CameraSignature,
  CameraMatch,
  MediaEra
} from './services/device/camera-fingerprint.js';

// ============================================
// USB VENDORS & STORAGE PATTERNS
// ============================================

export {
  USB_VENDORS,
  USB_DEVICES,
  VENDOR_CATEGORIES,
  getVendorName,
  getDeviceName,
  getDeviceCategory,
  isCameraVendor,
  isDroneVendor,
  isCardReaderVendor,
  parseHexId,
  formatVidPid
} from './services/device/usb-vendors.js';

export {
  NETWORK_PATH_PREFIXES,
  LOCAL_VOLUME_PATTERNS,
  CAMERA_VOLUME_PATTERNS,
  CAMERA_FOLDER_PATTERNS,
  FILENAME_PATTERNS,
  STORAGE_CONFIGS,
  detectStorageType,
  getStorageConfig,
  detectCameraFromFolder,
  getVolumeName
} from './services/device/storage-patterns.js';

export type { StorageType, StorageConfig } from './services/device/storage-patterns.js';

// ============================================
// PRO CAMERA XML SIDECARS
// ============================================

export {
  parseXmlSidecar,
  isXmlSidecar,
  findLinkedVideoFile,
  getXmlSidecarForVideo
} from './services/metadata/xml-sidecar.js';

export type { XmlSidecarData } from './services/metadata/xml-sidecar.js';

// ============================================
// SHARED REGISTRY (~/.config/blake/)
// ============================================

export {
  getSharedConfigDir,
  ensureConfigDir,
  REGISTRY_PATHS,
  getRegistryVersion,
  getSyncConfig,
  saveSyncConfig,
  loadAllCameras,
  addUserCamera,
  removeUserCamera,
  exportUserCameras,
  importCameras,
  getRegistryInfo
} from './services/device/shared-registry.js';

export type {
  RegistryVersion,
  GitHubSyncConfig,
  LoadResult
} from './services/device/shared-registry.js';

// ============================================
// SCHEMAS & VALIDATION
// ============================================

export {
  // Hash schemas
  Blake3HashSchema,
  Blake3FullHashSchema,
  Sha256HashSchema,
  Sha512HashSchema,
  Md5HashSchema,
  Xxhash64HashSchema,
  AnyHashSchema,

  // ID schemas
  Blake3IdSchema,
  UuidSchema,
  UlidSchema,
  AnyIdSchema,

  // Other schemas
  AlgorithmSchema,
  OutputFormatSchema,
  HashResultSchema,
  ManifestSchema,
  ManifestEntrySchema,
  ImportSessionSchema,
  ImportStatusSchema,
  SourceTypeSchema,
  FileCategorySchema,
  CustodyEventSchema,

  // Validation helpers
  detectAlgorithm,
  isValidHash,
  isValidUuid,
  isValidUlid
} from './schemas/index.js';

export type {
  Blake3Hash,
  Blake3FullHash,
  Sha256Hash,
  Sha512Hash,
  Md5Hash,
  Xxhash64Hash,
  Blake3Id,
  Uuid,
  Ulid,
  OutputFormat,
  VerifyResult,
  ManifestEntry,
  Manifest,
  AuditResult,
  CustodyEventAction,
  USBDeviceInfo,
  CardReaderInfo
} from './schemas/index.js';

// ============================================
// UTILITIES
// ============================================

export {
  isNetworkPath,
  getBufferSize,
  getConcurrency,
  detectMountType,
  isSmbPath,
  isNfsPath,
  getIoOptions
} from './utils/network.js';

export {
  loadIgnorePatterns,
  shouldIgnore,
  filterIgnored,
  createIgnore
} from './utils/ignore.js';

// ============================================
// CLI (for programmatic CLI use)
// ============================================

export {
  run as runCli,
  createCli
} from './cli/index.js';

// ============================================
// MHL (Media Hash List)
// ============================================

export {
  generateMhl,
  mhlToXml,
  writeMhl,
  parseMhl,
  parseMhlXml,
  verifyMhl,
  generateMhlFilename
} from './services/mhl/index.js';

export type {
  MhlHashEntry,
  MhlCreatorInfo,
  MhlDocument,
  MhlAlgorithm,
  MhlGenerateOptions
} from './services/mhl/index.js';

// ============================================
// BagIt (RFC 8493)
// ============================================

export {
  createBag,
  verifyBag
} from './services/bagit/index.js';

export type {
  BagItAlgorithm,
  BagItOptions,
  BagItResult,
  BagItVerifyResult
} from './services/bagit/schemas.js';

// ============================================
// GPS ENRICHMENT
// ============================================

export {
  enrichFilesWithGps,
  collectMediaFiles
} from './services/gps/index.js';

export {
  parseGpsFile,
  detectFormat,
  getTimedWaypoints,
  getAllWaypoints
} from './services/gps/parsers.js';

export type {
  Waypoint,
  GpsDocument,
  GpsTrack,
  GpsEnrichOptions,
  GpsMatch,
  GpsEnrichResult
} from './services/gps/schemas.js';

// ============================================
// PERCEPTUAL HASHING
// ============================================

export {
  computePhash,
  compareImages,
  findSimilarImages,
  hammingDistance,
  similarityFromDistance
} from './services/phash/index.js';

export type {
  PerceptualHash,
  SimilarPair,
  SimilarGroup,
  PhashOptions,
  PhashResult,
  PhashCompareResult,
  PhashAlgorithm
} from './services/phash/schemas.js';

// ============================================
// VERSION
// ============================================

export const VERSION = '0.1.2';
