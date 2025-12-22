/**
 * wnb uuid command
 * Generate UUIDs for external system compatibility
 */

import { Command } from 'commander';
import { generateUuid, generateUuids, UUID_NAMESPACES, type NamespaceType } from '../../core/id-generator.js';
import { formatId, formatIds, formatError } from '../output.js';

export const uuidCommand = new Command('uuid')
  .description('Generate UUID (for external system compatibility)')
  .option('-v, --version <ver>', 'UUID version: 1, 4 (default), 5, 7', '4')
  .option('-n, --namespace <ns>', 'Namespace for v5: dns, url, oid, x500, or custom UUID')
  .option('--name <name>', 'Name string for v5')
  .option('-c, --count <number>', 'Generate multiple UUIDs', '1')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .action((options) => {
    try {
      const version = parseInt(options.version, 10) as 1 | 4 | 5 | 7;
      const count = parseInt(options.count, 10);
      const format = options.format as 'text' | 'json';

      // Validate version
      if (![1, 4, 5, 7].includes(version)) {
        console.error(formatError(`Invalid UUID version: ${options.version}. Use 1, 4, 5, or 7`));
        process.exit(3);
      }

      // UUID v5 requires name
      if (version === 5 && !options.name) {
        console.error(formatError('UUID v5 requires --name'));
        process.exit(3);
      }

      // Resolve namespace
      let namespace: NamespaceType | string | undefined;
      if (options.namespace) {
        if (options.namespace in UUID_NAMESPACES) {
          namespace = options.namespace as NamespaceType;
        } else {
          // Assume it's a custom UUID namespace
          namespace = options.namespace;
        }
      }

      if (count === 1) {
        const uuid = generateUuid(version, { name: options.name, namespace });
        console.log(formatId(uuid, format));
      } else {
        const uuids = generateUuids(count, version, { name: options.name, namespace });
        console.log(formatIds(uuids, format));
      }
    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });
