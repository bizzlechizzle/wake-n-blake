/**
 * Wake-n-Blake
 * Universal BLAKE3 hashing, verification, and ID generation CLI
 */

import { run } from './cli/index.js';

// Run CLI
run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
