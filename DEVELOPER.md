# Wake-n-Blake Developer Guide

Complete guide for developers using wake-n-blake as a library or contributing to the project.

## Table of Contents

1. [Architecture](#architecture)
2. [Library API](#library-api)
3. [Core Modules](#core-modules)
4. [Services](#services)
5. [Testing](#testing)
6. [Contributing](#contributing)

---

## Architecture

```
wake-n-blake/
├── src/
│   ├── core/           # Core hashing and file operations
│   │   ├── hasher.ts   # Multi-algorithm hashing
│   │   ├── copier.ts   # Copy with verification
│   │   ├── fast-hasher.ts  # Sample-based hashing
│   │   └── id-generator.ts # ID generation (BLAKE3, UUID, ULID)
│   ├── services/       # Business logic services
│   │   ├── mhl/        # Media Hash List (post-production)
│   │   ├── bagit/      # BagIt RFC 8493 (archival)
│   │   ├── gps/        # GPS enrichment (KML/GPX/GeoJSON)
│   │   ├── phash/      # Perceptual hashing
│   │   ├── xmp/        # XMP sidecar generation
│   │   ├── device/     # Device detection
│   │   ├── metadata/   # EXIF/video/audio extraction
│   │   └── importer.ts # Import pipeline
│   ├── cli/            # CLI commands
│   ├── schemas/        # Zod validation schemas
│   └── utils/          # Utilities (network, ignore patterns)
├── tests/
│   ├── unit/           # Unit tests
│   └── integration/    # Integration tests
└── bin/
    └── wnb.js          # CLI entry point
```

### Key Design Principles

1. **Library-first**: All functionality available for programmatic use
2. **Network-aware**: Automatic buffer sizing for SMB/NFS
3. **Streaming**: Large files processed without loading into memory
4. **Native-first**: Use native binaries when available (b3sum)
5. **Type-safe**: Full TypeScript with Zod validation

---

## Library API

### Installation

```bash
npm install wake-n-blake
```

### Quick Start

```typescript
import {
  hashFile,
  hashBlake3,
  generateBlake3Id,
  createBag,
  generateMhl,
  computePhash
} from 'wake-n-blake';

// Hash a file
const result = await hashFile('/path/to/file.mov', 'blake3');
console.log(result.hash); // "abc123def4567890"

// Generate unique ID
const id = generateBlake3Id();
console.log(id); // "7f8a9b0c1d2e3f4a"

// Create archival package
const bag = await createBag('/path/to/folder');
console.log(bag.payloadOxum); // "12345678.42"

// Generate MHL for post-production
const mhl = await generateMhl('/path/to/footage');
console.log(mhl.hashes.length); // 150
```

---

## Core Modules

### Hasher (`src/core/hasher.ts`)

Multi-algorithm file hashing with native BLAKE3 support.

```typescript
import {
  hashFile,
  hashBlake3,
  hashSha256,
  hashSha512,
  hashMd5,
  hashXxhash64,
  hashFileAll,
  verifyFile,
  setHasherMode
} from 'wake-n-blake';

// Hash with specific algorithm
const result = await hashFile('/path/to/file', 'blake3');
// Returns: { path, hash, algorithm, size, durationMs }

// BLAKE3 with options
const hash = await hashBlake3('/path/to/file', { full: true }); // 64-char
const hash = await hashBlake3('/path/to/file', { forceWasm: true }); // WASM only

// All algorithms at once (single file read)
const all = await hashFileAll('/path/to/file');
// Returns: { blake3, 'blake3-full', sha256, sha512, md5, xxhash64, size, durationMs }

// Verify file integrity
const verify = await verifyFile('/path/to/file', 'abc123def456', 'blake3');
// Returns: { match: true, actual: '...', algorithm: 'blake3' }

// Force native/WASM mode
setHasherMode('native'); // Fail if b3sum not available
setHasherMode('wasm');   // Skip native detection
setHasherMode('auto');   // Default: try native, fallback to WASM
```

### ID Generator (`src/core/id-generator.ts`)

Generate unique identifiers with various formats.

```typescript
import {
  generateBlake3Id,
  generateBlake3Ids,
  generateBlake3IdFrom,
  generateUuid,
  generateUuidV7,
  generateULID,
  parseUlidTimestamp,
  id // Shorthand
} from 'wake-n-blake';

// BLAKE3 IDs (16-char hex)
const id = generateBlake3Id();
const fullId = generateBlake3Id({ full: true }); // 64-char
const ids = generateBlake3Ids(10); // Array of 10 IDs
const deterministic = generateBlake3IdFrom('input-string');

// UUIDs
const uuid4 = generateUuid(); // v4 random
const uuid7 = generateUuidV7(); // v7 timestamp-sortable (recommended for DBs)
const uuid5 = generateUuidV5('myname', 'dns'); // Deterministic

// ULIDs (26-char, sortable)
const ulid = generateULID();
const timestamp = parseUlidTimestamp(ulid); // Extract creation time

// Shorthand
const { blake3, uuid, ulid } = id();
```

### Copier (`src/core/copier.ts`)

Copy files with inline hashing and verification.

```typescript
import { copyWithHash } from 'wake-n-blake';

const result = await copyWithHash('/source/file.mov', '/dest/file.mov', {
  algorithm: 'blake3',
  verify: true,       // Re-hash destination to verify
  overwrite: false,   // Fail if destination exists
  preserveMtime: true // Keep original modification time
});
// Returns: { source, destination, hash, size, verified, durationMs }
```

### Fast Hasher (`src/core/fast-hasher.ts`)

Sample-based hashing for very large files.

```typescript
import { fastHash, fastHashBatch } from 'wake-n-blake';

// Sample first/middle/last of file
const result = await fastHash('/path/to/10gb-file.mov', {
  sampleSize: 300 * 1024 * 1024, // 300MB samples
  threshold: 1024 * 1024 * 1024   // Only sample files >1GB
});

// Batch processing
const results = await fastHashBatch(['/file1.mov', '/file2.mov']);
```

---

## Services

### MHL Service (`src/services/mhl/`)

Generate and verify Media Hash Lists for post-production.

```typescript
import {
  generateMhl,
  mhlToXml,
  writeMhl,
  parseMhl,
  verifyMhl,
  generateMhlFilename
} from 'wake-n-blake';

// Generate MHL document
const doc = await generateMhl('/path/to/footage', {
  algorithm: 'both',  // 'xxhash64' | 'md5' | 'both'
  excludePatterns: ['*.tmp', '.DS_Store'],
  onProgress: (current, total, file) => console.log(`${current}/${total}`)
});

// Convert to XML
const xml = mhlToXml(doc);

// Write to file
await writeMhl(doc, '/path/to/output.mhl');

// Verify against MHL
const result = await verifyMhl('/path/to/file.mhl', '/base/path');
console.log(result.valid); // true
console.log(result.matched); // 150
console.log(result.mismatched); // []
console.log(result.missing); // []

// Generate filename with timestamp
const filename = generateMhlFilename('/footage'); // "footage_2024-01-01T12-00-00.mhl"
```

### BagIt Service (`src/services/bagit/`)

Create and verify BagIt packages (RFC 8493).

```typescript
import { createBag, verifyBag } from 'wake-n-blake';

// Create bag (in-place by default)
const result = await createBag('/path/to/folder', {
  algorithm: 'sha256',  // 'sha256' | 'sha512'
  outputPath: '/different/path',  // Optional: create bag elsewhere
  inPlace: true,        // Move files to data/ vs copy
  includeHiddenFiles: false,
  excludePatterns: ['*.tmp'],
  bagInfo: {
    'Source-Organization': 'My Studio',
    'Contact-Name': 'John Doe',
    'External-Description': 'Project X deliverables'
  },
  onProgress: (current, total, file) => console.log(`${current}/${total}`)
});

console.log(result.payloadOxum); // "12345678.42" (bytes.filecount)
console.log(result.tagFiles); // ['bagit.txt', 'bag-info.txt', ...]

// Verify existing bag
const verify = await verifyBag('/path/to/bag');
console.log(verify.valid); // true
console.log(verify.payloadValid); // true
console.log(verify.tagFilesValid); // true
console.log(verify.payloadOxumMatch); // true
```

### GPS Service (`src/services/gps/`)

Enrich media files with GPS coordinates from reference tracks.

```typescript
import {
  enrichFilesWithGps,
  collectMediaFiles,
  parseGpsFile,
  detectFormat
} from 'wake-n-blake';

// Detect GPS file format
const format = detectFormat('/path/to/track.gpx'); // 'gpx' | 'kml' | 'geojson'

// Parse GPS file
const content = await fs.readFile('/path/to/track.gpx', 'utf-8');
const doc = parseGpsFile(content, format);
console.log(doc.waypoints.length);
console.log(doc.tracks.length);

// Collect media files from directory
const files = await collectMediaFiles(['/path/to/photos'], true); // recursive

// Enrich files with GPS
const result = await enrichFilesWithGps(files, '/path/to/track.gpx', {
  matchStrategy: 'timestamp',  // 'timestamp' | 'nearest' | 'interpolate'
  toleranceSec: 300,           // 5 minute tolerance
  timeOffset: -3600,           // Camera clock was 1 hour behind
  updateSidecar: true,         // Write to XMP sidecar
  overwriteExisting: false,    // Skip files with existing GPS
  dryRun: false
});

console.log(result.filesMatched);
console.log(result.filesUpdated);
```

### Perceptual Hash Service (`src/services/phash/`)

Find similar/duplicate images using perceptual hashing.

```typescript
import {
  computePhash,
  compareImages,
  findSimilarImages,
  hammingDistance,
  similarityFromDistance
} from 'wake-n-blake';

// Compute perceptual hash
const hash = await computePhash('/path/to/image.jpg', {
  algorithm: 'dhash',  // 'dhash' | 'ahash' | 'phash'
  hashSize: 8          // 8x8 = 64 bit hash
});
console.log(hash.hash); // "abc123def4567890"

// Compare two images
const result = await compareImages('/image1.jpg', '/image2.jpg', {
  algorithm: 'dhash',
  threshold: 10  // Max hamming distance for "similar"
});
console.log(result.areSimilar); // true
console.log(result.similarity); // 95.3

// Find all similar images in directory
const result = await findSimilarImages(['/photos'], {
  algorithm: 'dhash',
  threshold: 10,
  recursive: true,
  onProgress: (current, total, file) => console.log(`${current}/${total}`)
});
console.log(result.similarGroups); // Grouped similar images
console.log(result.similarPairs);  // All similar pairs

// Calculate hamming distance directly
const distance = hammingDistance('abc123...', 'abc124...');
const similarity = similarityFromDistance(distance); // 0-100%
```

### XMP Sidecar Service (`src/services/xmp/`)

Generate and read XMP sidecar files with PREMIS-aligned custody chain.

```typescript
import {
  generateXmpContent,
  writeSidecar,
  readSidecar,
  verifySidecar,
  sidecarExists
} from 'wake-n-blake';

// Check if sidecar exists
const exists = await sidecarExists('/path/to/file.mov');

// Read sidecar
const { data, raw } = await readSidecar('/path/to/file.mov.xmp');
console.log(data.contentHash);
console.log(data.custodyChain);

// Verify sidecar matches file
const result = await verifySidecar('/path/to/file.mov');
console.log(result.valid);
console.log(result.hashMatch);
```

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Specific Tests

```bash
# Unit tests only
npx vitest run tests/unit/

# Integration tests only
npx vitest run tests/integration/

# Single file
npx vitest run tests/unit/hasher.test.ts

# Watch mode
npx vitest watch
```

### Test Coverage

```bash
npx vitest run --coverage
```

### Writing Tests

Tests use Vitest and follow this pattern:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('MyModule', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `wnb-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should do something', async () => {
    // Create test files
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');

    // Run function
    const result = await myFunction(tempDir);

    // Assert
    expect(result).toBeDefined();
  });
});
```

---

## Contributing

### Development Setup

```bash
# Clone
git clone https://github.com/bizzlechizzle/wake-n-blake.git
cd wake-n-blake

# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Lint
npm run lint
```

### Code Style

- TypeScript strict mode
- ESLint with no `any` types
- Prefer `async/await` over callbacks
- Use Zod for runtime validation
- Document exports with JSDoc

### Commit Messages

Follow conventional commits:

```
feat(mhl): add MD5 algorithm support
fix(hasher): validate truncate parameter
docs: update developer guide
test(bagit): add verification tests
```

### Pull Request Process

1. Fork and create feature branch
2. Write tests for new functionality
3. Ensure all tests pass: `npm test`
4. Ensure lint passes: `npm run lint`
5. Update documentation if needed
6. Submit PR with clear description

---

## Type Reference

All types are exported from `wake-n-blake`:

```typescript
import type {
  // Hashes
  Blake3Hash,        // 16-char hex
  Blake3FullHash,    // 64-char hex
  Sha256Hash,        // 64-char hex
  Sha512Hash,        // 128-char hex
  Md5Hash,           // 32-char hex
  Xxhash64Hash,      // 16-char hex
  Algorithm,
  HashResult,

  // IDs
  Blake3Id,
  Uuid,
  Ulid,

  // MHL
  MhlDocument,
  MhlHashEntry,
  MhlAlgorithm,

  // BagIt
  BagItResult,
  BagItVerifyResult,
  BagItAlgorithm,

  // GPS
  Waypoint,
  GpsDocument,
  GpsEnrichResult,

  // Phash
  PerceptualHash,
  SimilarPair,
  SimilarGroup,
  PhashAlgorithm,

  // XMP
  XmpSidecar,
  CustodyEvent,
  FileCategory,
  SourceType
} from 'wake-n-blake';
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WNB_NATIVE_B3SUM` | Path to b3sum binary | Auto-detect |
| `WNB_FORCE_WASM` | Force WASM mode for BLAKE3 | `false` |
| `WNB_BUFFER_SIZE` | Default read buffer size | `64KB-1MB` |
| `WNB_CONCURRENCY` | Default worker count | CPU cores - 1 |

---

## Troubleshooting

### Native b3sum not found

```bash
# macOS
brew install b3sum

# Linux
cargo install b3sum

# Or set path explicitly
export WNB_NATIVE_B3SUM=/usr/local/bin/b3sum
```

### Permission denied on network paths

Ensure the user has read access to SMB/NFS shares. The library automatically detects network paths and adjusts buffer sizes.

### Out of memory on large files

Use streaming APIs (`hashFile`, `copyWithHash`) instead of buffer APIs. For very large files, consider `fastHash` with sampling.

### ExifTool not found

Install exiftool for full metadata extraction:

```bash
# macOS
brew install exiftool

# Linux
apt install libimage-exiftool-perl
```
