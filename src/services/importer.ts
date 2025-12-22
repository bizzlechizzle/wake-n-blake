/**
 * Import pipeline service
 * Full pipeline: scan → hash → dedup → copy → validate → manifest
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { scanDirectory } from './scanner.js';
import { hashFile } from '../core/hasher.js';
import { copyWithHash } from '../core/copier.js';
import { generateBlake3Id } from '../core/id-generator.js';
import type { Manifest, ManifestEntry } from '../schemas/index.js';

export type ImportStatus =
  | 'pending'
  | 'scanning'
  | 'hashing'
  | 'copying'
  | 'validating'
  | 'generating-manifest'
  | 'completed'
  | 'paused'
  | 'failed';

export interface ImportSession {
  id: string;
  status: ImportStatus;
  source: string;
  destination: string;
  totalFiles: number;
  processedFiles: number;
  duplicateFiles: number;
  errorFiles: number;
  totalBytes: number;
  processedBytes: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  files: ImportFileState[];
}

export interface ImportFileState {
  path: string;
  relativePath: string;
  size: number;
  hash?: string;
  destPath?: string;
  status: 'pending' | 'hashed' | 'copied' | 'validated' | 'skipped' | 'error';
  error?: string;
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
    onFile
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
      session = createNewSession(resolvedSource, resolvedDest);
    }
  } else {
    session = createNewSession(resolvedSource, resolvedDest);
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

    // Stage 5: Generate manifest
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

    // Clean up checkpoint
    if (!dryRun) {
      await fs.unlink(checkpointPath).catch(() => {});
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
function createNewSession(source: string, destination: string): ImportSession {
  return {
    id: generateBlake3Id(),
    status: 'pending',
    source,
    destination,
    totalFiles: 0,
    processedFiles: 0,
    duplicateFiles: 0,
    errorFiles: 0,
    totalBytes: 0,
    processedBytes: 0,
    startedAt: new Date().toISOString(),
    files: []
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
