/**
 * wnb fast command
 * Fast mode - sample-based hashing for large files
 */

import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fastHash } from '../../core/fast-hasher.js';
import { scanDirectory } from '../../services/scanner.js';
import { formatError, formatSize, formatDuration } from '../output.js';

export const fastCommand = new Command('fast')
  .description('Fast mode - sample-based hashing for large files')
  .argument('<path>', 'File or directory to hash')
  .option('--sample-size <mb>', 'Sample size in MB (default: 300)', '300')
  .option('--threshold <mb>', 'Minimum file size for sampling in MB (default: 1024)', '1024')
  .option('-r, --recursive', 'Process directories recursively')
  .option('--full', 'Full 64-char hash')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .option('-q, --quiet', 'Only output hash values')
  .action(async (targetPath: string, options) => {
    try {
      const sampleSize = parseInt(options.sampleSize, 10) * 1024 * 1024;
      const threshold = parseInt(options.threshold, 10) * 1024 * 1024;
      const format = options.format as 'text' | 'json';

      const resolvedPath = path.resolve(targetPath);
      const stats = await fs.stat(resolvedPath);

      if (stats.isFile()) {
        // Single file
        const result = await fastHash(resolvedPath, {
          sampleSize,
          threshold,
          full: options.full
        });

        if (format === 'json') {
          console.log(JSON.stringify({ path: resolvedPath, ...result }, null, 2));
        } else if (options.quiet) {
          console.log(result.hash);
        } else {
          const sampleNote = result.sampled ? ' (sampled)' : '';
          console.log(`${result.hash}  ${resolvedPath}${sampleNote}`);
          if (result.sampled && result.sampleRegions) {
            console.log(`  Size: ${formatSize(result.size)}, Regions: ${result.sampleRegions.length}`);
          }
        }

      } else if (stats.isDirectory()) {
        const scanResult = await scanDirectory(resolvedPath, {
          recursive: options.recursive ?? true
        });

        const results: Array<{ path: string; hash: string; size: number; sampled: boolean }> = [];
        let sampledCount = 0;
        let fullCount = 0;
        const startTime = performance.now();

        for (let i = 0; i < scanResult.files.length; i++) {
          const file = scanResult.files[i];

          if (!options.quiet) {
            process.stderr.write(`\r${i + 1}/${scanResult.files.length} files...`);
          }

          try {
            const result = await fastHash(file, {
              sampleSize,
              threshold,
              full: options.full
            });

            results.push({
              path: file,
              hash: result.hash,
              size: result.size,
              sampled: result.sampled
            });

            if (result.sampled) {
              sampledCount++;
            } else {
              fullCount++;
            }

            if (format === 'text' && !options.quiet) {
              process.stderr.write('\r' + ' '.repeat(50) + '\r');
              const sampleNote = result.sampled ? ' (sampled)' : '';
              console.log(`${result.hash}  ${file}${sampleNote}`);
            } else if (options.quiet) {
              console.log(result.hash);
            }
          } catch {
            // Skip files we can't hash
          }
        }

        if (!options.quiet) {
          process.stderr.write('\r' + ' '.repeat(50) + '\r');
        }

        const totalDuration = performance.now() - startTime;

        if (format === 'json') {
          console.log(JSON.stringify({
            files: results,
            summary: {
              total: results.length,
              sampled: sampledCount,
              full: fullCount,
              durationMs: totalDuration
            }
          }, null, 2));
        } else if (!options.quiet) {
          console.log(`\nSummary: ${results.length} files (${sampledCount} sampled, ${fullCount} full) in ${formatDuration(totalDuration)}`);
        }

      } else {
        console.error(formatError('Path must be a file or directory'));
        process.exit(2);
      }

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });
