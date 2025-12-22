/**
 * wnb ulid command
 * Generate ULIDs (Universally Unique Lexicographically Sortable Identifiers)
 */

import { Command } from 'commander';
import { generateULID, generateULIDs, parseUlidTimestamp } from '../../core/id-generator.js';
import { formatId, formatIds, formatError } from '../output.js';

export const ulidCommand = new Command('ulid')
  .description('Generate ULID (sortable, 26 chars, URL-safe)')
  .option('-t, --timestamp <iso>', 'Specific timestamp (ISO 8601)')
  .option('-c, --count <number>', 'Generate multiple ULIDs', '1')
  .option('--monotonic', 'Use monotonic mode (guarantees ordering within same ms)')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .option('--decode <ulid>', 'Decode ULID to show timestamp')
  .action((options) => {
    try {
      const format = options.format as 'text' | 'json';

      // Decode mode
      if (options.decode) {
        try {
          const timestamp = parseUlidTimestamp(options.decode);
          if (format === 'json') {
            console.log(JSON.stringify({
              ulid: options.decode,
              timestamp: timestamp.toISOString(),
              unixMs: timestamp.getTime()
            }));
          } else {
            console.log(`ULID:      ${options.decode}`);
            console.log(`Timestamp: ${timestamp.toISOString()}`);
            console.log(`Unix ms:   ${timestamp.getTime()}`);
          }
          return;
        } catch {
          console.error(formatError(`Invalid ULID: ${options.decode}`));
          process.exit(3);
        }
      }

      const count = parseInt(options.count, 10);

      // Parse timestamp if provided
      let timestamp: number | undefined;
      if (options.timestamp) {
        const parsed = new Date(options.timestamp);
        if (isNaN(parsed.getTime())) {
          console.error(formatError(`Invalid timestamp: ${options.timestamp}`));
          process.exit(3);
        }
        timestamp = parsed.getTime();
      }

      if (count === 1) {
        const ulid = generateULID({ timestamp, monotonic: options.monotonic });
        console.log(formatId(ulid, format));
      } else {
        const ulids = generateULIDs(count, { monotonic: options.monotonic ?? true });
        console.log(formatIds(ulids, format));
      }
    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });
