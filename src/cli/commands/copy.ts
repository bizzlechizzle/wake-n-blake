/**
 * wnb copy command
 * Network-safe file copy with inline hashing
 */

import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { copyWithHash, moveWithHash, copyBatch } from '../../core/copier.js';
import { formatError, formatSize, formatDuration } from '../output.js';
import type { Algorithm } from '../../schemas/index.js';

export const copyCommand = new Command('copy')
  .description('Copy files with inline BLAKE3 hashing and verification')
  .argument('<source>', 'Source file or directory')
  .argument('<destination>', 'Destination path')
  .option('-a, --algorithm <alg>', 'Hash algorithm: blake3 (default), sha256, sha512', 'blake3')
  .option('--no-verify', 'Skip verification after copy')
  .option('--overwrite', 'Overwrite existing files')
  .option('--move', 'Move instead of copy (delete source after verified copy)')
  .option('-r, --recursive', 'Copy directories recursively')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .option('-q, --quiet', 'Minimal output')
  .action(async (source: string, destination: string, options) => {
    try {
      const resolvedSource = path.resolve(source);
      const resolvedDest = path.resolve(destination);
      const stats = await fs.stat(resolvedSource);
      const algorithm = options.algorithm as Algorithm;
      const format = options.format as 'text' | 'json';
      const startTime = performance.now();

      if (stats.isFile()) {
        // Single file copy
        const copyFn = options.move ? moveWithHash : copyWithHash;
        const result = await copyFn(resolvedSource, resolvedDest, {
          algorithm,
          verify: options.verify,
          overwrite: options.overwrite,
          onProgress: options.quiet ? undefined : (bytes, total) => {
            const percent = Math.round((bytes / total) * 100);
            process.stderr.write(`\r${percent}% (${formatSize(bytes)}/${formatSize(total)})`);
          }
        });

        if (!options.quiet) {
          process.stderr.write('\r' + ' '.repeat(50) + '\r'); // Clear progress
        }

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else if (!options.quiet) {
          const action = options.move ? 'Moved' : 'Copied';
          console.log(`${action}: ${result.source}`);
          console.log(`    To: ${result.destination}`);
          console.log(`  Hash: ${result.hash} (${result.algorithm})`);
          console.log(`  Size: ${formatSize(result.size)}`);
          console.log(`  Time: ${formatDuration(result.durationMs)}`);
          if (result.verified) {
            console.log(`Status: VERIFIED`);
          }
          if (result.retries > 0) {
            console.log(`Retries: ${result.retries}`);
          }
        } else {
          console.log(`${result.hash}  ${result.destination}`);
        }

      } else if (stats.isDirectory()) {
        if (!options.recursive) {
          console.error(formatError('Use -r to copy directories recursively'));
          process.exit(2);
        }

        // Collect files
        const files = await collectFilesForCopy(resolvedSource, resolvedDest);
        console.error(`Found ${files.length} files to copy...`);

        // Copy batch
        const results = await copyBatch(files, {
          algorithm,
          verify: options.verify,
          overwrite: options.overwrite
        });

        const totalSize = results.reduce((sum, r) => sum + r.size, 0);
        const totalDuration = performance.now() - startTime;

        if (format === 'json') {
          console.log(JSON.stringify({
            files: results,
            summary: {
              total: files.length,
              copied: results.length,
              failed: files.length - results.length,
              totalSize,
              durationMs: totalDuration
            }
          }, null, 2));
        } else {
          console.log(`\nSummary:`);
          console.log(`  Files: ${results.length}/${files.length}`);
          console.log(`  Size:  ${formatSize(totalSize)}`);
          console.log(`  Time:  ${formatDuration(totalDuration)}`);
          console.log(`  Speed: ${formatSize(totalSize / (totalDuration / 1000))}/s`);
        }

      } else {
        console.error(formatError('Source must be a file or directory'));
        process.exit(2);
      }

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * Collect files for directory copy
 */
async function collectFilesForCopy(
  sourceDir: string,
  destDir: string
): Promise<Array<{ source: string; destination: string }>> {
  const files: Array<{ source: string; destination: string }> = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(dir, entry.name);
      const relativePath = path.relative(sourceDir, sourcePath);
      const destPath = path.join(destDir, relativePath);

      if (entry.isFile()) {
        files.push({ source: sourcePath, destination: destPath });
      } else if (entry.isDirectory()) {
        await walk(sourcePath);
      }
    }
  }

  await walk(sourceDir);
  return files.sort((a, b) => a.source.localeCompare(b.source));
}
