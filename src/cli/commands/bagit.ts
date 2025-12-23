/**
 * wnb bagit command
 * Create and verify BagIt packages (RFC 8493)
 */

import { Command } from 'commander';
import * as path from 'node:path';
import { createBag, verifyBag } from '../../services/bagit/index.js';
import { formatError, formatSize, formatDuration } from '../output.js';
import type { BagItAlgorithm } from '../../services/bagit/schemas.js';

/**
 * wnb bagit - Create or verify BagIt packages
 */
export const bagitCommand = new Command('bagit')
  .description('Create or verify BagIt packages (RFC 8493)')
  .argument('<dir>', 'Directory to bag or existing bag to verify')
  .option('-o, --output <path>', 'Output bag directory (default: modify in-place)')
  .option('-a, --algorithm <alg>', 'Hash algorithm: sha256 (default), sha512', 'sha256')
  .option('--verify', 'Verify existing bag instead of creating')
  .option('--no-move', 'Copy files instead of moving to data/ (when creating)')
  .option('--include-hidden', 'Include hidden files (starting with .)')
  .option('--exclude <pattern...>', 'Patterns to exclude')
  .option('--source-org <org>', 'Source-Organization for bag-info.txt')
  .option('--contact-name <name>', 'Contact-Name for bag-info.txt')
  .option('--contact-email <email>', 'Contact-Email for bag-info.txt')
  .option('--description <desc>', 'External-Description for bag-info.txt')
  .option('--identifier <id>', 'External-Identifier for bag-info.txt')
  .option('-f, --format <fmt>', 'Output format: text (default), json', 'text')
  .option('-q, --quiet', 'Minimal output')
  .action(async (dir: string, options) => {
    try {
      const resolvedDir = path.resolve(dir);
      const format = options.format as 'text' | 'json';
      const algorithm = options.algorithm as BagItAlgorithm;

      if (options.verify) {
        // Verify existing bag
        const result = await verifyBag(resolvedDir, {
          verbose: !options.quiet,
          onProgress: options.quiet ? undefined : (current, total, file) => {
            process.stderr.write(`\rVerifying ${current}/${total}: ${path.basename(file)}`);
          }
        });

        if (!options.quiet) {
          process.stderr.write('\r' + ' '.repeat(80) + '\r'); // Clear progress line
        }

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printVerifyResult(result, options.quiet);
        }

        // Exit with appropriate code
        if (!result.valid) {
          process.exit(1);
        }

      } else {
        // Create new bag
        const bagInfo: Record<string, string> = {};
        if (options.sourceOrg) bagInfo['Source-Organization'] = options.sourceOrg;
        if (options.contactName) bagInfo['Contact-Name'] = options.contactName;
        if (options.contactEmail) bagInfo['Contact-Email'] = options.contactEmail;
        if (options.description) bagInfo['External-Description'] = options.description;
        if (options.identifier) bagInfo['External-Identifier'] = options.identifier;

        let lastProgress = 0;
        const result = await createBag(resolvedDir, {
          algorithm,
          outputPath: options.output,
          inPlace: options.move !== false,
          includeHiddenFiles: options.includeHidden,
          excludePatterns: options.exclude,
          bagInfo: Object.keys(bagInfo).length > 0 ? bagInfo : undefined,
          onProgress: options.quiet ? undefined : (current, total, file) => {
            const now = Date.now();
            if (now - lastProgress > 100 || current === total) {
              process.stderr.write(`\rHashing ${current}/${total}: ${path.basename(file)}`);
              lastProgress = now;
            }
          }
        });

        if (!options.quiet) {
          process.stderr.write('\r' + ' '.repeat(80) + '\r'); // Clear progress line
        }

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printCreateResult(result, options.quiet);
        }
      }

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * Print bag creation result
 */
function printCreateResult(result: Awaited<ReturnType<typeof createBag>>, quiet: boolean): void {
  if (quiet) {
    console.log(result.bagPath);
    return;
  }

  console.log('BagIt package created successfully');
  console.log('');
  console.log(`  Bag path:      ${result.bagPath}`);
  console.log(`  Algorithm:     ${result.algorithm}`);
  console.log(`  Files:         ${result.fileCount}`);
  console.log(`  Size:          ${formatSize(result.totalBytes)}`);
  console.log(`  Payload-Oxum:  ${result.payloadOxum}`);
  console.log(`  Duration:      ${formatDuration(result.durationMs)}`);
  console.log('');
  console.log('Tag files:');
  result.tagFiles.forEach(f => console.log(`  - ${f}`));
}

/**
 * Print bag verification result
 */
function printVerifyResult(result: Awaited<ReturnType<typeof verifyBag>>, quiet: boolean): void {
  if (quiet) {
    console.log(result.valid ? 'VALID' : 'INVALID');
    return;
  }

  console.log(`BagIt Verification: ${result.valid ? 'VALID' : 'INVALID'}`);
  console.log('');
  console.log(`  Bag path:        ${result.bagPath}`);
  console.log(`  Algorithm:       ${result.algorithm}`);
  console.log(`  Total files:     ${result.totalFiles}`);
  console.log(`  Verified files:  ${result.verifiedFiles}`);
  console.log(`  Duration:        ${formatDuration(result.durationMs)}`);
  console.log('');
  console.log(`  Payload valid:   ${result.payloadValid ? 'Yes' : 'No'}`);
  console.log(`  Tag files valid: ${result.tagFilesValid ? 'Yes' : 'No'}`);
  console.log(`  Oxum matches:    ${result.payloadOxumMatch ? 'Yes' : 'No'}`);

  if (result.missingFiles.length > 0) {
    console.log('');
    console.log(`Missing files (${result.missingFiles.length}):`);
    result.missingFiles.slice(0, 10).forEach(f => console.log(`  - ${f}`));
    if (result.missingFiles.length > 10) {
      console.log(`  ... and ${result.missingFiles.length - 10} more`);
    }
  }

  if (result.invalidFiles.length > 0) {
    console.log('');
    console.log(`Invalid files (${result.invalidFiles.length}):`);
    result.invalidFiles.slice(0, 10).forEach(f => {
      console.log(`  - ${f.path}`);
      console.log(`    expected: ${f.expected}`);
      console.log(`    actual:   ${f.actual}`);
    });
    if (result.invalidFiles.length > 10) {
      console.log(`  ... and ${result.invalidFiles.length - 10} more`);
    }
  }

  if (result.extraFiles.length > 0) {
    console.log('');
    console.log(`Extra files not in manifest (${result.extraFiles.length}):`);
    result.extraFiles.slice(0, 10).forEach(f => console.log(`  - ${f}`));
    if (result.extraFiles.length > 10) {
      console.log(`  ... and ${result.extraFiles.length - 10} more`);
    }
  }

  if (result.errors.length > 0) {
    console.log('');
    console.log(`Errors (${result.errors.length}):`);
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  console.log('');
  console.log(`Result: ${result.valid ? 'PASS' : 'FAIL'}`);
}
