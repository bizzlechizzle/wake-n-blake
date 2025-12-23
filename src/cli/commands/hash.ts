/**
 * wnb hash command
 * Compute BLAKE3 (default) or other algorithm hashes
 */

import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { hashFile, hashFileAll, setHasherMode } from '../../core/hasher.js';
import { formatHashResult, formatHashResults, formatAllHashes, formatError } from '../output.js';
import { WorkerPool } from '../../services/worker-pool.js';
import { isNetworkPath } from '../../utils/network.js';
import { getEffectiveConcurrency } from '../../core/config.js';
import type { Algorithm, HashResult } from '../../schemas/index.js';

export const hashCommand = new Command('hash')
  .description('Compute BLAKE3 hash of files (default) or use other algorithms')
  .argument('<path>', 'File or directory to hash')
  .option('-a, --algorithm <alg>', 'Algorithm: blake3 (default), sha256, sha512, all', 'blake3')
  .option('--all', 'Compute all algorithms (shorthand for -a all)')
  .option('-r, --recursive', 'Hash directories recursively')
  .option('--full', 'Full 256-bit output (64 hex chars) for BLAKE3')
  .option('-f, --format <fmt>', 'Output format: text, json, csv, bsd, sfv', 'text')
  .option('-q, --quiet', 'Only output hash values')
  .option('-p, --parallel <n>', 'Number of parallel workers (default: auto)')
  .option('--hdd', 'Sequential mode for mechanical drives')
  .option('--native', 'Force native b3sum (fail if unavailable)')
  .option('--wasm', 'Force WASM (skip native detection)')
  .action(async (targetPath: string, options) => {
    try {
      const resolvedPath = path.resolve(targetPath);
      const stats = await fs.stat(resolvedPath);

      // Set hasher mode (native vs wasm)
      if (options.native) {
        setHasherMode('native');
      } else if (options.wasm) {
        setHasherMode('wasm');
      }

      // Determine algorithm
      let algorithm: Algorithm | 'all' = options.algorithm as Algorithm | 'all';
      if (options.all) {
        algorithm = 'all';
      } else if (options.full && algorithm === 'blake3') {
        algorithm = 'blake3-full';
      }

      const format = options.format as 'text' | 'json' | 'csv' | 'bsd' | 'sfv';

      if (stats.isFile()) {
        // Single file
        if (algorithm === 'all') {
          const result = await hashFileAll(resolvedPath);
          console.log(formatAllHashes(result, resolvedPath, format));
        } else {
          const result = await hashFile(resolvedPath, algorithm);
          if (options.quiet) {
            console.log(result.hash);
          } else {
            console.log(formatHashResult(result, format));
          }
        }
      } else if (stats.isDirectory()) {
        // Directory
        const files = await collectFiles(resolvedPath, options.recursive);
        const isNetwork = isNetworkPath(resolvedPath);

        // Determine concurrency
        const parallel = options.parallel ? parseInt(options.parallel, 10) : undefined;
        const concurrency = await getEffectiveConcurrency({
          parallel,
          hdd: options.hdd,
          isNetwork
        });

        if (algorithm === 'all') {
          // For 'all', process each file sequentially (multiple algorithms)
          for (const file of files) {
            const result = await hashFileAll(file);
            console.log(formatAllHashes(result, file, format));
            if (format !== 'json') console.log();
          }
        } else if (concurrency > 1 && files.length > 1) {
          // Use worker pool for parallel hashing
          const pool = new WorkerPool({
            concurrency,
            forceSequential: options.hdd
          });
          await pool.initialize();

          try {
            const results: HashResult[] = [];
            const poolResults = await pool.hashFiles(files, algorithm, (done, total, _file) => {
              if (!options.quiet) {
                process.stderr.write(`\r${done}/${total} files...`);
              }
            });

            if (!options.quiet) {
              process.stderr.write('\r' + ' '.repeat(30) + '\r');
            }

            for (const pr of poolResults) {
              if (pr.error) {
                console.error(formatError(`Failed to hash ${pr.filePath}: ${pr.error}`));
              } else {
                const result: HashResult = {
                  path: pr.filePath,
                  hash: pr.hash,
                  algorithm,
                  size: pr.size,
                  durationMs: 0
                };
                results.push(result);

                if (format === 'text' && !options.quiet) {
                  console.log(formatHashResult(result, format));
                } else if (options.quiet) {
                  console.log(result.hash);
                }
              }
            }

            if (format !== 'text' && !options.quiet) {
              console.log(formatHashResults(results, format));
            }
          } finally {
            await pool.shutdown();
          }
        } else {
          // Sequential processing (single file, HDD mode, or concurrency=1)
          const results: HashResult[] = [];

          for (const file of files) {
            try {
              const result = await hashFile(file, algorithm);
              results.push(result);

              if (format === 'text' && !options.quiet) {
                console.log(formatHashResult(result, format));
              } else if (options.quiet) {
                console.log(result.hash);
              }
            } catch (err) {
              console.error(formatError(`Failed to hash ${file}: ${err}`));
            }
          }

          if (format !== 'text' && !options.quiet) {
            console.log(formatHashResults(results, format));
          }
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

/**
 * Collect all files in a directory
 */
async function collectFiles(dir: string, recursive: boolean = true): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isFile()) {
      files.push(fullPath);
    } else if (entry.isDirectory() && recursive) {
      const subFiles = await collectFiles(fullPath, true);
      files.push(...subFiles);
    }
  }

  return files.sort();
}
