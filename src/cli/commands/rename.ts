/**
 * wnb rename command
 * Rename files with embedded hash
 */

import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { hashFile } from '../../core/hasher.js';
import { scanDirectory } from '../../services/scanner.js';
import { formatError } from '../output.js';

export const renameCommand = new Command('rename')
  .description('Rename files with embedded BLAKE3 hash')
  .argument('<path>', 'File or directory to rename')
  .option('--embed', 'Embed hash in filename')
  .option('--pattern <pattern>', 'Naming pattern (default: "{name}.{hash}.{ext}")', '{name}.{hash}.{ext}')
  .option('--dry-run', 'Show what would be renamed')
  .option('-r, --recursive', 'Process directories recursively')
  .option('--full', 'Use full 64-char hash instead of 16-char')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .action(async (targetPath: string, options) => {
    try {
      if (!options.embed) {
        console.error(formatError('Use --embed to embed hash in filename'));
        process.exit(3);
      }

      const resolvedPath = path.resolve(targetPath);
      const stats = await fs.stat(resolvedPath);
      const format = options.format as 'text' | 'json';
      const results: Array<{ original: string; renamed: string; hash: string }> = [];

      if (stats.isFile()) {
        // Single file
        const result = await renameWithHash(resolvedPath, options.pattern, options.full, options.dryRun);
        if (result) {
          results.push(result);
        }
      } else if (stats.isDirectory()) {
        if (!options.recursive) {
          console.error(formatError('Use -r to process directories recursively'));
          process.exit(3);
        }

        const scanResult = await scanDirectory(resolvedPath, { recursive: true });

        for (const file of scanResult.files) {
          try {
            const result = await renameWithHash(file, options.pattern, options.full, options.dryRun);
            if (result) {
              results.push(result);
            }
          } catch (err) {
            console.error(`Warning: Failed to rename ${file}: ${err}`);
          }
        }
      }

      // Output results
      if (format === 'json') {
        console.log(JSON.stringify({
          dryRun: options.dryRun ?? false,
          renamed: results
        }, null, 2));
      } else {
        for (const r of results) {
          const action = options.dryRun ? 'Would rename' : 'Renamed';
          console.log(`${action}: ${path.basename(r.original)} -> ${path.basename(r.renamed)}`);
        }
        console.log(`\nTotal: ${results.length} files ${options.dryRun ? 'would be ' : ''}renamed`);
      }

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * Rename a single file with embedded hash
 */
async function renameWithHash(
  filePath: string,
  pattern: string,
  full: boolean = false,
  dryRun: boolean = true
): Promise<{ original: string; renamed: string; hash: string } | null> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const name = path.basename(filePath, ext);

  // Check if file already has a hash embedded (16 or 64 hex chars before extension)
  const hashPattern = /\.[a-f0-9]{16}$|\.[a-f0-9]{64}$/;
  if (hashPattern.test(name)) {
    // Already has hash embedded, skip
    return null;
  }

  // Compute hash
  const algorithm = full ? 'blake3-full' : 'blake3';
  const result = await hashFile(filePath, algorithm);
  const hash = result.hash;

  // Build new filename using pattern
  const newName = pattern
    .replace('{name}', name)
    .replace('{hash}', hash)
    .replace('{ext}', ext.slice(1)) // Remove leading dot
    .replace(/\.$/, ''); // Remove trailing dot if no extension

  // Add extension back if pattern doesn't include it
  const newFileName = pattern.includes('{ext}') ? newName : newName + ext;
  const newPath = path.join(dir, newFileName);

  if (!dryRun) {
    await fs.rename(filePath, newPath);
  }

  return {
    original: filePath,
    renamed: newPath,
    hash
  };
}
