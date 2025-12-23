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
  hashBuffer,
  hashString,
  hashFileAll,
  verifyFile,
  findNativeB3sum,
  hasNativeB3sum,
  setHasherMode,
  getHasherMode
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

export type { FastHashOptions, FastHashResult } from './core/fast-hasher.js';

// ============================================
// IMPORT PIPELINE
// ============================================

export {
  runImport,
  getImportStatus
} from './services/importer.js';

export type {
  ImportSession,
  ImportFileState,
  ImportOptions,
  ImportStatus
} from './services/importer.js';

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
// SCHEMAS & VALIDATION
// ============================================

export {
  // Hash schemas
  Blake3HashSchema,
  Blake3FullHashSchema,
  Sha256HashSchema,
  Sha512HashSchema,
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
// VERSION
// ============================================

export const VERSION = '0.1.0';
