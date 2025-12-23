/**
 * wnb mhl command
 * Generate and verify MHL (Media Hash List) files for professional post-production
 */

import { Command } from 'commander';
import * as path from 'node:path';
import {
  generateMhl,
  writeMhl,
  verifyMhl,
  generateMhlFilename,
  mhlToXml,
  type MhlAlgorithm
} from '../../services/mhl/index.js';
import { formatError, formatSize, formatDuration } from '../output.js';

/**
 * wnb mhl - Generate or verify MHL files
 */
export const mhlCommand = new Command('mhl')
  .description('Generate or verify MHL (Media Hash List) files for post-production')
  .argument('<path>', 'Directory to hash or MHL file to verify')
  .option('-o, --output <path>', 'Output MHL file path')
  .option('-a, --algorithm <alg>', 'Hash algorithm: xxhash64 (default), md5, both', 'xxhash64')
  .option('--verify', 'Verify files against MHL instead of generating')
  .option('--base <path>', 'Base path for verification (default: MHL file directory)')
  .option('--exclude <pattern...>', 'Patterns to exclude from hashing')
  .option('-f, --format <fmt>', 'Output format: text (default), json, xml', 'text')
  .option('-q, --quiet', 'Minimal output')
  .action(async (inputPath: string, options) => {
    try {
      const resolvedPath = path.resolve(inputPath);
      const format = options.format as 'text' | 'json' | 'xml';
      const algorithm = options.algorithm as MhlAlgorithm;

      if (options.verify) {
        // Verify existing MHL
        const startTime = performance.now();

        const result = await verifyMhl(resolvedPath, options.base, {
          onProgress: options.quiet ? undefined : (current, total, file, status) => {
            const icon = status === 'ok' ? '✓' : status === 'mismatch' ? '✗' : '?';
            process.stderr.write(`\r${icon} Verifying ${current}/${total}: ${path.basename(file)}`);
          }
        });

        const durationMs = performance.now() - startTime;

        if (!options.quiet) {
          process.stderr.write('\r' + ' '.repeat(80) + '\r');
        }

        if (format === 'json') {
          console.log(JSON.stringify({ ...result, durationMs }, null, 2));
        } else {
          printVerifyResult(result, durationMs, options.quiet);
        }

        if (!result.valid) {
          process.exit(1);
        }

      } else {
        // Generate MHL
        const startTime = performance.now();

        const doc = await generateMhl(resolvedPath, {
          algorithm,
          excludePatterns: options.exclude,
          onProgress: options.quiet ? undefined : (current, total, file) => {
            process.stderr.write(`\rHashing ${current}/${total}: ${path.basename(file)}`);
          }
        });

        const durationMs = performance.now() - startTime;

        if (!options.quiet) {
          process.stderr.write('\r' + ' '.repeat(80) + '\r');
        }

        // Determine output path
        const outputPath = options.output || path.join(
          path.dirname(resolvedPath),
          generateMhlFilename(resolvedPath)
        );

        // Write MHL file unless outputting to stdout
        if (format === 'xml') {
          console.log(mhlToXml(doc));
        } else if (format === 'json') {
          console.log(JSON.stringify({ ...doc, outputPath, durationMs }, null, 2));
        } else {
          // Write to file and print summary
          await writeMhl(doc, outputPath);
          printGenerateResult(doc, outputPath, durationMs, options.quiet);
        }
      }

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * Print MHL generation result
 */
function printGenerateResult(
  doc: Awaited<ReturnType<typeof generateMhl>>,
  outputPath: string,
  durationMs: number,
  quiet: boolean
): void {
  if (quiet) {
    console.log(outputPath);
    return;
  }

  const totalSize = doc.hashes.reduce((sum, h) => sum + h.size, 0);
  const algorithms = [];
  if (doc.hashes[0]?.xxhash64) algorithms.push('xxhash64');
  if (doc.hashes[0]?.md5) algorithms.push('md5');

  console.log('MHL file generated successfully');
  console.log('');
  console.log(`  Output:      ${outputPath}`);
  console.log(`  Version:     ${doc.version}`);
  console.log(`  Algorithm:   ${algorithms.join(', ')}`);
  console.log(`  Files:       ${doc.hashes.length}`);
  console.log(`  Total size:  ${formatSize(totalSize)}`);
  console.log(`  Duration:    ${formatDuration(durationMs)}`);
  console.log(`  Creator:     ${doc.creatorInfo.name} v${doc.creatorInfo.version}`);
  console.log(`  Host:        ${doc.creatorInfo.host}`);
}

/**
 * Print MHL verification result
 */
function printVerifyResult(
  result: Awaited<ReturnType<typeof verifyMhl>>,
  durationMs: number,
  quiet: boolean
): void {
  if (quiet) {
    console.log(result.valid ? 'VALID' : 'INVALID');
    return;
  }

  console.log(`MHL Verification: ${result.valid ? 'VALID' : 'INVALID'}`);
  console.log('');
  console.log(`  Total files:     ${result.total}`);
  console.log(`  Matched:         ${result.matched}`);
  console.log(`  Mismatched:      ${result.mismatched.length}`);
  console.log(`  Missing:         ${result.missing.length}`);
  console.log(`  Duration:        ${formatDuration(durationMs)}`);

  if (result.mismatched.length > 0) {
    console.log('');
    console.log(`Mismatched files (${result.mismatched.length}):`);
    result.mismatched.slice(0, 10).forEach(f => {
      console.log(`  - ${f.file}`);
    });
    if (result.mismatched.length > 10) {
      console.log(`  ... and ${result.mismatched.length - 10} more`);
    }
  }

  if (result.missing.length > 0) {
    console.log('');
    console.log(`Missing files (${result.missing.length}):`);
    result.missing.slice(0, 10).forEach(f => {
      console.log(`  - ${f.file}`);
    });
    if (result.missing.length > 10) {
      console.log(`  ... and ${result.missing.length - 10} more`);
    }
  }

  console.log('');
  console.log(`Result: ${result.valid ? 'PASS' : 'FAIL'}`);
}
