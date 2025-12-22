/**
 * .wnbignore file support
 * Gitignore-style pattern matching for excluding files
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import ignoreModule from 'ignore';
// Handle ESM/CJS interop
const ignore = (ignoreModule as any).default || ignoreModule;
type Ignore = ReturnType<typeof ignore>;

// Default patterns always excluded
const DEFAULT_PATTERNS = [
  '.git/',
  '.svn/',
  '.hg/',
  '.DS_Store',
  'Thumbs.db',
  '*.partial',
  '*.tmp',
  '*.swp',
  '*~',
  'node_modules/',
  '.wnbignore'
];

/**
 * Load .wnbignore patterns from a directory
 * Checks local .wnbignore and global ~/.config/wnb/.wnbignore
 */
export async function loadIgnorePatterns(dir: string): Promise<Ignore> {
  const ig = ignore();

  // Add default patterns
  ig.add(DEFAULT_PATTERNS);

  // Load global ignore file
  const globalIgnorePath = path.join(os.homedir(), '.config', 'wnb', '.wnbignore');
  try {
    const globalPatterns = await fs.readFile(globalIgnorePath, 'utf-8');
    ig.add(parseIgnoreFile(globalPatterns));
  } catch {
    // No global ignore file
  }

  // Load local .wnbignore
  const localIgnorePath = path.join(dir, '.wnbignore');
  try {
    const localPatterns = await fs.readFile(localIgnorePath, 'utf-8');
    ig.add(parseIgnoreFile(localPatterns));
  } catch {
    // No local ignore file
  }

  return ig;
}

/**
 * Parse ignore file content
 * Removes comments and empty lines
 */
function parseIgnoreFile(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

/**
 * Check if a path should be ignored
 */
export function shouldIgnore(ig: Ignore, relativePath: string): boolean {
  return ig.ignores(relativePath);
}

/**
 * Filter an array of paths, removing ignored ones
 */
export function filterIgnored(ig: Ignore, paths: string[], baseDir: string): string[] {
  return paths.filter(p => {
    const relativePath = path.relative(baseDir, p);
    return !ig.ignores(relativePath);
  });
}

/**
 * Create a simple ignore instance from patterns array
 */
export function createIgnore(patterns: string[]): Ignore {
  const ig = ignore();
  ig.add(DEFAULT_PATTERNS);
  ig.add(patterns);
  return ig;
}
