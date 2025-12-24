/**
 * Wake-n-Blake CLI
 * Command router and main entry point
 */

import { Command } from 'commander';
import { hashCommand } from './commands/hash.js';
import { verifyCommand } from './commands/verify.js';
import { idCommand } from './commands/id.js';
import { uuidCommand } from './commands/uuid.js';
import { ulidCommand } from './commands/ulid.js';
import { diagnoseCommand } from './commands/diagnose.js';
import { manifestCommand, checkCommand, auditCommand, diffCommand } from './commands/manifest.js';
import { copyCommand } from './commands/copy.js';
import { importCommand } from './commands/import.js';
import { dedupCommand } from './commands/dedup.js';
import { renameCommand } from './commands/rename.js';
import { fastCommand } from './commands/fast.js';
import { sidecarCommand } from './commands/sidecar.js';
import { deviceCommand } from './commands/device.js';
import { metaCommand } from './commands/meta.js';
import { bagitCommand } from './commands/bagit.js';
import { gpsCommand } from './commands/gps.js';
import { phashCommand } from './commands/phash.js';
import { mhlCommand } from './commands/mhl.js';
import { analyzeCommand } from './commands/analyze.js';

const VERSION = '0.1.1';

export function createCli(): Command {
  const program = new Command();

  program
    .name('wnb')
    .description('Wake-n-Blake: Universal BLAKE3 hashing, verification, and ID generation')
    .version(VERSION);

  // Core commands
  program.addCommand(hashCommand);
  program.addCommand(verifyCommand);
  program.addCommand(copyCommand);
  program.addCommand(importCommand);
  program.addCommand(fastCommand);

  // ID generation
  program.addCommand(idCommand);
  program.addCommand(uuidCommand);
  program.addCommand(ulidCommand);

  // Manifest operations
  program.addCommand(manifestCommand);
  program.addCommand(checkCommand);
  program.addCommand(auditCommand);
  program.addCommand(diffCommand);

  // Utilities
  program.addCommand(dedupCommand);
  program.addCommand(renameCommand);
  program.addCommand(diagnoseCommand);

  // XMP and device operations
  program.addCommand(sidecarCommand);
  program.addCommand(deviceCommand);
  program.addCommand(metaCommand);

  // Archival & Post-production
  program.addCommand(bagitCommand);
  program.addCommand(mhlCommand);

  // GPS utilities
  program.addCommand(gpsCommand);

  // Perceptual hashing
  program.addCommand(phashCommand);

  // File analysis
  program.addCommand(analyzeCommand);

  return program;
}

export async function run(): Promise<void> {
  const program = createCli();
  await program.parseAsync(process.argv);
}
