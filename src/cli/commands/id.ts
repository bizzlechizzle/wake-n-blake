/**
 * wnb id command
 * Generate BLAKE3-based unique identifiers
 */

import { Command } from 'commander';
import { generateBlake3Id, generateBlake3Ids, generateBlake3IdFrom } from '../../core/id-generator.js';
import { formatId, formatIds } from '../output.js';

export const idCommand = new Command('id')
  .description('Generate BLAKE3-based unique identifier (16 hex chars)')
  .option('--full', 'Full 64 hex char ID')
  .option('-n, --count <number>', 'Generate multiple IDs', '1')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .option('--from <input>', 'Generate deterministic ID from input string')
  .action((options) => {
    const count = parseInt(options.count, 10);
    const format = options.format as 'text' | 'json';
    const full = options.full ?? false;

    if (options.from) {
      // Deterministic ID from input
      const id = generateBlake3IdFrom(options.from, { full });
      console.log(formatId(id, format));
    } else if (count === 1) {
      // Single random ID
      const id = generateBlake3Id({ full });
      console.log(formatId(id, format));
    } else {
      // Multiple random IDs
      const ids = generateBlake3Ids(count, { full });
      console.log(formatIds(ids, format));
    }
  });
