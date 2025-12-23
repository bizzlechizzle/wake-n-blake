/**
 * wnb gps command
 * GPS enrichment from reference maps (KML, GPX, GeoJSON)
 */

import { Command } from 'commander';
import * as path from 'node:path';
import { enrichFilesWithGps, collectMediaFiles } from '../../services/gps/index.js';
import { formatError, formatDuration } from '../output.js';
import type { MatchStrategy } from '../../services/gps/schemas.js';

/**
 * wnb gps - GPS utilities
 */
export const gpsCommand = new Command('gps')
  .description('GPS enrichment and utilities');

/**
 * wnb gps enrich - Enrich files with GPS from reference map
 */
const enrichCommand = new Command('enrich')
  .description('Enrich files with GPS coordinates from a reference map')
  .argument('<paths...>', 'Files or directories to enrich')
  .requiredOption('--from <map>', 'GPS reference file (KML, GPX, or GeoJSON)')
  .option('-s, --strategy <strategy>', 'Match strategy: timestamp (default), nearest, interpolate', 'timestamp')
  .option('-t, --tolerance <sec>', 'Time tolerance in seconds (default: 300)', '300')
  .option('--offset <sec>', 'Camera clock offset in seconds (default: 0)', '0')
  .option('-r, --recursive', 'Process directories recursively')
  .option('--overwrite', 'Overwrite existing GPS coordinates')
  .option('--dry-run', 'Show what would be updated without making changes')
  .option('-f, --format <fmt>', 'Output format: text (default), json', 'text')
  .option('-q, --quiet', 'Minimal output')
  .action(async (paths: string[], options) => {
    try {
      const format = options.format as 'text' | 'json';
      const mapPath = path.resolve(options.from);

      // Collect media files
      if (!options.quiet) {
        console.error('Scanning for media files...');
      }

      const files = await collectMediaFiles(paths, options.recursive);

      if (files.length === 0) {
        console.error('No media files found');
        process.exit(1);
      }

      if (!options.quiet) {
        console.error(`Found ${files.length} media files`);
        console.error(`Loading GPS data from ${path.basename(mapPath)}...`);
      }

      // Validate numeric options
      const toleranceSec = parseInt(options.tolerance, 10);
      const timeOffset = parseInt(options.offset, 10);

      if (isNaN(toleranceSec) || toleranceSec < 0 || toleranceSec > 86400) {
        console.error('Error: --tolerance must be 0-86400 seconds');
        process.exit(1);
      }

      if (isNaN(timeOffset) || timeOffset < -86400 || timeOffset > 86400) {
        console.error('Error: --offset must be -86400 to +86400 seconds');
        process.exit(1);
      }

      // Enrich files
      const result = await enrichFilesWithGps(files, mapPath, {
        matchStrategy: options.strategy as MatchStrategy,
        toleranceSec,
        timeOffset,
        recursive: options.recursive,
        overwriteExisting: options.overwrite,
        dryRun: options.dryRun
      });

      if (format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printEnrichResult(result, options.quiet, options.dryRun);
      }

      // Exit with error if no matches
      if (result.filesMatched === 0) {
        process.exit(1);
      }

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * Print enrichment result
 */
function printEnrichResult(
  result: Awaited<ReturnType<typeof enrichFilesWithGps>>,
  quiet: boolean,
  dryRun: boolean
): void {
  if (quiet) {
    console.log(`${result.filesMatched}/${result.filesProcessed} matched`);
    return;
  }

  if (dryRun) {
    console.log('=== DRY RUN - No changes made ===');
    console.log('');
  }

  console.log('GPS Enrichment Summary');
  console.log('');
  console.log(`  Files processed:    ${result.filesProcessed}`);
  console.log(`  Files matched:      ${result.filesMatched}`);
  console.log(`  Files updated:      ${result.filesUpdated}`);
  console.log(`  Files skipped:      ${result.filesSkipped}`);
  console.log(`  Errors:             ${result.errors.length}`);
  console.log(`  Duration:           ${formatDuration(result.durationMs)}`);

  if (result.matches.length > 0) {
    console.log('');
    console.log('Matches:');
    const showCount = Math.min(result.matches.length, 10);
    for (let i = 0; i < showCount; i++) {
      const m = result.matches[i];
      const coords = `${m.waypoint.latitude.toFixed(6)}, ${m.waypoint.longitude.toFixed(6)}`;
      const conf = `${(m.confidence * 100).toFixed(0)}%`;
      const delta = m.timeDelta < 60
        ? `${m.timeDelta.toFixed(0)}s`
        : `${(m.timeDelta / 60).toFixed(1)}min`;
      const name = m.waypoint.name || 'waypoint';

      console.log(`  ${path.basename(m.file)}`);
      console.log(`    → ${coords} (${name})`);
      console.log(`      confidence: ${conf}, time delta: ${delta}`);
    }
    if (result.matches.length > showCount) {
      console.log(`  ... and ${result.matches.length - showCount} more`);
    }
  }

  if (result.unmatched.length > 0 && result.unmatched.length <= 10) {
    console.log('');
    console.log('Unmatched files:');
    result.unmatched.forEach(f => console.log(`  - ${path.basename(f)}`));
  } else if (result.unmatched.length > 10) {
    console.log('');
    console.log(`Unmatched files: ${result.unmatched.length}`);
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
  console.log(`Result: ${result.filesMatched > 0 ? 'SUCCESS' : 'NO MATCHES'}`);
}

// Add subcommands
gpsCommand.addCommand(enrichCommand);

// Default action (show help)
gpsCommand.action(() => {
  gpsCommand.help();
});
