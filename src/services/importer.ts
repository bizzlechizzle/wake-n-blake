/**
 * Import pipeline service
 * Full pipeline: scan → hash → dedup → copy → validate → sidecar → manifest
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { scanDirectory } from './scanner.js';
import { hashFile } from '../core/hasher.js';
import { copyWithHash } from '../core/copier.js';
import { generateBlake3Id } from '../core/id-generator.js';
import type { Manifest, ManifestEntry } from '../schemas/index.js';
import { detectFileType, isSidecarFile, isSkippedFile } from './file-type/detector.js';
import { writeSidecar } from './xmp/writer.js';
import { detectSourceDevice, getSourceType } from './device/index.js';
import { extractMetadata, cleanup as cleanupMetadata, exiftool, guessit, audioQuality, chromaprint, mergeCompanionMetadata, findCompanionSidecars, batchFindCompanionSidecars, shouldEmbedContent } from './metadata/index.js';
import { findRelatedFiles, isPrimaryFile, type RelatedFileGroup } from './related-files/index.js';
import type { XmpSidecarData, CustodyEvent, ImportSourceDevice, SourceType, FileCategory } from './xmp/schema.js';
import { SCHEMA_VERSION } from './xmp/schema.js';

/**
 * Map file category string to FileCategory type
 */
function mapToFileCategory(category?: string): FileCategory {
  switch (category) {
    case 'photo':
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'document':
      return 'document';
    case 'archive':
      return 'archive';
    case 'sidecar':
      return 'sidecar';
    default:
      return 'other';
  }
}

export type ImportStatus =
  | 'pending'
  | 'scanning'
  | 'detecting-device'
  | 'detecting-related'
  | 'hashing'
  | 'copying'
  | 'renaming'
  | 'validating'
  | 'extracting-metadata'
  | 'generating-sidecars'
  | 'generating-manifest'
  | 'completed'
  | 'paused'
  | 'failed';

const VERSION = '0.1.5';

export interface ImportSession {
  id: string;
  status: ImportStatus;
  source: string;
  destination: string;
  totalFiles: number;
  processedFiles: number;
  duplicateFiles: number;
  renamedFiles: number;
  sidecarFiles: number;
  errorFiles: number;
  totalBytes: number;
  processedBytes: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  files: ImportFileState[];
  // New fields
  batchId?: string;
  batchName?: string;
  sourceDevice?: ImportSourceDevice;
  sourceType?: SourceType;
  sourceVolume?: string;
  sourceVolumeSerial?: string;
}

/** Companion sidecar that was copied alongside a primary file */
export interface CopiedCompanion {
  sourcePath: string;      // Original source path
  destPath: string;        // Destination path (may be renamed)
  extension: string;       // File extension (e.g., '.srt', '.moi')
  hash: string;            // BLAKE3 hash of the companion
  size: number;            // File size in bytes
  contentBase64?: string;  // Full content as base64 for archival embedding
}

export interface ImportFileState {
  path: string;
  relativePath: string;
  size: number;
  hash?: string;  // Full 64-char BLAKE3 hash
  hashShort?: string;  // 16-char truncated BLAKE3 for filename
  destHash?: string;  // Hash of destination file after copy (for verification)
  destPath?: string;
  status: 'pending' | 'hashed' | 'copied' | 'validated' | 'skipped' | 'error';
  error?: string;
  // New fields for XMP pipeline
  category?: string;  // photo, video, audio, document, etc.
  sidecarPath?: string;
  renamed?: boolean;
  originalName?: string;
  finalName?: string;
  relatedFiles?: string[];  // Live Photo pairs, RAW+JPEG, etc.
  isPrimary?: boolean;  // Primary file in related group
  metadata?: Record<string, unknown>;
  copiedCompanions?: CopiedCompanion[];  // Companion sidecars copied with this file
}

export interface ImportOptions {
  dedup?: boolean;
  manifest?: boolean;
  resume?: boolean;
  dryRun?: boolean;
  verify?: boolean;
  excludePatterns?: string[];
  onProgress?: (session: ImportSession) => void;
  onFile?: (file: ImportFileState, action: string) => void;
  // New XMP pipeline options
  sidecar?: boolean;  // Generate XMP sidecars
  detectDevice?: boolean;  // Detect source device for chain of custody
  extractMeta?: boolean;  // Extract metadata from files
  rename?: boolean;  // Rename files to BLAKE3-16 format
  batch?: string;  // Batch name for this import
  operator?: string;  // Operator name for custody events
  guessit?: boolean;  // Parse filenames with guessit for TV/movie metadata
  audioQuality?: boolean;  // Analyze audio quality (lossless/lossy, sample rate, bit depth)
  fingerprint?: boolean;  // Generate acoustic fingerprint (Chromaprint)

  // Integration options for external apps (e.g., abandoned-archive)
  /**
   * Custom path builder for destination files.
   * If provided, overrides default relative path preservation.
   * Receives the file state and computed hash, returns the full destination path.
   *
   * Example (location-based archive):
   *   pathBuilder: (file, hash) => `/archive/locations/CA/loc123/data/images/${hash}${path.extname(file.path)}`
   */
  pathBuilder?: (file: ImportFileState, hash: string) => string;

  /**
   * Pre-existing hashes to skip (for dedup against external database).
   * If provided and dedup is true, these hashes are checked INSTEAD of scanning destination.
   * This is faster for large archives where DB lookup beats full directory hash scan.
   *
   * Example (from SQLite):
   *   existingHashes: new Set(await db.selectFrom('imgs').select('imghash').execute().map(r => r.imghash))
   */
  existingHashes?: Set<string>;
}

const CHECKPOINT_FILE = '.wnb-import-session.json';

/**
 * Run import pipeline
 */
export async function runImport(
  source: string,
  destination: string,
  options: ImportOptions = {}
): Promise<ImportSession> {
  const {
    dedup = false,
    manifest = false,
    resume = false,
    dryRun = false,
    verify = true,
    excludePatterns,
    onProgress,
    onFile,
    // New XMP pipeline options
    sidecar = false,
    detectDevice = false,
    extractMeta = false,
    rename = false,
    batch,
    operator,
    guessit: useGuessit = false,
    audioQuality: useAudioQuality = false,
    fingerprint: useFingerprint = false,
    // Integration options
    pathBuilder,
    existingHashes
  } = options;

  const resolvedSource = path.resolve(source);
  const resolvedDest = path.resolve(destination);

  // Check for existing session
  let session: ImportSession;
  const checkpointPath = path.join(resolvedDest, CHECKPOINT_FILE);

  if (resume) {
    try {
      const checkpoint = await fs.readFile(checkpointPath, 'utf-8');
      session = JSON.parse(checkpoint);
      session.status = 'scanning'; // Resume from where we left off
    } catch {
      session = createNewSession(resolvedSource, resolvedDest, batch);
    }
  } else {
    session = createNewSession(resolvedSource, resolvedDest, batch);
  }

  try {
    // Ensure destination exists
    if (!dryRun) {
      await fs.mkdir(resolvedDest, { recursive: true });
    }

    // Stage 1: Scan
    session.status = 'scanning';
    onProgress?.(session);

    if (session.files.length === 0) {
      const scanResult = await scanDirectory(resolvedSource, {
        recursive: true,
        excludePatterns
      });

      session.files = scanResult.files.map(f => ({
        path: f,
        relativePath: path.relative(resolvedSource, f),
        size: 0,
        status: 'pending' as const
      }));

      // Get file sizes
      for (const file of session.files) {
        try {
          const stats = await fs.stat(file.path);
          file.size = stats.size;
          session.totalBytes += stats.size;
        } catch {
          file.status = 'error';
          file.error = 'Cannot stat file';
        }
      }

      session.totalFiles = session.files.length;
    }

    // Stage 1b: Detect source device (for chain of custody)
    if (detectDevice && !session.sourceDevice) {
      session.status = 'detecting-device';
      onProgress?.(session);

      try {
        const deviceResult = await detectSourceDevice(resolvedSource);
        if (deviceResult.device) {
          session.sourceDevice = deviceResult.device;
          session.sourceType = getSourceType(deviceResult.chain);
          session.sourceVolume = deviceResult.chain?.volume.mountPoint;
          session.sourceVolumeSerial = deviceResult.chain?.volume.volumeUUID;
        }
      } catch {
        // Device detection is optional, continue without it
      }
    }

    // Stage 1c: Detect file categories and related files
    session.status = 'detecting-related';
    onProgress?.(session);

    // OPTIMIZATION: Find related files ONCE for all files, build O(1) lookup map
    const allPaths = session.files.filter(f => f.status !== 'error').map(f => f.path);
    const relatedGroups = await findRelatedFiles(allPaths);
    const fileToGroup = new Map<string, RelatedFileGroup>();
    for (const group of relatedGroups) {
      for (const filePath of group.allFiles) {
        fileToGroup.set(filePath, group);
      }
    }

    for (const file of session.files) {
      if (file.status === 'error') continue;

      try {
        // Detect file type/category
        const fileType = await detectFileType(file.path);
        file.category = fileType.category;

        // Skip sidecar files and hidden files
        if (isSidecarFile(file.path) || isSkippedFile(file.path)) {
          file.status = 'skipped';
          continue;
        }

        // OPTIMIZATION: O(1) lookup instead of O(n) search
        const myGroup = fileToGroup.get(file.path);
        if (myGroup && myGroup.allFiles.length > 1) {
          file.relatedFiles = myGroup.allFiles.filter(p => p !== file.path);
          file.isPrimary = isPrimaryFile(file.path, relatedGroups);
        }
      } catch {
        // Continue without related file detection
      }
    }

    // Stage 2: Hash source files
    session.status = 'hashing';
    onProgress?.(session);

    // Collect existing hashes for dedup
    // Priority: 1) User-provided existingHashes (from DB), 2) Scan destination
    let knownHashes: Set<string>;

    if (existingHashes) {
      // Use externally-provided hashes (e.g., from SQLite database)
      // This is much faster for large archives than scanning destination
      knownHashes = existingHashes;
    } else if (dedup) {
      // Fall back to scanning destination for existing hashes
      knownHashes = new Set<string>();
      try {
        const destScan = await scanDirectory(resolvedDest, { recursive: true });
        for (const destFile of destScan.files) {
          if (destFile.endsWith(CHECKPOINT_FILE)) continue;
          try {
            const result = await hashFile(destFile, 'blake3-full');
            knownHashes.add(result.hash);
          } catch {
            // Skip files we can't hash
          }
        }
      } catch {
        // Destination might not exist yet
      }
    } else {
      knownHashes = new Set<string>();
    }

    for (const file of session.files) {
      if (file.status !== 'pending') continue;

      try {
        const result = await hashFile(file.path, 'blake3-full');
        file.hash = result.hash;  // Full 64-char BLAKE3 hash
        file.hashShort = result.hash.slice(0, 16);  // 16-char for filename
        file.status = 'hashed';

        // Check for duplicate (using knownHashes which may be from DB or destination scan)
        if ((dedup || existingHashes) && knownHashes.has(result.hash)) {
          file.status = 'skipped';
          session.duplicateFiles++;
          onFile?.(file, 'skip-duplicate');
        } else {
          knownHashes.add(result.hash);
        }

        onFile?.(file, 'hashed');
      } catch (err: unknown) {
        file.status = 'error';
        file.error = err instanceof Error ? err.message : String(err);
        session.errorFiles++;
        onFile?.(file, 'error');
      }

      // Save checkpoint periodically
      if (!dryRun && session.processedFiles % 100 === 0) {
        await saveCheckpoint(checkpointPath, session);
      }
    }

    // Stage 3: Copy files
    session.status = 'copying';
    onProgress?.(session);

    // OPTIMIZATION: Batch discover companion sidecars ONCE before copy loop
    // This reads each directory only once instead of once per file
    const filesToCopy = session.files.filter(f => f.status === 'hashed').map(f => f.path);
    const companionMap = await batchFindCompanionSidecars(filesToCopy);

    for (const file of session.files) {
      if (file.status !== 'hashed') continue;

      // Determine destination path:
      // 1) Use pathBuilder if provided (custom path structure)
      // 2) Otherwise, preserve relative path structure
      const destPath = pathBuilder
        ? pathBuilder(file, file.hashShort || file.hash!.slice(0, 16))
        : path.join(resolvedDest, file.relativePath);
      file.destPath = destPath;

      if (dryRun) {
        file.status = 'copied';
        session.processedFiles++;
        session.processedBytes += file.size;
        onFile?.(file, 'would-copy');
        continue;
      }

      try {
        // Ensure destination directory exists (especially important for pathBuilder)
        await fs.mkdir(path.dirname(destPath), { recursive: true });

        await copyWithHash(file.path, destPath, {
          algorithm: 'blake3',
          verify,
          overwrite: false
        });

        file.status = 'copied';
        session.processedFiles++;
        session.processedBytes += file.size;
        onFile?.(file, 'copied');

        // Copy companion sidecars (e.g., .SRT, .MOI) alongside the primary file
        // This preserves full telemetry data that's too large to embed in XMP
        try {
          // OPTIMIZATION: Use pre-computed companion map instead of per-file discovery
          const companionPaths = companionMap.get(file.path) || [];
          if (companionPaths.length > 0) {
            file.copiedCompanions = [];
            const destDir = path.dirname(destPath);
            const destBase = path.basename(destPath, path.extname(destPath));

            for (const companionPath of companionPaths) {
              const companionExt = path.extname(companionPath);
              // Keep original extension, use primary file's base name
              const companionDestPath = path.join(destDir, `${destBase}${companionExt}`);

              // Copy and hash the companion
              const companionResult = await copyWithHash(companionPath, companionDestPath, {
                algorithm: 'blake3',
                verify,
                overwrite: false
              });

              // Get file size for embedding decision
              const companionStats = await fs.stat(companionDestPath);
              const extLower = companionExt.toLowerCase();

              // Conditionally embed content based on file type and size
              // Video proxies (LRF, LRV) and large binaries are copied but not embedded
              let contentBase64: string | undefined;
              if (shouldEmbedContent(extLower, companionStats.size)) {
                const companionContent = await fs.readFile(companionPath);
                contentBase64 = companionContent.toString('base64');
              }

              file.copiedCompanions.push({
                sourcePath: companionPath,
                destPath: companionDestPath,
                extension: extLower,
                hash: companionResult.hash,
                size: companionStats.size,
                contentBase64,
              });

              onFile?.(file, 'companion-copied');
            }
          }
        } catch {
          // Companion copying is non-fatal, continue without
        }
      } catch (err: unknown) {
        file.status = 'error';
        file.error = err instanceof Error ? err.message : String(err);
        session.errorFiles++;
        onFile?.(file, 'error');
      }

      // Save checkpoint periodically
      if (session.processedFiles % 50 === 0) {
        await saveCheckpoint(checkpointPath, session);
      }
    }

    // Stage 4: Validate (re-hash destination files)
    if (verify && !dryRun) {
      session.status = 'validating';
      onProgress?.(session);

      for (const file of session.files) {
        if (file.status !== 'copied' || !file.destPath) continue;

        try {
          const result = await hashFile(file.destPath, 'blake3-full');
          file.destHash = result.hash;  // Full 64-char dest hash for verification proof
          if (result.hash === file.hash) {
            file.status = 'validated';
            onFile?.(file, 'validated');
          } else {
            file.status = 'error';
            file.error = `Validation failed: expected ${file.hash}, got ${result.hash}`;
            session.errorFiles++;
            onFile?.(file, 'validation-failed');
          }
        } catch (err: unknown) {
          file.status = 'error';
          file.error = `Validation error: ${err instanceof Error ? err.message : String(err)}`;
          session.errorFiles++;
          onFile?.(file, 'error');
        }
      }
    }

    // Stage 5: Rename files to BLAKE3-16 format
    if (rename && !dryRun) {
      session.status = 'renaming';
      onProgress?.(session);

      for (const file of session.files) {
        if ((file.status !== 'validated' && file.status !== 'copied') || !file.destPath || !file.hashShort) continue;

        try {
          const dir = path.dirname(file.destPath);
          const ext = path.extname(file.destPath);
          const originalName = path.basename(file.destPath);
          const newName = `${file.hashShort}${ext}`;
          const newPath = path.join(dir, newName);

          // Only rename if name is different
          if (originalName !== newName) {
            await fs.rename(file.destPath, newPath);
            file.originalName = originalName;
            file.finalName = newName;
            file.destPath = newPath;
            file.renamed = true;
            file.relativePath = path.relative(resolvedDest, newPath);
            session.renamedFiles++;
            onFile?.(file, 'renamed');

            // Also rename companion sidecars to match
            if (file.copiedCompanions && file.copiedCompanions.length > 0) {
              for (const companion of file.copiedCompanions) {
                const companionNewName = `${file.hashShort}${companion.extension}`;
                const companionNewPath = path.join(dir, companionNewName);
                try {
                  await fs.rename(companion.destPath, companionNewPath);
                  companion.destPath = companionNewPath;
                } catch {
                  // Non-fatal, companion keeps original name
                }
              }
            }
          }
        } catch {
          // Renaming is non-fatal, just log and continue
          onFile?.(file, 'rename-failed');
        }
      }
    }

    // Stage 6: Extract metadata
    // OPTIMIZATION: Process in parallel batches (matches ExifTool maxProcs=4)
    if (extractMeta && !dryRun) {
      session.status = 'extracting-metadata';
      onProgress?.(session);

      const METADATA_BATCH_SIZE = 4;  // Match ExifTool maxProcs for optimal parallelism
      const filesToExtract = session.files.filter(
        f => (f.status === 'validated' || f.status === 'copied') && f.destPath
      );

      for (let i = 0; i < filesToExtract.length; i += METADATA_BATCH_SIZE) {
        const batch = filesToExtract.slice(i, i + METADATA_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (file) => {
            const meta = await extractMetadata(file.destPath!);
            return { file, meta };
          })
        );

        // Process results
        for (const result of results) {
          if (result.status === 'fulfilled') {
            result.value.file.metadata = result.value.meta as unknown as Record<string, unknown>;
            onFile?.(result.value.file, 'metadata-extracted');
          }
          // Metadata extraction is optional, continue without it on failure
        }
      }
    }

    // Stage 7: Generate XMP sidecars
    if (sidecar && !dryRun) {
      session.status = 'generating-sidecars';
      onProgress?.(session);

      const now = new Date().toISOString();
      let batchSequence = 0;

      for (const file of session.files) {
        if ((file.status !== 'validated' && file.status !== 'copied') || !file.destPath || !file.hash) continue;

        batchSequence++;

        try {
          // Get file stats for all timestamps
          const sourceStats = await fs.stat(file.path).catch(() => null);
          const mtime = sourceStats?.mtime?.toISOString() || now;
          const ctime = sourceStats?.ctime?.toISOString();
          const btime = sourceStats?.birthtime?.toISOString();
          const atime = sourceStats?.atime?.toISOString();

          // Map file category to schema FileCategory
          const fileCategory = mapToFileCategory(file.category);

          // Build the custody event
          const custodyEvent: CustodyEvent = {
            eventId: generateBlake3Id(),
            eventTimestamp: session.startedAt,
            eventAction: 'ingestion',
            eventOutcome: 'success',
            eventLocation: file.destPath,
            eventHost: os.hostname(),
            eventUser: operator || os.userInfo().username,
            eventTool: `wake-n-blake v${VERSION}`,
            eventHash: file.hash,
            eventHashAlgorithm: 'blake3',
            eventNotes: batch ? `Batch: ${batch}` : undefined
          };

          // Build XMP sidecar data with all required fields
          const sidecarData: XmpSidecarData = {
            // Sidecar self-integrity
            schemaVersion: SCHEMA_VERSION,
            sidecarCreated: now,
            sidecarUpdated: now,

            // Core identity - ARCHIVE LEVEL
            contentHash: file.hashShort || file.hash.slice(0, 16),  // 16-char for filename
            contentHashFull: file.hash,  // Full 64-char for verification
            hashAlgorithm: 'blake3',
            fileSize: file.size,
            verified: file.status === 'validated',

            // Verification proof - ARCHIVE LEVEL
            sourceHash: file.hash,  // Hash of source before copy
            destHash: file.destHash,  // Hash of dest after copy
            hashMatch: file.destHash ? file.hash === file.destHash : undefined,

            // File classification
            fileCategory,
            detectedMimeType: file.category || 'application/octet-stream',
            declaredExtension: path.extname(file.path),

            // Source provenance
            sourcePath: file.path,
            sourceFilename: path.basename(file.path),
            sourceHost: os.hostname(),
            sourceVolume: session.sourceVolume,
            sourceVolumeSerial: session.sourceVolumeSerial,
            sourceType: session.sourceType || 'local_disk',

            // Import source device
            sourceDevice: session.sourceDevice,

            // Timestamps - ALL of them for ARCHIVE LEVEL
            originalMtime: mtime,
            originalCtime: ctime,
            originalBtime: btime,
            originalAtime: atime,

            // Import context
            importTimestamp: session.startedAt,
            sessionId: session.id,
            toolVersion: VERSION,
            importUser: operator || os.userInfo().username,
            importHost: os.hostname(),
            importPlatform: process.platform as 'darwin' | 'linux' | 'win32',
            importMethod: 'copy',

            // Batch context
            batchId: session.batchId,
            batchName: session.batchName,
            batchFileCount: session.totalFiles,
            batchSequence,

            // File renaming
            wasRenamed: file.renamed,
            destFilename: file.renamed ? file.finalName : undefined,
            renameReason: file.renamed ? 'hash_naming' : undefined,

            // Related files
            relatedFiles: file.relatedFiles,
            isPrimaryFile: file.isPrimary,

            // Chain of custody
            custodyChain: [custodyEvent],
            firstSeen: session.startedAt,
            eventCount: 1
          };

          // Add type-specific metadata (extractMetadata returns { photo?, video?, audio?, document? })
          if (file.metadata) {
            const meta = file.metadata as Record<string, unknown>;
            if ((file.category === 'photo' || file.category === 'image') && meta.photo) {
              sidecarData.photo = meta.photo as XmpSidecarData['photo'];
            } else if (file.category === 'video' && meta.video) {
              sidecarData.video = meta.video as XmpSidecarData['video'];
            } else if (file.category === 'audio' && meta.audio) {
              sidecarData.audio = meta.audio as XmpSidecarData['audio'];
            } else if (file.category === 'document' && meta.document) {
              sidecarData.document = meta.document as XmpSidecarData['document'];
            }
          }

          // Extract and add raw metadata (complete exiftool dump) for media files
          const category = file.category;
          if (category && ['image', 'photo', 'video', 'audio'].includes(category)) {
            try {
              const rawMeta = await exiftool.extractAllMetadata(file.destPath);

              // For video files, also look for companion sidecars (e.g., .MOI for .TOD)
              // and merge their metadata. Use source path to find companions.
              if (category === 'video' && file.path) {
                const { merged, ingestedSidecars } = await mergeCompanionMetadata(
                  file.path,
                  rawMeta
                );
                sidecarData.rawMetadata = merged;

                // Track which companion sidecars were ingested
                if (ingestedSidecars.length > 0) {
                  sidecarData.ingestedCompanions = ingestedSidecars.map(s => ({
                    sourcePath: s.path,
                    extension: s.extension,
                    fieldsAdded: [], // Would need to track this in merge function for full detail
                  }));
                }
              } else {
                sidecarData.rawMetadata = rawMeta;
              }
            } catch {
              // Raw metadata extraction is optional, continue without it
            }
          }

          // Parse filename with guessit for TV/movie metadata
          if (useGuessit && category === 'video') {
            try {
              const guessitResult = await guessit.guess(file.path);
              if (guessitResult) {
                const guessitMeta = guessit.toRawMetadata(guessitResult);
                sidecarData.rawMetadata = {
                  ...sidecarData.rawMetadata,
                  ...guessitMeta,
                };
              }
            } catch {
              // guessit is optional, continue without it
            }
          }

          // Analyze audio quality (lossless/lossy detection, sample rate, bit depth)
          if (useAudioQuality && category === 'audio') {
            try {
              const qualityResult = await audioQuality.analyzeAudioQuality(file.destPath);
              if (qualityResult) {
                const qualityMeta = audioQuality.toRawMetadata(qualityResult);
                sidecarData.rawMetadata = {
                  ...sidecarData.rawMetadata,
                  ...qualityMeta,
                };
              }
            } catch {
              // audio quality analysis is optional, continue without it
            }
          }

          // Generate acoustic fingerprint (Chromaprint) for audio files
          if (useFingerprint && category === 'audio') {
            try {
              const fingerprintResult = await chromaprint.fingerprint(file.destPath);
              if (fingerprintResult) {
                const fingerprintMeta = chromaprint.toRawMetadata(fingerprintResult);
                sidecarData.rawMetadata = {
                  ...sidecarData.rawMetadata,
                  ...fingerprintMeta,
                };
              }
            } catch {
              // fingerprinting is optional, continue without it
            }
          }

          // Add copied companion sidecars (full files preserved alongside primary)
          // Includes base64-encoded content for archival completeness
          if (file.copiedCompanions && file.copiedCompanions.length > 0) {
            sidecarData.copiedCompanions = file.copiedCompanions.map(c => ({
              sourcePath: c.sourcePath,
              destPath: path.basename(c.destPath), // Store relative to primary file
              extension: c.extension,
              hash: c.hash,
              size: c.size,
              contentBase64: c.contentBase64, // Full content for archival
            }));
          }

          // Write sidecar
          const sidecarPath = await writeSidecar(file.destPath, sidecarData);
          file.sidecarPath = sidecarPath;
          session.sidecarFiles++;
          onFile?.(file, 'sidecar-generated');
        } catch {
          // Sidecar generation is non-fatal
          onFile?.(file, 'sidecar-failed');
        }
      }
    }

    // Stage 8: Generate manifest
    if (manifest && !dryRun) {
      session.status = 'generating-manifest';
      onProgress?.(session);

      const manifestEntries: ManifestEntry[] = session.files
        .filter(f => f.status === 'validated' || f.status === 'copied')
        .map(f => ({
          path: f.relativePath,
          hash: f.hash!,
          size: f.size
        }));

      const manifestData: Manifest = {
        version: '1.0',
        generated: new Date().toISOString(),
        algorithm: 'blake3',
        hashLength: 16,
        root: resolvedDest,
        fileCount: manifestEntries.length,
        totalBytes: manifestEntries.reduce((sum, e) => sum + e.size, 0),
        files: manifestEntries.sort((a, b) => a.path.localeCompare(b.path))
      };

      await fs.writeFile(
        path.join(resolvedDest, 'manifest.json'),
        JSON.stringify(manifestData, null, 2)
      );
    }

    // Complete
    session.status = 'completed';
    session.completedAt = new Date().toISOString();
    onProgress?.(session);

    // Clean up checkpoint and resources
    if (!dryRun) {
      await fs.unlink(checkpointPath).catch(() => {});
    }

    // Clean up metadata extractor resources
    if (extractMeta || sidecar) {
      await cleanupMetadata();
    }

    return session;

  } catch (err: unknown) {
    session.status = 'failed';
    session.error = err instanceof Error ? err.message : String(err);
    await saveCheckpoint(checkpointPath, session);
    throw err;
  }
}

/**
 * Create a new import session
 */
function createNewSession(source: string, destination: string, batch?: string): ImportSession {
  return {
    id: generateBlake3Id(),
    status: 'pending',
    source,
    destination,
    totalFiles: 0,
    processedFiles: 0,
    duplicateFiles: 0,
    renamedFiles: 0,
    sidecarFiles: 0,
    errorFiles: 0,
    totalBytes: 0,
    processedBytes: 0,
    startedAt: new Date().toISOString(),
    files: [],
    batchId: batch ? generateBlake3Id() : undefined,
    batchName: batch
  };
}

/**
 * Save checkpoint to disk
 */
async function saveCheckpoint(checkpointPath: string, session: ImportSession): Promise<void> {
  await fs.writeFile(checkpointPath, JSON.stringify(session, null, 2));
}

/**
 * Get import session status from checkpoint
 */
export async function getImportStatus(destination: string): Promise<ImportSession | null> {
  const checkpointPath = path.join(destination, CHECKPOINT_FILE);
  try {
    const content = await fs.readFile(checkpointPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
