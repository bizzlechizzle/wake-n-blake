/**
 * wnb verify command
 * Verify file against expected hash
 */

import { Command } from 'commander';
import * as path from 'node:path';
import { verifyFile } from '../../core/hasher.js';
import { formatVerifyResult, formatError } from '../output.js';
import { detectAlgorithm, type Algorithm } from '../../schemas/index.js';

export const verifyCommand = new Command('verify')
  .description('Verify file against expected hash')
  .argument('<file>', 'File to verify')
  .argument('<hash>', 'Expected hash (auto-detects algorithm by length)')
  .option('-a, --algorithm <alg>', 'Force algorithm: blake3, blake3-full, sha256, sha512')
  .option('-q, --quiet', 'Exit code only, no output')
  .action(async (filePath: string, expectedHash: string, options) => {
    try {
      const resolvedPath = path.resolve(filePath);

      // Determine algorithm
      let algorithm: Algorithm | undefined = options.algorithm as Algorithm | undefined;

      if (!algorithm) {
        algorithm = detectAlgorithm(expectedHash) ?? undefined;
        if (!algorithm) {
          console.error(formatError(`Cannot detect algorithm for hash length ${expectedHash.length}`));
          console.error('Use -a to specify: blake3 (16), sha256 (64), sha512 (128)');
          process.exit(3);
        }
      }

      const result = await verifyFile(resolvedPath, expectedHash, algorithm);

      if (!options.quiet) {
        console.log(formatVerifyResult(
          resolvedPath,
          expectedHash,
          result.actual,
          result.match,
          'text'
        ));
      }

      process.exit(result.match ? 0 : 1);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        if (!options.quiet) {
          console.error(formatError(`File not found: ${filePath}`));
        }
        process.exit(2);
      }

      console.error(formatError(String(err)));
      process.exit(1);
    }
  });
