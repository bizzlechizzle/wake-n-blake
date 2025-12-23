/**
 * wnb phash command
 * Perceptual hashing for image similarity detection
 */

import { Command } from 'commander';
import * as path from 'node:path';
import {
  computePhash,
  compareImages,
  findSimilarImages,
  similarityFromDistance
} from '../../services/phash/index.js';
import { formatError, formatDuration } from '../output.js';
import type { PhashAlgorithm } from '../../services/phash/schemas.js';

/**
 * wnb phash - Perceptual hashing for images
 */
export const phashCommand = new Command('phash')
  .description('Compute perceptual hashes for images to find similar/duplicate images')
  .argument('<paths...>', 'Image files or directories')
  .option('-a, --algorithm <alg>', 'Algorithm: dhash (default), ahash, phash', 'dhash')
  .option('-t, --threshold <n>', 'Hamming distance threshold for similarity (default: 10)', '10')
  .option('-r, --recursive', 'Scan directories recursively')
  .option('--compare', 'Compare exactly two images')
  .option('--hash-only', 'Only compute hashes, do not find similar images')
  .option('-f, --format <fmt>', 'Output format: text (default), json', 'text')
  .option('-q, --quiet', 'Minimal output')
  .action(async (paths: string[], options) => {
    try {
      const format = options.format as 'text' | 'json';
      const algorithm = options.algorithm as PhashAlgorithm;
      const threshold = parseInt(options.threshold, 10);

      // Validate threshold (0-64 for 64-bit hashes)
      if (isNaN(threshold) || threshold < 0 || threshold > 64) {
        console.error('Error: --threshold must be 0-64 (hamming distance for 64-bit hash)');
        process.exit(1);
      }

      // Validate algorithm
      const validAlgorithms = ['dhash', 'ahash', 'phash'];
      if (!validAlgorithms.includes(options.algorithm)) {
        console.error(`Error: --algorithm must be one of: ${validAlgorithms.join(', ')}`);
        process.exit(1);
      }

      // Compare mode: exactly two images
      if (options.compare) {
        if (paths.length !== 2) {
          console.error('--compare requires exactly two image paths');
          process.exit(1);
        }

        const result = await compareImages(paths[0], paths[1], {
          algorithm,
          threshold
        });

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printCompareResult(result, options.quiet);
        }

        process.exit(result.areSimilar ? 0 : 1);
      }

      // Hash-only mode
      if (options.hashOnly) {
        const hashes = [];
        for (const p of paths) {
          try {
            const hash = await computePhash(path.resolve(p), { algorithm });
            hashes.push(hash);

            if (!options.quiet && format === 'text') {
              console.log(`${hash.hash}  ${path.basename(p)}`);
            }
          } catch (err) {
            console.error(`Error: ${p}: ${err}`);
          }
        }

        if (format === 'json') {
          console.log(JSON.stringify(hashes, null, 2));
        }
        return;
      }

      // Find similar images mode
      if (!options.quiet) {
        console.error('Scanning for images...');
      }

      let lastProgress = 0;
      const result = await findSimilarImages(paths, {
        algorithm,
        threshold,
        recursive: options.recursive,
        onProgress: options.quiet ? undefined : (current, total, file) => {
          const now = Date.now();
          if (now - lastProgress > 100 || current === total) {
            process.stderr.write(`\rProcessing ${current}/${total}: ${path.basename(file)}`);
            lastProgress = now;
          }
        }
      });

      if (!options.quiet) {
        process.stderr.write('\r' + ' '.repeat(80) + '\r');
      }

      if (format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printFindResult(result, options.quiet, threshold);
      }

      // Exit with error if no similar images found
      if (result.similarGroups.length === 0 && result.totalImages > 1) {
        process.exit(1);
      }

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * Print comparison result
 */
function printCompareResult(
  result: Awaited<ReturnType<typeof compareImages>>,
  quiet: boolean
): void {
  if (quiet) {
    console.log(result.areSimilar ? 'SIMILAR' : 'DIFFERENT');
    return;
  }

  console.log('Image Comparison');
  console.log('');
  console.log(`  File 1:     ${path.basename(result.file1)}`);
  console.log(`  Hash 1:     ${result.hash1}`);
  console.log(`  File 2:     ${path.basename(result.file2)}`);
  console.log(`  Hash 2:     ${result.hash2}`);
  console.log('');
  console.log(`  Distance:   ${result.distance} bits`);
  console.log(`  Similarity: ${result.similarity.toFixed(1)}%`);
  console.log('');
  console.log(`  Result:     ${result.areSimilar ? 'SIMILAR' : 'DIFFERENT'}`);
}

/**
 * Print find similar result
 */
function printFindResult(
  result: Awaited<ReturnType<typeof findSimilarImages>>,
  quiet: boolean,
  threshold: number
): void {
  if (quiet) {
    console.log(`${result.similarGroups.length} similar groups, ${result.uniqueImages} unique`);
    return;
  }

  console.log('Perceptual Hash Analysis');
  console.log('');
  console.log(`  Total images:    ${result.totalImages}`);
  console.log(`  Processed:       ${result.processedImages}`);
  console.log(`  Unique images:   ${result.uniqueImages}`);
  console.log(`  Similar groups:  ${result.similarGroups.length}`);
  console.log(`  Similar pairs:   ${result.similarPairs.length}`);
  console.log(`  Errors:          ${result.errors.length}`);
  console.log(`  Duration:        ${formatDuration(result.durationMs)}`);
  console.log(`  Threshold:       ${threshold} bits`);

  if (result.similarGroups.length > 0) {
    console.log('');
    console.log('Similar Groups:');

    const showCount = Math.min(result.similarGroups.length, 10);
    for (let i = 0; i < showCount; i++) {
      const group = result.similarGroups[i];
      console.log('');
      console.log(`  Group ${i + 1} (${group.files.length} images, hash: ${group.hash.slice(0, 8)}...):`);

      const showFiles = Math.min(group.files.length, 5);
      for (let j = 0; j < showFiles; j++) {
        const file = group.files[j];
        const dist = group.distances[j];
        const sim = similarityFromDistance(dist);
        const marker = j === 0 ? ' (representative)' : '';
        console.log(`    - ${path.basename(file)} [dist: ${dist}, ${sim.toFixed(0)}%]${marker}`);
      }

      if (group.files.length > showFiles) {
        console.log(`    ... and ${group.files.length - showFiles} more`);
      }
    }

    if (result.similarGroups.length > showCount) {
      console.log('');
      console.log(`  ... and ${result.similarGroups.length - showCount} more groups`);
    }
  }

  if (result.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    result.errors.slice(0, 5).forEach(e => {
      console.log(`  ${path.basename(e.file)}: ${e.error}`);
    });
    if (result.errors.length > 5) {
      console.log(`  ... and ${result.errors.length - 5} more`);
    }
  }

  console.log('');
  if (result.similarGroups.length > 0) {
    console.log(`Found ${result.similarGroups.length} groups of similar images`);
  } else {
    console.log('No similar images found');
  }
}
