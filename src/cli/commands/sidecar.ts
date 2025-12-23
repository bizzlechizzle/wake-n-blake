/**
 * wnb sidecar command
 * XMP sidecar generation, reading, and verification
 */

import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ulid } from 'ulid';
import { hashBlake3 } from '../../core/hasher.js';
import { formatError, formatSuccess } from '../output.js';
import { detectFileType } from '../../services/file-type/detector.js';
import { generateXmpContent, writeSidecar, calculateSidecarHash } from '../../services/xmp/writer.js';
import { readSidecar, verifySidecar, sidecarExists } from '../../services/xmp/reader.js';
import { detectSourceDevice, getSourceType, formatDeviceInfo } from '../../services/device/index.js';
import type { XmpSidecarData, CustodyEvent } from '../../services/xmp/schema.js';
import { SCHEMA_VERSION } from '../../services/xmp/schema.js';

const VERSION = '0.1.0';

export const sidecarCommand = new Command('sidecar')
  .description('XMP sidecar operations')
  .argument('[files...]', 'Files to process');

/**
 * Generate subcommand - create XMP sidecars
 */
const generateCmd = new Command('generate')
  .alias('gen')
  .description('Generate XMP sidecars for files')
  .argument('<files...>', 'Files to generate sidecars for')
  .option('-f, --force', 'Overwrite existing sidecars')
  .option('-d, --detect-device', 'Detect source device information')
  .option('-s, --session <id>', 'Session ID (auto-generated if not provided)')
  .option('-b, --batch <name>', 'Batch name')
  .option('--source-type <type>', 'Source type override')
  .option('-o, --output <format>', 'Output format: text, json', 'text')
  .action(async (files: string[], options) => {
    try {
      const sessionId = options.session || ulid();
      const results: Array<{ file: string; sidecar?: string; error?: string }> = [];

      for (const file of files) {
        try {
          const absPath = path.resolve(file);

          // Check if sidecar already exists
          if (!options.force && await sidecarExists(absPath)) {
            results.push({ file, error: 'Sidecar already exists (use -f to overwrite)' });
            continue;
          }

          // Generate sidecar data
          const data = await generateSidecarData(absPath, {
            sessionId,
            batchName: options.batch,
            sourceType: options.sourceType,
            detectDevice: options.detectDevice,
          });

          // Write sidecar
          const sidecarPath = await writeSidecar(absPath, data);
          results.push({ file, sidecar: sidecarPath });
        } catch (err) {
          results.push({ file, error: String(err) });
        }
      }

      // Output
      if (options.output === 'json') {
        console.log(JSON.stringify(results, null, 2));
      } else {
        for (const r of results) {
          if (r.error) {
            console.error(formatError(`${r.file}: ${r.error}`));
          } else {
            console.log(formatSuccess(`${r.file} → ${r.sidecar}`));
          }
        }
      }

      const failed = results.filter(r => r.error).length;
      if (failed > 0) process.exit(1);
    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * Read subcommand - parse and display sidecar content
 */
const readCmd = new Command('read')
  .description('Read and display XMP sidecar content')
  .argument('<sidecar>', 'Sidecar file (.xmp) to read')
  .option('-o, --output <format>', 'Output format: text, json, yaml', 'text')
  .option('-s, --section <name>', 'Show only specific section')
  .action(async (sidecarFile: string, options) => {
    try {
      const absPath = path.resolve(sidecarFile);
      const result = await readSidecar(absPath);

      if (options.output === 'json') {
        console.log(JSON.stringify({
          valid: result.isValid,
          hashMatch: result.hashMatch,
          errors: result.errors,
          warnings: result.warnings,
          data: result.data,
        }, null, 2));
      } else {
        printSidecarData(result.data, options.section);

        if (!result.isValid) {
          console.log();
          console.error(formatError('Validation errors:'));
          for (const err of result.errors) {
            console.error(`  - ${err}`);
          }
        }

        if (!result.hashMatch) {
          console.log();
          console.error(formatError('WARNING: Sidecar hash mismatch - file may have been modified'));
        }

        if (result.warnings.length > 0) {
          console.log();
          console.log('Warnings:');
          for (const warn of result.warnings) {
            console.log(`  - ${warn}`);
          }
        }
      }

      if (!result.isValid) process.exit(1);
    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * Verify subcommand - verify sidecar integrity
 */
const verifyCmd = new Command('verify')
  .description('Verify sidecar integrity and optionally content hash')
  .argument('<sidecar>', 'Sidecar file to verify')
  .option('-c, --content', 'Also verify content file hash matches')
  .option('-o, --output <format>', 'Output format: text, json', 'text')
  .action(async (sidecarFile: string, options) => {
    try {
      const absPath = path.resolve(sidecarFile);
      const result = await readSidecar(absPath);

      let contentValid = true;
      let contentHash: string | undefined;

      // Verify content hash if requested
      if (options.content) {
        // Derive content file path (remove .xmp extension)
        const contentPath = absPath.replace(/\.xmp$/, '');

        try {
          contentHash = await hashBlake3(contentPath, { full: true });
          contentValid = contentHash === result.data.contentHash;
        } catch {
          contentValid = false;
          contentHash = 'FILE NOT FOUND';
        }
      }

      const allValid = result.isValid && result.hashMatch && contentValid;

      if (options.output === 'json') {
        console.log(JSON.stringify({
          valid: allValid,
          sidecarValid: result.isValid,
          sidecarHashMatch: result.hashMatch,
          contentHashMatch: options.content ? contentValid : undefined,
          contentHash: options.content ? contentHash : undefined,
          expectedHash: options.content ? result.data.contentHash : undefined,
          errors: result.errors,
        }, null, 2));
      } else {
        console.log(`Sidecar: ${sidecarFile}`);
        console.log(`├── Schema valid: ${result.isValid ? 'YES' : 'NO'}`);
        console.log(`├── Hash match:   ${result.hashMatch ? 'YES' : 'NO'}`);

        if (options.content) {
          console.log(`└── Content hash: ${contentValid ? 'MATCH' : 'MISMATCH'}`);
          if (!contentValid) {
            console.log(`    Expected: ${result.data.contentHash}`);
            console.log(`    Got:      ${contentHash}`);
          }
        } else {
          console.log(`└── Content hash: (use -c to verify)`);
        }

        if (result.errors.length > 0) {
          console.log();
          for (const err of result.errors) {
            console.error(formatError(err));
          }
        }
      }

      if (!allValid) process.exit(1);
    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * Event subcommand - add custody event to sidecar
 */
const eventCmd = new Command('event')
  .description('Add a custody event to a sidecar')
  .argument('<sidecar>', 'Sidecar file to update')
  .requiredOption('-a, --action <action>', 'Event action (fixity_check, migration, etc.)')
  .option('-n, --notes <text>', 'Event notes')
  .option('-o, --outcome <outcome>', 'Event outcome: success, failure, partial', 'success')
  .action(async (sidecarFile: string, options) => {
    try {
      const absPath = path.resolve(sidecarFile);
      const result = await readSidecar(absPath);

      if (!result.isValid) {
        console.error(formatError('Cannot add event to invalid sidecar'));
        process.exit(1);
      }

      // Create new event
      const event: CustodyEvent = {
        eventId: ulid(),
        eventTimestamp: new Date().toISOString(),
        eventAction: options.action,
        eventOutcome: options.outcome,
        eventHost: os.hostname(),
        eventUser: os.userInfo().username,
        eventTool: `wake-n-blake/${VERSION}`,
        eventNotes: options.notes,
      };

      // If it's a fixity check, compute and record the current hash
      if (options.action === 'fixity_check') {
        const contentPath = absPath.replace(/\.xmp$/, '');
        try {
          const hash = await hashBlake3(contentPath, { full: true });
          event.eventHash = hash;
          event.eventHashAlgorithm = 'blake3';
          event.eventOutcome = hash === result.data.contentHash ? 'success' : 'failure';
        } catch (err) {
          event.eventOutcome = 'failure';
          event.eventNotes = `${event.eventNotes || ''} Hash verification failed: ${err}`.trim();
        }
      }

      // Update sidecar data
      const updatedData: XmpSidecarData = {
        ...result.data,
        sidecarUpdated: new Date().toISOString(),
        custodyChain: [...result.data.custodyChain, event],
        eventCount: result.data.eventCount + 1,
      };

      // Write updated sidecar
      await writeSidecar(absPath.replace(/\.xmp$/, ''), updatedData);

      console.log(formatSuccess(`Event added: ${event.eventAction} (${event.eventOutcome})`));
    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

// Add subcommands
sidecarCommand.addCommand(generateCmd);
sidecarCommand.addCommand(readCmd);
sidecarCommand.addCommand(verifyCmd);
sidecarCommand.addCommand(eventCmd);

// Default action (no subcommand) - show help
sidecarCommand.action(() => {
  sidecarCommand.help();
});

/**
 * Generate sidecar data for a file
 */
async function generateSidecarData(
  filePath: string,
  options: {
    sessionId: string;
    batchName?: string;
    sourceType?: string;
    detectDevice?: boolean;
  }
): Promise<XmpSidecarData> {
  const now = new Date().toISOString();
  const stat = await fs.stat(filePath);

  // Hash the file (full 64-char hash for content integrity)
  const contentHash = await hashBlake3(filePath, { full: true });

  // Detect file type
  const fileType = await detectFileType(filePath);

  // Detect source device if requested
  let sourceDevice;
  let sourceType = options.sourceType || 'local_disk';

  if (options.detectDevice) {
    const detection = await detectSourceDevice(filePath);
    if (detection.found && detection.device) {
      sourceDevice = detection.device;
      sourceType = getSourceType(detection.chain);
    }
  }

  // Create initial custody event
  const initialEvent: CustodyEvent = {
    eventId: ulid(),
    eventTimestamp: now,
    eventAction: 'message_digest_calculation',
    eventOutcome: 'success',
    eventHost: os.hostname(),
    eventUser: os.userInfo().username,
    eventTool: `wake-n-blake/${VERSION}`,
    eventHash: contentHash,
    eventHashAlgorithm: 'blake3',
  };

  const data: XmpSidecarData = {
    schemaVersion: SCHEMA_VERSION,
    sidecarCreated: now,
    sidecarUpdated: now,

    contentHash,
    hashAlgorithm: 'blake3',
    fileSize: stat.size,
    verified: true,

    fileCategory: fileType.category,
    fileSubcategory: fileType.subcategory,
    detectedMimeType: fileType.mimeType,
    declaredExtension: fileType.declaredExtension,
    extensionMismatch: fileType.extensionMismatch,

    sourcePath: filePath,
    sourceFilename: path.basename(filePath),
    sourceHost: os.hostname(),
    sourceType: sourceType as any,
    sourceDevice,

    originalMtime: stat.mtime.toISOString(),
    originalCtime: stat.ctime.toISOString(),
    originalBtime: stat.birthtime.toISOString(),

    importTimestamp: now,
    sessionId: options.sessionId,
    toolVersion: VERSION,
    importUser: os.userInfo().username,
    importHost: os.hostname(),
    importPlatform: process.platform as 'darwin' | 'linux' | 'win32',

    batchName: options.batchName,

    custodyChain: [initialEvent],
    firstSeen: now,
    eventCount: 1,
  };

  return data;
}

/**
 * Print sidecar data in text format
 */
function printSidecarData(data: XmpSidecarData, section?: string): void {
  const printSection = (name: string, fn: () => void) => {
    if (!section || section.toLowerCase() === name.toLowerCase()) {
      fn();
    }
  };

  printSection('identity', () => {
    console.log('Core Identity');
    console.log(`├── Hash:      ${data.contentHash}`);
    console.log(`├── Algorithm: ${data.hashAlgorithm}`);
    console.log(`├── Size:      ${formatBytes(data.fileSize)}`);
    console.log(`└── Verified:  ${data.verified ? 'Yes' : 'No'}`);
    console.log();
  });

  printSection('classification', () => {
    console.log('Classification');
    console.log(`├── Category:    ${data.fileCategory}${data.fileSubcategory ? ` (${data.fileSubcategory})` : ''}`);
    console.log(`├── MIME Type:   ${data.detectedMimeType}`);
    console.log(`├── Extension:   ${data.declaredExtension}`);
    if (data.extensionMismatch) {
      console.log(`└── MISMATCH:    Expected ${data.declaredExtension}, detected different type`);
    }
    console.log();
  });

  printSection('provenance', () => {
    console.log('Source Provenance');
    console.log(`├── Path:     ${data.sourcePath}`);
    console.log(`├── Filename: ${data.sourceFilename}`);
    console.log(`├── Host:     ${data.sourceHost}`);
    console.log(`└── Type:     ${data.sourceType}`);
    console.log();
  });

  if (data.sourceDevice) {
    printSection('device', () => {
      console.log('Source Device');
      console.log(formatDeviceInfo(data.sourceDevice!).split('\n').map(l => `  ${l}`).join('\n'));
      console.log();
    });
  }

  printSection('timestamps', () => {
    console.log('Timestamps');
    console.log(`├── Original mtime: ${data.originalMtime}`);
    if (data.originalCtime) console.log(`├── Original ctime: ${data.originalCtime}`);
    if (data.originalBtime) console.log(`├── Original btime: ${data.originalBtime}`);
    console.log(`└── Import time:    ${data.importTimestamp}`);
    console.log();
  });

  printSection('custody', () => {
    console.log('Chain of Custody');
    console.log(`├── First seen: ${data.firstSeen}`);
    console.log(`├── Events:     ${data.eventCount}`);
    for (let i = 0; i < data.custodyChain.length; i++) {
      const event = data.custodyChain[i];
      const prefix = i === data.custodyChain.length - 1 ? '└──' : '├──';
      console.log(`${prefix} [${event.eventTimestamp}] ${event.eventAction} → ${event.eventOutcome}`);
      if (event.eventNotes) {
        console.log(`    Notes: ${event.eventNotes}`);
      }
    }
    console.log();
  });
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}
