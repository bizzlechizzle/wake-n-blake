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
import { extractMetadata, cleanup as cleanupMetadata } from './metadata/index.js';
import { findRelatedFiles, isPrimaryFile } from './related-files/index.js';
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

const VERSION = '0.1.0';

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

export interface ImportFileState {
  path: string;
  relativePath: string;
  size: number;
  hash?: string;
  hashShort?: string;  // 16-char truncated BLAKE3
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
    operator
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

        // Find related files (Live Photo pairs, RAW+JPEG, etc.)
        const allPaths = session.files.map(f => f.path);
        const relatedGroups = await findRelatedFiles(allPaths);
        const myGroup = relatedGroups.find(g => g.allFiles.includes(file.path));
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

    const existingHashes = new Set<string>();

    // If dedup, first scan destination for existing hashes
    if (dedup) {
      try {
        const destScan = await scanDirectory(resolvedDest, { recursive: true });
        for (const destFile of destScan.files) {
          if (destFile.endsWith(CHECKPOINT_FILE)) continue;
          try {
            const result = await hashFile(destFile, 'blake3');
            existingHashes.add(result.hash);
          } catch {
            // Skip files we can't hash
          }
        }
      } catch {
        // Destination might not exist yet
      }
    }

    for (const file of session.files) {
      if (file.status !== 'pending') continue;

      try {
        const result = await hashFile(file.path, 'blake3');
        file.hash = result.hash;
        file.hashShort = result.hash.slice(0, 16);  // 16-char truncated
        file.status = 'hashed';

        // Check for duplicate
        if (dedup && existingHashes.has(result.hash)) {
          file.status = 'skipped';
          session.duplicateFiles++;
          onFile?.(file, 'skip-duplicate');
        } else {
          existingHashes.add(result.hash);
        }

        onFile?.(file, 'hashed');
      } catch (err: any) {
        file.status = 'error';
        file.error = err.message;
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

    for (const file of session.files) {
      if (file.status !== 'hashed') continue;

      const destPath = path.join(resolvedDest, file.relativePath);
      file.destPath = destPath;

      if (dryRun) {
        file.status = 'copied';
        session.processedFiles++;
        session.processedBytes += file.size;
        onFile?.(file, 'would-copy');
        continue;
      }

      try {
        await copyWithHash(file.path, destPath, {
          algorithm: 'blake3',
          verify,
          overwrite: false
        });

        file.status = 'copied';
        session.processedFiles++;
        session.processedBytes += file.size;
        onFile?.(file, 'copied');
      } catch (err: any) {
        file.status = 'error';
        file.error = err.message;
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
          const result = await hashFile(file.destPath, 'blake3');
          if (result.hash === file.hash) {
            file.status = 'validated';
            onFile?.(file, 'validated');
          } else {
            file.status = 'error';
            file.error = `Validation failed: expected ${file.hash}, got ${result.hash}`;
            session.errorFiles++;
            onFile?.(file, 'validation-failed');
          }
        } catch (err: any) {
          file.status = 'error';
          file.error = `Validation error: ${err.message}`;
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
          }
        } catch {
          // Renaming is non-fatal, just log and continue
          onFile?.(file, 'rename-failed');
        }
      }
    }

    // Stage 6: Extract metadata
    if (extractMeta && !dryRun) {
      session.status = 'extracting-metadata';
      onProgress?.(session);

      for (const file of session.files) {
        if ((file.status !== 'validated' && file.status !== 'copied') || !file.destPath) continue;

        try {
          const meta = await extractMetadata(file.destPath);
          file.metadata = meta as unknown as Record<string, unknown>;
          onFile?.(file, 'metadata-extracted');
        } catch {
          // Metadata extraction is optional, continue without it
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
          // Get file stats for timestamps
          const sourceStats = await fs.stat(file.path).catch(() => null);
          const mtime = sourceStats?.mtime?.toISOString() || now;

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

            // Core identity
            contentHash: file.hash,
            hashAlgorithm: 'blake3',
            fileSize: file.size,
            verified: file.status === 'validated',

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

            // Timestamps
            originalMtime: mtime,

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

          // Add type-specific metadata
          if (file.metadata) {
            if (file.category === 'photo' || file.category === 'image') {
              sidecarData.photo = file.metadata as any;
            } else if (file.category === 'video') {
              sidecarData.video = file.metadata as any;
            } else if (file.category === 'audio') {
              sidecarData.audio = file.metadata as any;
            } else if (file.category === 'document') {
              sidecarData.document = file.metadata as any;
            }
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

  } catch (err: any) {
    session.status = 'failed';
    session.error = err.message;
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
