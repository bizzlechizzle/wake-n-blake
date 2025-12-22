/**
 * wnb manifest / check / audit / diff commands
 * Manifest generation and verification
 */

import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { hashFile } from '../../core/hasher.js';
import { formatError, formatSize, formatDuration } from '../output.js';
import type { Manifest, ManifestEntry, AuditResult } from '../../schemas/index.js';

/**
 * wnb manifest - Generate manifest for directory
 */
export const manifestCommand = new Command('manifest')
  .description('Generate file manifest for directory')
  .argument('<dir>', 'Directory to manifest')
  .option('-o, --output <path>', 'Output file (default: <dir>/manifest.json)')
  .option('--update', 'Update existing manifest (add new files only)')
  .option('--exclude <pattern...>', 'Glob patterns to exclude')
  .option('-f, --format <fmt>', 'Output format: json, csv', 'json')
  .action(async (dir: string, options) => {
    try {
      const resolvedDir = path.resolve(dir);
      const startTime = performance.now();

      // Collect files
      const files = await collectFiles(resolvedDir, options.exclude);
      console.error(`Found ${files.length} files...`);

      // Load existing manifest if updating
      let existingEntries: Map<string, ManifestEntry> = new Map();
      const outputPath = options.output ?? path.join(resolvedDir, 'manifest.json');

      if (options.update) {
        try {
          const existing = await loadManifest(outputPath);
          existingEntries = new Map(existing.files.map(f => [f.path, f]));
          console.error(`Loaded existing manifest with ${existingEntries.size} entries`);
        } catch {
          // No existing manifest
        }
      }

      // Hash files
      const entries: ManifestEntry[] = [];
      let totalBytes = 0;
      let processed = 0;

      for (const file of files) {
        const relativePath = path.relative(resolvedDir, file);

        // Skip if already in manifest (update mode)
        if (options.update && existingEntries.has(relativePath)) {
          entries.push(existingEntries.get(relativePath)!);
          totalBytes += existingEntries.get(relativePath)!.size;
          processed++;
          continue;
        }

        try {
          const result = await hashFile(file, 'blake3');
          const stats = await fs.stat(file);

          entries.push({
            path: relativePath,
            hash: result.hash,
            size: result.size,
            mtime: stats.mtime.toISOString()
          });

          totalBytes += result.size;
          processed++;

          // Progress
          if (processed % 100 === 0) {
            console.error(`Processed ${processed}/${files.length} files...`);
          }
        } catch (err) {
          console.error(`Warning: Failed to hash ${file}: ${err}`);
        }
      }

      const manifest: Manifest = {
        version: '1.0',
        generated: new Date().toISOString(),
        algorithm: 'blake3',
        hashLength: 16,
        root: resolvedDir,
        fileCount: entries.length,
        totalBytes,
        files: entries.sort((a, b) => a.path.localeCompare(b.path))
      };

      // Write manifest
      if (options.format === 'csv') {
        const csv = [
          'path,hash,size,mtime',
          ...manifest.files.map(f => `"${f.path}",${f.hash},${f.size},${f.mtime ?? ''}`)
        ].join('\n');
        await fs.writeFile(outputPath.replace(/\.json$/, '.csv'), csv);
      } else {
        await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));
      }

      const duration = performance.now() - startTime;
      console.error(`\nManifest created: ${outputPath}`);
      console.error(`Files: ${manifest.fileCount}, Size: ${formatSize(totalBytes)}, Time: ${formatDuration(duration)}`);

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * wnb check - Verify directory against manifest
 */
export const checkCommand = new Command('check')
  .description('Verify directory against manifest')
  .argument('<dir>', 'Directory to check')
  .argument('<manifest>', 'Manifest file to verify against')
  .option('-q, --quiet', 'Summary only')
  .option('-v, --verbose', 'Show all files, not just mismatches')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .action(async (dir: string, manifestPath: string, options) => {
    try {
      const resolvedDir = path.resolve(dir);
      const manifest = await loadManifest(manifestPath);

      const result = await verifyManifest(resolvedDir, manifest, options.verbose);

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printCheckResult(result, options.quiet);
      }

      // Exit codes
      if (!result.valid) {
        if (result.missing.length > 0) process.exit(2);
        if (result.mismatched.length > 0) process.exit(1);
      }

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(3);
    }
  });

/**
 * wnb audit - Strict verification with verbosity levels
 */
export const auditCommand = new Command('audit')
  .description('Strict verification with verbosity levels')
  .argument('<dir>', 'Directory to audit')
  .argument('<manifest>', 'Known-good manifest')
  .option('-v, --verbose', 'Verbosity level (repeat for more)', (_, prev) => prev + 1, 0)
  .option('--strict', 'Fail on extra files not in manifest')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .action(async (dir: string, manifestPath: string, options) => {
    try {
      const resolvedDir = path.resolve(dir);
      const manifest = await loadManifest(manifestPath);

      const result = await verifyManifest(resolvedDir, manifest, true, options.strict);

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printAuditResult(result, options.verbose, options.strict);
      }

      // Exit codes
      if (result.mismatched.length > 0) process.exit(10);
      if (result.missing.length > 0) process.exit(11);
      if (options.strict && result.extra.length > 0) process.exit(12);
      if (result.duplicates.length > 0) process.exit(13);

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(3);
    }
  });

/**
 * wnb diff - Compare two manifests
 */
export const diffCommand = new Command('diff')
  .description('Compare two manifests')
  .argument('<manifest1>', 'First manifest (base)')
  .argument('<manifest2>', 'Second manifest (compare)')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .action(async (manifest1Path: string, manifest2Path: string, options) => {
    try {
      const m1 = await loadManifest(manifest1Path);
      const m2 = await loadManifest(manifest2Path);

      const m1Map = new Map(m1.files.map(f => [f.path, f]));
      const m2Map = new Map(m2.files.map(f => [f.path, f]));

      const added: ManifestEntry[] = [];
      const removed: ManifestEntry[] = [];
      const modified: Array<{ path: string; oldHash: string; newHash: string }> = [];
      const unchanged: string[] = [];

      // Find added and modified
      for (const [p, entry] of m2Map) {
        if (!m1Map.has(p)) {
          added.push(entry);
        } else if (m1Map.get(p)!.hash !== entry.hash) {
          modified.push({ path: p, oldHash: m1Map.get(p)!.hash, newHash: entry.hash });
        } else {
          unchanged.push(p);
        }
      }

      // Find removed
      for (const [p, entry] of m1Map) {
        if (!m2Map.has(p)) {
          removed.push(entry);
        }
      }

      const result = { added, removed, modified, unchanged: unchanged.length };

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (added.length > 0) {
          console.log(`ADDED (${added.length}):`);
          added.forEach(f => console.log(`  + ${f.path}`));
        }
        if (removed.length > 0) {
          console.log(`REMOVED (${removed.length}):`);
          removed.forEach(f => console.log(`  - ${f.path}`));
        }
        if (modified.length > 0) {
          console.log(`MODIFIED (${modified.length}):`);
          modified.forEach(f => console.log(`  ~ ${f.path} (${f.oldHash} → ${f.newHash})`));
        }
        console.log(`\nSummary: ${added.length} added, ${removed.length} removed, ${modified.length} modified, ${unchanged.length} unchanged`);
      }

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

// Helper functions

async function collectFiles(dir: string, exclude?: string[]): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(dir, fullPath);

    // Skip excluded patterns (simple glob matching)
    if (exclude?.some(pattern => matchGlob(relativePath, pattern))) {
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    } else if (entry.isDirectory()) {
      const subFiles = await collectFiles(fullPath, exclude);
      files.push(...subFiles);
    }
  }

  return files;
}

function matchGlob(filePath: string, pattern: string): boolean {
  // Simple glob matching
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`).test(filePath);
}

async function loadManifest(manifestPath: string): Promise<Manifest> {
  const content = await fs.readFile(manifestPath, 'utf-8');
  return JSON.parse(content) as Manifest;
}

async function verifyManifest(
  dir: string,
  manifest: Manifest,
  verbose: boolean = false,
  checkExtra: boolean = false
): Promise<AuditResult> {
  const mismatched: ManifestEntry[] = [];
  const missing: ManifestEntry[] = [];
  const extra: string[] = [];
  const hashToPath: Map<string, string[]> = new Map();
  let matched = 0;

  for (const entry of manifest.files) {
    const fullPath = path.join(dir, entry.path);

    try {
      const result = await hashFile(fullPath, 'blake3');

      if (result.hash !== entry.hash) {
        mismatched.push(entry);
        if (verbose) console.error(`MISMATCH: ${entry.path}`);
      } else {
        matched++;
        if (verbose) console.error(`OK: ${entry.path}`);
      }

      // Track duplicates
      const paths = hashToPath.get(result.hash) ?? [];
      paths.push(entry.path);
      hashToPath.set(result.hash, paths);

    } catch (err: any) {
      if (err.code === 'ENOENT') {
        missing.push(entry);
        if (verbose) console.error(`MISSING: ${entry.path}`);
      } else {
        console.error(`ERROR: ${entry.path}: ${err.message}`);
      }
    }
  }

  // Check for extra files
  if (checkExtra) {
    const manifestPaths = new Set(manifest.files.map(f => f.path));
    const actualFiles = await collectFiles(dir);

    for (const file of actualFiles) {
      const relativePath = path.relative(dir, file);
      if (!manifestPaths.has(relativePath)) {
        extra.push(relativePath);
        if (verbose) console.error(`EXTRA: ${relativePath}`);
      }
    }
  }

  // Find duplicates
  const duplicates: Array<{ hash: string; paths: string[] }> = [];
  for (const [hash, paths] of hashToPath) {
    if (paths.length > 1) {
      duplicates.push({ hash, paths });
    }
  }

  return {
    valid: mismatched.length === 0 && missing.length === 0,
    total: manifest.files.length,
    matched,
    mismatched,
    missing,
    extra,
    duplicates
  };
}

function printCheckResult(result: AuditResult, quiet: boolean): void {
  if (quiet) {
    console.log(result.valid ? 'OK' : 'FAILED');
    return;
  }

  console.log(`Total files: ${result.total}`);
  console.log(`Matched: ${result.matched}`);
  if (result.mismatched.length > 0) {
    console.log(`Mismatched: ${result.mismatched.length}`);
    result.mismatched.forEach(f => console.log(`  ${f.path}`));
  }
  if (result.missing.length > 0) {
    console.log(`Missing: ${result.missing.length}`);
    result.missing.forEach(f => console.log(`  ${f.path}`));
  }
  console.log(`\nResult: ${result.valid ? 'PASS' : 'FAIL'}`);
}

function printAuditResult(result: AuditResult, verbosity: number, strict: boolean): void {
  if (verbosity >= 1) {
    console.log('=== Audit Summary ===');
    console.log(`Total: ${result.total}`);
    console.log(`Matched: ${result.matched}`);
    console.log(`Mismatched: ${result.mismatched.length}`);
    console.log(`Missing: ${result.missing.length}`);
    console.log(`Extra: ${result.extra.length}`);
    console.log(`Duplicates: ${result.duplicates.length}`);
  }

  if (verbosity >= 2) {
    if (result.mismatched.length > 0) {
      console.log('\n=== Mismatched Files ===');
      result.mismatched.forEach(f => console.log(`  ${f.path}: expected ${f.hash}`));
    }
    if (result.missing.length > 0) {
      console.log('\n=== Missing Files ===');
      result.missing.forEach(f => console.log(`  ${f.path}`));
    }
    if (result.extra.length > 0 && strict) {
      console.log('\n=== Extra Files ===');
      result.extra.forEach(f => console.log(`  ${f}`));
    }
    if (result.duplicates.length > 0) {
      console.log('\n=== Duplicate Files ===');
      result.duplicates.forEach(d => {
        console.log(`  Hash ${d.hash}:`);
        d.paths.forEach(p => console.log(`    ${p}`));
      });
    }
  }

  const pass = result.mismatched.length === 0 &&
    result.missing.length === 0 &&
    (!strict || result.extra.length === 0);

  console.log(`\nAudit: ${pass ? 'PASS' : 'FAIL'}`);
}
