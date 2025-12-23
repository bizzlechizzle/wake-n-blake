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
