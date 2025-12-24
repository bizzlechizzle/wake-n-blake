# Wake-n-Blake Developer Guide

A comprehensive guide for developers working on or with Wake-n-Blake.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Core Concepts](#core-concepts)
4. [Using as a Library](#using-as-a-library)
5. [CLI Development](#cli-development)
6. [Testing](#testing)
7. [Adding New Features](#adding-new-features)
8. [Release Process](#release-process)

---

## Architecture Overview

Wake-n-Blake is built with a clean separation between:

```
┌─────────────────────────────────────────────────────────┐
│                         CLI                              │
│  (bin/wnb.js → src/cli/commands/*.ts)                   │
├─────────────────────────────────────────────────────────┤
│                     Services Layer                       │
│  importer.ts │ scanner.ts │ deduplicator.ts │ device/*  │
├─────────────────────────────────────────────────────────┤
│                      Core Layer                          │
│  hasher.ts │ copier.ts │ id-generator.ts │ fast-hasher  │
├─────────────────────────────────────────────────────────┤
│                     Schemas (Zod)                        │
│  schemas/index.ts - Type definitions & validation        │
└─────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Library-First**: Core functions are exported for programmatic use
2. **Streaming**: Large files processed via streams, not memory buffers
3. **Network-Resilient**: Adaptive buffering, retries, and checkpointing
4. **Platform-Agnostic**: Device detection abstracted per platform

---

## Project Structure

```
wake-n-blake/
├── bin/
│   └── wnb.js              # CLI entry point
├── src/
│   ├── index.ts            # Library exports (public API)
│   ├── cli/
│   │   ├── index.ts        # CLI router
│   │   ├── output.ts       # Output formatters
│   │   └── commands/       # Individual commands
│   │       ├── hash.ts
│   │       ├── verify.ts
│   │       ├── import.ts
│   │       └── ...
│   ├── core/
│   │   ├── hasher.ts       # Multi-algorithm hashing
│   │   ├── copier.ts       # Network-safe copy
│   │   ├── id-generator.ts # UUID, ULID, BLAKE3 IDs
│   │   ├── fast-hasher.ts  # Sampling-based fast hash
│   │   └── constants.ts    # Buffer sizes, retries
│   ├── services/
│   │   ├── importer.ts     # Full import pipeline
│   │   ├── scanner.ts      # Directory scanning
│   │   ├── deduplicator.ts # Deduplication logic
│   │   ├── device/         # Platform device detection
│   │   ├── xmp/            # XMP sidecar read/write
│   │   ├── metadata/       # Media metadata extraction
│   │   ├── file-type/      # File type detection
│   │   └── related-files/  # Live Photo/RAW grouping
│   ├── schemas/
│   │   └── index.ts        # Zod schemas & types
│   └── utils/
│       ├── network.ts      # Network path detection
│       └── ignore.ts       # .wnbignore handling
├── tests/
│   ├── unit/               # Unit tests
│   └── integration/        # Integration tests
├── VERSION                 # Semantic version
├── CLAUDE.md              # Universal dev standards
├── techguide.md           # Project-specific details
└── AUDIT.md               # Audit findings & remediation
```

---

## Core Concepts

### BLAKE3 Hash Truncation

Wake-n-Blake uses 16-character truncated BLAKE3 hashes by default:

```typescript
// Full BLAKE3: 64 hex chars (256 bits)
const fullHash = 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262';

// Truncated: 16 hex chars (64 bits)
const shortHash = 'af1349b9f5f9a1a6';
```

**Why 16 chars?**
- 64 bits provides 1-in-18-quintillion collision probability
- More ergonomic for filenames and UIs
- Still cryptographically derived (not a different algorithm)

### Network-Safe Copy

The copier detects network paths and adjusts:

```typescript
// Local: 64KB buffer, 8 concurrent streams
// Network: 256KB buffer, 4 concurrent streams, retries

const result = await copyWithHash(src, dest, {
  algorithm: 'blake3',
  verify: true,     // Re-hash destination after copy
  retries: 3        // Auto-retry on network errors
});
```

### XMP Sidecar System

Each imported file can have an `.xmp` sidecar:

```xml
<wnb:ContentHash>af1349b9f5f9a1a6</wnb:ContentHash>
<wnb:SourcePath>/Volumes/SDCARD/DCIM/IMG_001.jpg</wnb:SourcePath>
<wnb:CustodyChain>
  <rdf:Seq>
    <rdf:li>
      <wnb:EventAction>ingestion</wnb:EventAction>
      <wnb:EventTimestamp>2024-01-15T10:30:00Z</wnb:EventTimestamp>
    </rdf:li>
  </rdf:Seq>
</wnb:CustodyChain>
```

Sidecars enable:
- Provenance tracking
- Chain of custody (PREMIS-aligned)
- Device fingerprinting
- Metadata preservation

---

## Using as a Library

### Installation

```bash
npm install wake-n-blake
```

### Basic Usage

```typescript
import {
  hashFile,
  generateBlake3Id,
  copyWithHash,
  runImport
} from 'wake-n-blake';

// Hash a file
const result = await hashFile('/path/to/file', 'blake3');
console.log(result.hash); // '1234567890abcdef'

// Generate IDs
const id = generateBlake3Id();     // BLAKE3-based 16-char ID
const uuid = generateUuid('v4');    // UUID v4
const ulid = generateULID();        // ULID

// Copy with verification
const copy = await copyWithHash('/src', '/dest', {
  verify: true,
  algorithm: 'blake3'
});

// Run full import pipeline
const session = await runImport('/source', '/destination', {
  dedup: true,
  sidecar: true,
  detectDevice: true,
  onProgress: (s) => console.log(s.status)
});
```

### Available Exports

```typescript
// Hashing
import { hashFile, hashBuffer, hashString, verifyFile } from 'wake-n-blake';

// ID Generation
import {
  generateBlake3Id, generateUuid, generateULID,
  generateUuidV1, generateUuidV4, generateUuidV5, generateUuidV7
} from 'wake-n-blake';

// File Operations
import { copyWithHash, fastHash, fastHashBatch } from 'wake-n-blake';

// Import Pipeline
import { runImport, getImportStatus } from 'wake-n-blake';

// XMP Sidecars
import {
  writeSidecar, readSidecar, verifySidecar,
  generateXmpContent, parseSidecarContent
} from 'wake-n-blake';

// Device Detection
import {
  detectSourceDevice, getRemovableVolumes,
  isRemovableMedia, formatDeviceInfo
} from 'wake-n-blake';

// Schemas & Types
import {
  Blake3HashSchema, ManifestSchema,
  type HashResult, type ImportSession
} from 'wake-n-blake';
```

---

## CLI Development

### Adding a New Command

1. **Create command file**:

```typescript
// src/cli/commands/mycommand.ts
import { Command } from 'commander';
import { myService } from '../../services/myservice.js';

export const myCommand = new Command('mycommand')
  .description('Do something useful')
  .argument('<input>', 'Input path')
  .option('-f, --format <fmt>', 'Output format', 'text')
  .action(async (input, options) => {
    try {
      const result = await myService(input, options);

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatResult(result));
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
```

2. **Register in CLI**:

```typescript
// src/cli/index.ts
import { myCommand } from './commands/mycommand.js';

program.addCommand(myCommand);
```

3. **Add tests**:

```typescript
// tests/unit/mycommand.test.ts
describe('mycommand', () => {
  it('should do the thing', async () => {
    // ...
  });
});
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error / hash mismatch |
| 2 | File not found |
| 3 | Invalid input |
| 4 | Partial failure (some files errored) |
| 5 | Aborted by user |

---

## Testing

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm test -- --watch

# Specific file
npm test -- tests/unit/hasher.test.ts

# With coverage
npm test -- --coverage
```

### Test Structure

```
tests/
├── unit/                    # Fast, isolated tests
│   ├── hasher.test.ts        # Hash algorithms
│   ├── id-generator.test.ts  # UUID, ULID, BLAKE3 IDs
│   ├── copier.test.ts        # Copy with hash
│   ├── scanner.test.ts       # Directory scanning
│   ├── deduplicator.test.ts  # Duplicate detection
│   ├── xmp-writer.test.ts    # XMP sidecar generation
│   ├── xmp-reader.test.ts    # XMP sidecar parsing
│   ├── device-detection.test.ts  # Device detection
│   ├── metadata-extraction.test.ts  # EXIF/video metadata
│   └── related-files.test.ts # Live Photo/RAW grouping
└── integration/             # Tests requiring filesystem
    └── import-pipeline.test.ts
```

### Writing Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('MyFeature', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should handle the happy path', async () => {
    const testFile = path.join(tempDir, 'test.txt');
    await fs.writeFile(testFile, 'test content');

    const result = await myFunction(testFile);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should handle errors gracefully', async () => {
    await expect(myFunction('/nonexistent'))
      .rejects.toThrow('File not found');
  });
});
```

---

## Adding New Features

### Adding a New Hash Algorithm

1. **Update schemas**:

```typescript
// src/schemas/index.ts
export const AlgorithmSchema = z.enum([
  'blake3', 'blake3-full', 'sha256', 'sha512',
  'xxhash'  // New algorithm
]);
```

2. **Implement in hasher**:

```typescript
// src/core/hasher.ts
import xxhash from 'xxhash';

export async function hashFile(
  filePath: string,
  algorithm: Algorithm
): Promise<HashResult> {
  switch (algorithm) {
    case 'xxhash':
      return hashWithXXHash(filePath);
    // ... existing cases
  }
}
```

3. **Add tests**:

```typescript
it('should hash with xxhash', async () => {
  const result = await hashFile(testFile, 'xxhash');
  expect(result.hash).toMatch(/^[a-f0-9]{16}$/);
});
```

### Adding a New Metadata Extractor

Wake-n-Blake has 11+ metadata extractors in `src/services/metadata/wrappers/`. Each follows a standard pattern:

1. **Create wrapper file**:

```typescript
// src/services/metadata/wrappers/myformat.ts
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';

const execAsync = promisify(exec);

// Cache tool availability check
let toolAvailable: boolean | null = null;

export interface MyFormatResult {
  format: string;
  someField: string;
  count: number;
  // ... other fields
}

/**
 * Check if the required tool is available
 */
export async function isToolAvailable(): Promise<boolean> {
  if (toolAvailable !== null) return toolAvailable;
  try {
    await execAsync('which mytool');
    toolAvailable = true;
  } catch {
    toolAvailable = false;
  }
  return toolAvailable;
}

/**
 * Extract metadata from file
 * Returns undefined if extraction fails or tool unavailable
 */
export async function extract(filePath: string): Promise<MyFormatResult | undefined> {
  // Check tool availability
  if (!(await isToolAvailable())) return undefined;

  // Check file exists
  try {
    await fs.access(filePath);
  } catch {
    return undefined;
  }

  // Run extraction
  try {
    const { stdout } = await execAsync(`mytool "${filePath}"`);
    return parseOutput(stdout);
  } catch {
    return undefined; // Graceful failure
  }
}

/**
 * Convert result to XMP-compatible key-value pairs
 * All keys must use the wrapper's prefix (e.g., MyFormat_)
 */
export function toRawMetadata(result: MyFormatResult): Record<string, string | number | boolean> {
  return {
    'MyFormat_Format': result.format.toUpperCase(),
    'MyFormat_SomeField': result.someField,
    'MyFormat_Count': result.count,
  };
}
```

2. **Register in metadata index**:

```typescript
// src/services/metadata/index.ts
export * as myformat from './wrappers/myformat.js';
```

3. **Add to FileCategory if needed**:

```typescript
// src/schemas/index.ts
export const FileCategorySchema = z.enum([
  // ... existing
  'myformat',  // Add new category
]);
```

4. **Integrate with importer**:

```typescript
// src/services/importer.ts (in sidecar generation section)
if (useMyFormat && category === 'myformat') {
  const result = await myformat.extract(file.destPath);
  if (result) {
    sidecarData.rawMetadata = {
      ...sidecarData.rawMetadata,
      ...myformat.toRawMetadata(result),
    };
  }
}
```

5. **Add tests**:

```typescript
// tests/unit/myformat.test.ts
import { describe, it, expect } from 'vitest';
import * as myformat from '../../src/services/metadata/wrappers/myformat.js';

describe('MyFormat Extraction', () => {
  describe('isToolAvailable', () => {
    it('should return boolean', async () => {
      const available = await myformat.isToolAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('extract', () => {
    it('should return undefined for non-existent files', async () => {
      const result = await myformat.extract('/nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('toRawMetadata', () => {
    it('should convert to prefixed key-value pairs', () => {
      const result = { format: 'test', someField: 'value', count: 5 };
      const meta = myformat.toRawMetadata(result);
      expect(meta['MyFormat_Format']).toBe('TEST');
    });
  });
});
```

**Key principles:**
- Always cache tool availability checks
- Return `undefined` on failure, never throw
- Use consistent XMP prefix for all keys
- Handle missing tools gracefully

### Adding Device Detection for a New Platform

1. **Create platform detector**:

```typescript
// src/services/device/freebsd.ts
import type { PlatformDeviceDetector } from './types.js';

export function createFreeBSDDetector(): PlatformDeviceDetector {
  return {
    async detectSourceDevice(filePath) {
      // Platform-specific implementation
    },
    async getRemovableVolumes() {
      // ...
    },
    // ... other methods
  };
}
```

2. **Register in index**:

```typescript
// src/services/device/index.ts
case 'freebsd': {
  const { createFreeBSDDetector } = await import('./freebsd.js');
  return createFreeBSDDetector();
}
```

---

## Release Process

### Version Bumping

Per CLAUDE.md spec, use MAJOR.MINOR.PATCH:

```bash
# Read current version
cat VERSION  # 0.1.0

# Bump version (edit VERSION file)
echo "0.1.1" > VERSION

# Update package.json to match
npm version 0.1.1 --no-git-tag-version
```

### Release Checklist

1. [ ] Update VERSION file
2. [ ] Update package.json version
3. [ ] Run full test suite: `npm test`
4. [ ] Build: `npm run build`
5. [ ] Update CHANGELOG.md
6. [ ] Commit: `git commit -am "chore: release v0.1.1"`
7. [ ] Tag: `git tag v0.1.1`
8. [ ] Push: `git push && git push --tags`

### Changelog Format

```markdown
## [0.1.1] - 2024-01-15

### Added
- New feature description

### Changed
- Changed behavior description

### Fixed
- Bug fix description
```

---

## Performance Optimizations

Wake-n-Blake has been optimized for import performance with large file batches. Key optimizations:

### Phase 1: O(1) Related Files Lookup

**Problem**: `findRelatedFiles()` was called inside a loop, causing O(n²) complexity.

**Solution**: Build a Map upfront for O(1) lookups:

```typescript
// Before: O(n²)
for (const file of files) {
  const groups = await findRelatedFiles([file.path, ...otherPaths]);
}

// After: O(n) - build once, lookup O(1)
const allPaths = session.files.map(f => f.path);
const relatedGroups = await findRelatedFiles(allPaths);
const fileToGroup = new Map<string, RelatedFileGroup>();
for (const group of relatedGroups) {
  for (const filePath of group.allFiles) {
    fileToGroup.set(filePath, group);
  }
}
// Inside loop: const group = fileToGroup.get(file.path);
```

**Location**: `src/services/importer.ts:174-189`

### Phase 2: Batch Companion Sidecar Discovery

**Problem**: Each file triggered a separate `fs.readdir()` for sidecar detection.

**Solution**: Read each directory only once and cache results:

```typescript
export async function batchFindCompanionSidecars(
  filePaths: string[]
): Promise<Map<string, string[]>> {
  const dirCache = new Map<string, string[]>();  // Read each dir once

  for (const filePath of filePaths) {
    const dir = path.dirname(filePath);
    if (!dirCache.has(dir)) {
      dirCache.set(dir, await fs.readdir(dir));
    }
    // Check cache for sidecars
  }
  return result;
}
```

**Location**: `src/services/metadata/wrappers/exiftool.ts:85-130`

### Phase 3: Parallel Metadata Extraction

**Problem**: Sequential metadata extraction didn't leverage ExifTool's parallelism.

**Solution**: Process files in parallel batches matching ExifTool's maxProcs (4):

```typescript
const METADATA_BATCH_SIZE = 4;  // Match exiftool-vendored maxProcs

for (let i = 0; i < filesToExtract.length; i += METADATA_BATCH_SIZE) {
  const batch = filesToExtract.slice(i, i + METADATA_BATCH_SIZE);
  const results = await Promise.allSettled(
    batch.map(async (file) => {
      const meta = await extractMetadata(file.destPath!);
      return { file, meta };
    })
  );
  // Handle results...
}
```

**Location**: `src/services/importer.ts:324-362`

### Phase 4: File Copy Optimization (Skipped)

Disk I/O bound - Phase 2's batch directory reads provide the main benefit.

### Phase 5: XMP Regex Caching

**Problem**: ~150 regex patterns compiled per XMP sidecar file.

**Solution**: Cache compiled regexes at module level:

```typescript
const tagRegexCache = new Map<string, RegExp>();

function getTagRegex(tagName: string): RegExp {
  let regex = tagRegexCache.get(tagName);
  if (!regex) {
    regex = new RegExp(`<wnb:${tagName}>([^<]*)</wnb:${tagName}>`);
    tagRegexCache.set(tagName, regex);
  }
  return regex;
}
```

**Location**: `src/services/xmp/reader.ts:8-17`

### Phase 6: Pre-Parsed Paths

**Problem**: `path.basename()` and `path.extname()` called repeatedly per file.

**Solution**: Parse once and store results:

```typescript
interface ParsedPath {
  full: string;
  dir: string;
  base: string;
  ext: string;
  baseLower: string;
}

const parsedPaths = new Map<string, ParsedPath>();
for (const file of files) {
  parsedPaths.set(file, parsePath(file));
}
```

**Location**: `src/services/related-files/index.ts:15-44`

### Phase 7: Pre-Compiled Camera Patterns

**Problem**: Glob patterns evaluated at match time for each file.

**Solution**: Compile minimatch patterns at database load:

```typescript
private compilePattern(pattern: string): (str: string) => boolean {
  if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
    const mm = new minimatch.Minimatch(pattern, { nocase: true });
    return (str: string) => mm.match(str);
  }
  const lowerPattern = pattern.toLowerCase();
  return (str: string) => str.toLowerCase().includes(lowerPattern);
}
```

**Location**: `src/services/device/camera-fingerprint.ts:95-105`

### Phase 8: Tool Availability Caching

**Problem**: Shell commands to check tool availability repeated per file.

**Solution**: Already cached at module level. Verified working.

**Location**: `src/services/metadata/wrappers/exiftool.ts:21`

### HDR/SDR Detection Map Lookup

**Problem**: `Array.find()` for HDR/SDR matching was O(n).

**Solution**: Use Map for O(1) lookups:

```typescript
// Before: O(n)
const hdrFile = files.find(f => path.basename(f) === hdrName);

// After: O(1)
const basenameToPath = new Map<string, string>();
for (const file of files) {
  basenameToPath.set(path.basename(file), file);
}
const hdrFile = basenameToPath.get(hdrName);
```

**Location**: `src/services/related-files/index.ts:204-215`

---

## Troubleshooting

### Common Issues

**Build fails with type errors**:
```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

**Tests hang on device detection**:
```bash
# Skip device tests in CI
npm test -- --exclude '**/device*.test.ts'
```

**Native blake3 not found**:
```bash
# b3sum is optional; WASM fallback is used
# To install native (faster):
brew install b3sum  # macOS
```

### Debug Mode

```bash
# Verbose output
DEBUG=wnb:* wnb hash file.txt

# Node debugging
node --inspect bin/wnb.js hash file.txt
```

---

## Resources

- [BLAKE3 Spec](https://github.com/BLAKE3-team/BLAKE3-specs)
- [XMP Spec](https://github.com/adobe/XMP-Toolkit-SDK)
- [PREMIS](https://www.loc.gov/standards/premis/)
- [Zod Documentation](https://zod.dev/)
- [Commander.js](https://github.com/tj/commander.js)
