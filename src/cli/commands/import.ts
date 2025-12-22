/**
 * wnb import command
 * Full import pipeline with deduplication and resume
 */

import { Command } from 'commander';
import { runImport, getImportStatus } from '../../services/importer.js';
import { formatError, formatSize, formatDuration } from '../output.js';

export const importCommand = new Command('import')
  .description('Import files with hashing, deduplication, and verification')
  .argument('<source>', 'Source directory')
  .argument('<destination>', 'Destination directory')
  .option('--dry-run', 'Show what would happen without copying')
  .option('--resume', 'Resume from last checkpoint')
  .option('--dedup', 'Skip files that already exist by hash')
  .option('--manifest', 'Generate manifest after import')
  .option('--no-verify', 'Skip post-copy verification')
  .option('--exclude <pattern...>', 'Patterns to exclude')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .option('-q, --quiet', 'Minimal output')
  .action(async (source: string, destination: string, options) => {
    try {
      const format = options.format as 'text' | 'json';
      const startTime = performance.now();

      // Check for existing session
      if (options.resume) {
        const existing = await getImportStatus(destination);
        if (existing) {
          console.error(`Resuming session ${existing.id}`);
          console.error(`  Progress: ${existing.processedFiles}/${existing.totalFiles} files`);
        }
      }

      if (!options.quiet) {
        console.error('Starting import...');
      }

      let lastStatus = '';

      const session = await runImport(source, destination, {
        dedup: options.dedup,
        manifest: options.manifest,
        resume: options.resume,
        dryRun: options.dryRun,
        verify: options.verify,
        excludePatterns: options.exclude,
        onProgress: (s) => {
          if (!options.quiet && s.status !== lastStatus) {
            lastStatus = s.status;
            const statusLabels: Record<string, string> = {
              scanning: 'Scanning files...',
              hashing: 'Hashing source files...',
              copying: 'Copying files...',
              validating: 'Validating copies...',
              'generating-manifest': 'Generating manifest...',
              completed: 'Import complete!',
              failed: 'Import failed!'
            };
            console.error(`\n${statusLabels[s.status] || s.status}`);
          }
        },
        onFile: (file, action) => {
          if (options.quiet) return;

          switch (action) {
            case 'hashed':
              process.stderr.write(`\rHashed: ${file.relativePath.slice(0, 50)}`);
              break;
            case 'copied':
            case 'would-copy':
              process.stderr.write('\r' + ' '.repeat(60) + '\r');
              console.log(`${options.dryRun ? 'Would copy' : 'Copied'}: ${file.relativePath}`);
              break;
            case 'skip-duplicate':
              console.log(`Skip (dup): ${file.relativePath}`);
              break;
            case 'validated':
              // Silent on success
              break;
            case 'validation-failed':
            case 'error':
              console.error(`ERROR: ${file.relativePath}: ${file.error}`);
              break;
          }
        }
      });

      const duration = performance.now() - startTime;

      if (!options.quiet) {
        process.stderr.write('\r' + ' '.repeat(60) + '\r');
      }

      // Output results
      if (format === 'json') {
        console.log(JSON.stringify({
          ...session,
          files: undefined, // Don't include full file list in JSON output
          durationMs: duration
        }, null, 2));
      } else {
        console.log('\n========== Import Summary ==========');
        console.log(`Session ID:    ${session.id}`);
        console.log(`Source:        ${session.source}`);
        console.log(`Destination:   ${session.destination}`);
        console.log(`Status:        ${session.status.toUpperCase()}`);
        console.log('');
        console.log(`Total files:   ${session.totalFiles}`);
        console.log(`Processed:     ${session.processedFiles}`);
        console.log(`Duplicates:    ${session.duplicateFiles}`);
        console.log(`Errors:        ${session.errorFiles}`);
        console.log('');
        console.log(`Total size:    ${formatSize(session.totalBytes)}`);
        console.log(`Copied:        ${formatSize(session.processedBytes)}`);
        console.log(`Duration:      ${formatDuration(duration)}`);

        if (session.processedBytes > 0 && duration > 0) {
          const speed = (session.processedBytes / (duration / 1000));
          console.log(`Speed:         ${formatSize(speed)}/s`);
        }

        if (options.dryRun) {
          console.log('\n(Dry run - no files were copied)');
        }

        if (session.errorFiles > 0) {
          console.log(`\nWarning: ${session.errorFiles} files had errors`);
        }
      }

      // Exit code based on result
      if (session.status === 'failed') {
        process.exit(1);
      }
      if (session.errorFiles > 0) {
        process.exit(4);
      }

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });
