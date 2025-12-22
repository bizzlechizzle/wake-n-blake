/**
 * wnb dedup command
 * Find and manage duplicate files by hash
 */

import { Command } from 'commander';
import { findDuplicates, linkDuplicates, deleteDuplicates } from '../../services/deduplicator.js';
import { formatError, formatSize, formatDuration } from '../output.js';

export const dedupCommand = new Command('dedup')
  .description('Find duplicate files by BLAKE3 hash')
  .argument('<dir>', 'Directory to scan')
  .option('-r, --recursive', 'Scan recursively (default: true)', true)
  .option('--min-size <bytes>', 'Minimum file size to consider', '1')
  .option('--action <action>', 'Action: report (default), link, delete', 'report')
  .option('--dry-run', 'Show what would be done without doing it')
  .option('--exclude <pattern...>', 'Patterns to exclude')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .option('-q, --quiet', 'Summary only')
  .action(async (dir: string, options) => {
    try {
      const minSize = parseInt(options.minSize, 10);
      const format = options.format as 'text' | 'json';

      if (!options.quiet) {
        console.error('Scanning for duplicates...');
      }

      const result = await findDuplicates(dir, {
        recursive: options.recursive,
        minSize,
        excludePatterns: options.exclude,
        onProgress: options.quiet ? undefined : (current, total, file) => {
          process.stderr.write(`\r${current}/${total} files...`);
        }
      });

      if (!options.quiet) {
        process.stderr.write('\r' + ' '.repeat(50) + '\r');
      }

      // Handle actions
      if (options.action === 'link' && result.duplicateGroups.length > 0) {
        const linkResult = await linkDuplicates(
          result.duplicateGroups,
          options.dryRun ?? true
        );
        if (format === 'json') {
          console.log(JSON.stringify({ ...result, linkResult }, null, 2));
        } else {
          printDedupResult(result, options.quiet);
          console.log(`\n${options.dryRun ? 'Would link' : 'Linked'}: ${linkResult.linked} files`);
          if (linkResult.errors.length > 0) {
            console.log(`Errors: ${linkResult.errors.length}`);
          }
        }
        return;
      }

      if (options.action === 'delete' && result.duplicateGroups.length > 0) {
        const deleteResult = await deleteDuplicates(
          result.duplicateGroups,
          options.dryRun ?? true
        );
        if (format === 'json') {
          console.log(JSON.stringify({ ...result, deleteResult }, null, 2));
        } else {
          printDedupResult(result, options.quiet);
          console.log(`\n${options.dryRun ? 'Would delete' : 'Deleted'}: ${deleteResult.deleted} files`);
          console.log(`${options.dryRun ? 'Would free' : 'Freed'}: ${formatSize(deleteResult.freedBytes)}`);
          if (deleteResult.errors.length > 0) {
            console.log(`Errors: ${deleteResult.errors.length}`);
          }
        }
        return;
      }

      // Default: report
      if (format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printDedupResult(result, options.quiet);

        if (!options.quiet && result.duplicateGroups.length > 0) {
          console.log('\nDuplicate Groups:');
          for (const group of result.duplicateGroups) {
            console.log(`\n  [${group.hash}] ${formatSize(group.size)} x${group.files.length}`);
            for (const file of group.files) {
              console.log(`    ${file}`);
            }
          }
        }
      }

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

function printDedupResult(result: ReturnType<typeof findDuplicates> extends Promise<infer T> ? T : never, quiet: boolean): void {
  console.log('Dedup Summary:');
  console.log(`  Total files:      ${result.totalFiles}`);
  console.log(`  Unique files:     ${result.uniqueFiles}`);
  console.log(`  Duplicate groups: ${result.duplicateGroups.length}`);
  console.log(`  Duplicate files:  ${result.duplicateCount}`);
  console.log(`  Wasted space:     ${formatSize(result.wastedBytes)}`);
  console.log(`  Time:             ${formatDuration(result.durationMs)}`);
}
