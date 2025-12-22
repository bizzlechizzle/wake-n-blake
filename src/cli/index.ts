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

const VERSION = '0.1.0';

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

  return program;
}

export async function run(): Promise<void> {
  const program = createCli();
  await program.parseAsync(process.argv);
}
