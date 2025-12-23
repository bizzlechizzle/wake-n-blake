#!/usr/bin/env node
import { runCli } from '../dist/index.js';

// Run CLI
runCli().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
