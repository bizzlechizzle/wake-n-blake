# Wake-n-Blake Technical Guide v0.1.0

**The Universal ID & Hash Utility**

One CLI for all your hashing, verification, and identifier needs. BLAKE3-first, with SHA-256/512, UUID, and ULID support.

## Philosophy

> **BLAKE3 is the default. Always.**

- File hashing? BLAKE3.
- Need a unique ID? BLAKE3 hash of randomness.
- Verification? BLAKE3.
- Legacy compatibility needed? SHA-256/512 available.
- External system requires UUID? We generate it.

## Quick Reference

### Commands

```bash
# HASHING (BLAKE3 default)
wnb hash <file>                      # BLAKE3 hash (16 hex chars)
wnb hash <file> --full               # Full 256-bit BLAKE3 (64 hex chars)
wnb hash <dir> -r                    # Recursive directory hash
wnb hash <file> -a sha256            # SHA-256 (compatibility)
wnb hash <file> -a sha512            # SHA-512 (compatibility)
wnb hash <file> -a all               # All algorithms at once

# ID GENERATION (BLAKE3-based by default)
wnb id                               # BLAKE3 ID (16 hex chars, random source)
wnb id --full                        # Full 64 hex char ID
wnb uuid                             # UUID v4 (random) - when external systems need it
wnb uuid -v 7                        # UUID v7 (timestamp-sortable)
wnb uuid -v 5 -n dns example.com     # UUID v5 (SHA-1 hash-based)
wnb ulid                             # ULID (sortable, 26 chars)

# VERIFICATION
wnb verify <file> <hash>             # Verify single file
wnb check <dir> <manifest>           # Verify directory against manifest
wnb audit <dir> <manifest>           # Strict audit with verbosity levels

# MANIFESTS
wnb manifest <dir>                   # Generate manifest.json
wnb manifest <dir> --update          # Update existing (add new files only)
wnb diff <manifest1> <manifest2>     # Compare two manifests

# NETWORK-SAFE COPY
wnb copy <src> <dst>                 # Copy with inline BLAKE3 verification
wnb copy <dir> <dst> -r --verify     # Recursive with double-verify

# IMPORT PIPELINE
wnb import <src> <dst>               # Full pipeline: scan→hash→copy→validate→sidecar
wnb import <src> <dst> --resume      # Resume from checkpoint
wnb import <src> <dst> --dedup       # Skip duplicates by hash
wnb import <src> <dst> -P            # Keep original filenames (default: blake16)
wnb import <src> <dst> -a            # Archive mode (preserve sidecar history)
wnb import <src> <dst> -S            # Skip XMP sidecar generation
wnb import <src> <dst> -b "Wedding"  # Batch name for grouping

# XMP SIDECAR OPERATIONS
wnb sidecar <file>                   # Show sidecar contents
wnb sidecar <file> --create          # Create sidecar for existing file
wnb sidecar <file> --verify          # Verify sidecar integrity
wnb sidecar <dir> -r --audit         # Audit all sidecars in directory
wnb sidecar <file> --history         # Show custody chain

# SOURCE DEVICE DETECTION
wnb device <path>                    # Detect import source device info
wnb device /Volumes/SDCARD           # Show USB, card reader, media serial
wnb device --json                    # JSON output for scripting

# METADATA EXTRACTION
wnb meta <file>                      # Extract all metadata (auto-detect type)
wnb meta <file> --raw                # Raw output from all tools
wnb meta <file> -f json              # JSON output
wnb meta <dir> -r --summary          # Summarize metadata for directory
wnb meta <file> --tools              # Show which tools were used

# UTILITIES
wnb diagnose                         # System capabilities check
wnb rename <file> --embed            # Embed hash in filename
wnb dedup <dir>                      # Find duplicates by hash
wnb fast <file>                      # Fast mode (sample large files)
```

### Build & Test

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript
npm run test       # Run test suite
npm run lint       # Run linter
npm link           # Install globally as 'wnb'
```

### Gotchas

1. **BLAKE3 is always default** - specify `-a sha256` only when needed for compatibility
2. **16 hex chars** - default output is truncated to 64-bit (sufficient for file dedup)
3. **Use `--full`** - for cryptographic applications needing full 256-bit
4. **Network paths auto-detected** - 1MB buffer, throttled concurrency
5. **`.wnbignore`** - gitignore-style patterns for excluding files

---

## Architecture

### Directory Structure

```
wake-n-blake/
├── CLAUDE.md                 # Universal dev standards (DO NOT MODIFY)
├── techguide.md             # This file
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts             # CLI entry point
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── hash.ts      # wnb hash
│   │   │   ├── id.ts        # wnb id, wnb uuid, wnb ulid
│   │   │   ├── verify.ts    # wnb verify
│   │   │   ├── manifest.ts  # wnb manifest, wnb check, wnb audit
│   │   │   ├── copy.ts      # wnb copy
│   │   │   ├── import.ts    # wnb import (with XMP sidecar)
│   │   │   ├── sidecar.ts   # wnb sidecar
│   │   │   ├── device.ts    # wnb device
│   │   │   ├── meta.ts      # wnb meta
│   │   │   ├── dedup.ts     # wnb dedup
│   │   │   ├── rename.ts    # wnb rename --embed
│   │   │   └── diagnose.ts  # wnb diagnose
│   │   ├── output.ts        # Output formatters (text, json, csv, bsd, sfv)
│   │   └── index.ts         # Command router
│   ├── core/
│   │   ├── hasher.ts        # Multi-algorithm hash (BLAKE3, SHA-256, SHA-512)
│   │   ├── id-generator.ts  # ID generation (BLAKE3-id, UUID, ULID)
│   │   ├── verifier.ts      # Hash verification
│   │   ├── manifest.ts      # Manifest gen/check/diff
│   │   └── constants.ts     # Shared constants
│   ├── services/
│   │   ├── copier.ts        # Network-safe copy
│   │   ├── importer.ts      # Import pipeline orchestrator
│   │   ├── scanner.ts       # File enumeration + .wnbignore
│   │   ├── validator.ts     # Post-copy verification
│   │   ├── deduplicator.ts  # Duplicate detection
│   │   ├── worker-pool.ts   # Parallel processing
│   │   ├── xmp/
│   │   │   ├── writer.ts    # XMP sidecar generator
│   │   │   ├── reader.ts    # XMP sidecar parser
│   │   │   ├── embedder.ts  # Embed XMP in files (JPEG, MP4, etc.)
│   │   │   └── schema.ts    # XMP namespace definitions
│   │   ├── device/
│   │   │   ├── detector.ts  # Source device detection
│   │   │   ├── macos.ts     # macOS-specific (ioreg, diskutil)
│   │   │   ├── linux.ts     # Linux-specific (udevadm, sysfs)
│   │   │   └── windows.ts   # Windows-specific (PowerShell)
│   │   ├── metadata/
│   │   │   ├── exiftool.ts  # ExifTool wrapper
│   │   │   └── file-type.ts # Magic bytes detection
│   │   └── related-files/
│   │       └── detector.ts  # Live Photo, RAW+JPEG pairs
│   ├── schemas/
│   │   └── index.ts         # Zod validation schemas
│   ├── utils/
│   │   ├── network.ts       # Network path detection
│   │   ├── progress.ts      # Progress reporting
│   │   ├── retry.ts         # Retry with backoff
│   │   ├── ignore.ts        # .wnbignore parser
│   │   └── format.ts        # Output formatting
│   └── workers/
│       └── hash.worker.ts   # Worker thread for hashing
├── tests/
│   ├── unit/
│   └── integration/
└── bin/
    └── wnb                  # Executable entry point
```

### Core Dependencies

```json
{
  "dependencies": {
    "blake3": "^2.1.7",
    "commander": "^12.1.0",
    "zod": "^3.24.1",
    "p-queue": "^8.0.1",
    "uuid": "^11.0.3",
    "ulid": "^2.3.0",
    "ignore": "^6.0.2",
    "ora": "^8.1.1",
    "file-type": "^19.6.0",
    "exiftool-vendored": "^28.3.0",
    "minimatch": "^9.0.0",
    "sharp": "^0.33.5",
    "xxhash-addon": "^2.0.3"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/uuid": "^10.0.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "tsx": "^4.19.2"
  }
}
```

**XMP/Sidecar Dependencies:**
- `file-type`: Magic bytes detection (MIME type from content, not extension)
- `exiftool-vendored`: ExifTool wrapper for EXIF/XMP extraction and embedding

---

## Core Specifications

### Algorithm Support

| Algorithm | Default | Output Length | Use Case |
|-----------|---------|---------------|----------|
| **BLAKE3** | YES | 16 hex (64-bit) | File hashing, IDs, verification |
| BLAKE3-full | - | 64 hex (256-bit) | Cryptographic applications |
| SHA-256 | - | 64 hex | Legacy compatibility, interop |
| SHA-512 | - | 128 hex | High-security requirements |

**Why BLAKE3 default?**
- 3-15x faster than SHA-256
- Parallel by design (uses all cores)
- Secure against length-extension attacks
- Modern, peer-reviewed design

### ID Format Specifications

| Type | Length | Format | When to Use |
|------|--------|--------|-------------|
| **BLAKE3 ID** | 16 chars | `[a-f0-9]{16}` | Default for everything internal |
| BLAKE3 ID (full) | 64 chars | `[a-f0-9]{64}` | When 64-bit collision risk matters |
| UUID v4 | 36 chars | `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` | External API compatibility |
| UUID v7 | 36 chars | `xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx` | Timestamp-sortable UUID |
| UUID v5 | 36 chars | `xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx` | Deterministic from name+namespace |
| ULID | 26 chars | `[0-9A-HJKMNP-TV-Z]{26}` | Sortable, no special chars |

### BLAKE3 ID Generation

When you need a unique ID (not hashing a file), we generate a BLAKE3 hash of random bytes:

```typescript
function generateId(options?: { full?: boolean }): string {
  const randomBytes = crypto.randomBytes(32);
  const hash = blake3(randomBytes);
  return options?.full ? hash : hash.slice(0, 16);
}
```

This is preferred over UUID because:
- Shorter (16 vs 36 chars)
- No special characters (hyphens)
- Consistent with file hashes
- Faster to generate

### Hash Validation Regex

```typescript
const HASH_PATTERNS = {
  blake3:     /^[a-f0-9]{16}$/,      // 64-bit truncated
  blake3Full: /^[a-f0-9]{64}$/,      // Full 256-bit
  sha256:     /^[a-f0-9]{64}$/,
  sha512:     /^[a-f0-9]{128}$/,
  uuid:       /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  ulid:       /^[0-9A-HJKMNP-TV-Z]{26}$/
};
```

---

## Zod Schemas

```typescript
import { z } from 'zod';

// ============================================
// HASH SCHEMAS
// ============================================

export const Blake3HashSchema = z.string()
  .length(16)
  .regex(/^[a-f0-9]+$/, 'Must be 16 lowercase hex characters');

export const Blake3FullHashSchema = z.string()
  .length(64)
  .regex(/^[a-f0-9]+$/, 'Must be 64 lowercase hex characters');

export const Sha256HashSchema = z.string()
  .length(64)
  .regex(/^[a-f0-9]+$/, 'Must be 64 lowercase hex characters');

export const Sha512HashSchema = z.string()
  .length(128)
  .regex(/^[a-f0-9]+$/, 'Must be 128 lowercase hex characters');

// Union for any supported hash
export const AnyHashSchema = z.union([
  Blake3HashSchema,
  Blake3FullHashSchema,
  Sha256HashSchema,
  Sha512HashSchema
]);

// ============================================
// ID SCHEMAS
// ============================================

export const Blake3IdSchema = Blake3HashSchema; // Same format

export const UuidSchema = z.string().uuid();

export const UlidSchema = z.string()
  .length(26)
  .regex(/^[0-9A-HJKMNP-TV-Z]+$/, 'Must be valid ULID');

// Union for any ID type
export const AnyIdSchema = z.union([
  Blake3IdSchema,
  UuidSchema,
  UlidSchema
]);

// ============================================
// FILE & MANIFEST SCHEMAS
// ============================================

export const AlgorithmSchema = z.enum(['blake3', 'blake3-full', 'sha256', 'sha512']);

export const HashResultSchema = z.object({
  path: z.string().min(1),
  hash: z.string(),
  algorithm: AlgorithmSchema,
  size: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative()
});

export const ManifestEntrySchema = z.object({
  path: z.string().min(1),
  hash: Blake3HashSchema,               // Always BLAKE3 in manifests
  size: z.number().int().nonnegative(),
  mtime: z.string().datetime().optional()
});

export const ManifestSchema = z.object({
  version: z.literal('1.0'),
  generated: z.string().datetime(),
  algorithm: z.literal('blake3'),        // Manifests always use BLAKE3
  hashLength: z.literal(16),
  root: z.string(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  files: z.array(ManifestEntrySchema)
});

export const VerifyResultSchema = z.object({
  path: z.string(),
  expected: z.string(),
  actual: z.string(),
  algorithm: AlgorithmSchema,
  match: z.boolean(),
  size: z.number().int().nonnegative()
});

export const AuditResultSchema = z.object({
  valid: z.boolean(),
  total: z.number().int(),
  matched: z.number().int(),
  mismatched: z.array(ManifestEntrySchema),
  missing: z.array(ManifestEntrySchema),    // In manifest, not on disk
  extra: z.array(z.string()),               // On disk, not in manifest
  duplicates: z.array(z.object({
    hash: Blake3HashSchema,
    paths: z.array(z.string())
  }))
});

export const CopyResultSchema = z.object({
  source: z.string(),
  destination: z.string(),
  hash: Blake3HashSchema,
  size: z.number().int().nonnegative(),
  verified: z.boolean(),
  durationMs: z.number().nonnegative()
});

export const ImportSessionSchema = z.object({
  id: Blake3IdSchema,                        // BLAKE3 ID, not UUID
  status: z.enum([
    'scanning', 'hashing', 'copying',
    'validating', 'completed', 'paused', 'failed'
  ]),
  source: z.string(),
  destination: z.string(),
  totalFiles: z.number().int().nonnegative(),
  processedFiles: z.number().int().nonnegative(),
  duplicateFiles: z.number().int().nonnegative(),
  errorFiles: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  processedBytes: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  checkpoint: z.any().optional()
});

// ============================================
// XMP SIDECAR SCHEMAS
// ============================================

export const SourceTypeSchema = z.enum([
  'memory_card', 'camera_direct', 'phone_direct', 'local_disk',
  'network_share', 'cloud_sync', 'cloud_download', 'web_download',
  'email_attachment', 'messaging_app', 'airdrop', 'bluetooth',
  'optical_disc', 'tape', 'ftp_sftp', 'version_control',
  'backup_restore', 'forensic_recovery', 'unknown'
]);

export const FileCategorySchema = z.enum([
  'image', 'video', 'audio', 'document', 'archive',
  'sidecar', 'executable', 'data', 'other'
]);

export const MediaTypeSchema = z.enum([
  'sd', 'cf', 'cfexpress', 'ssd', 'hdd', 'nvme'
]);

export const CustodyEventActionSchema = z.enum([
  'creation', 'ingestion', 'message_digest_calculation', 'fixity_check',
  'virus_check', 'format_identification', 'format_validation', 'migration',
  'normalization', 'replication', 'deletion', 'modification',
  'metadata_modification', 'deaccession', 'recovery', 'quarantine',
  'release', 'access', 'redaction', 'decryption', 'compression', 'decompression'
]);

export const ImportSourceDeviceSchema = z.object({
  // USB Device
  usbVendorId: z.string().optional(),
  usbProductId: z.string().optional(),
  usbSerial: z.string().optional(),
  usbDevicePath: z.string().optional(),
  usbDeviceName: z.string().optional(),
  usbBusLocation: z.string().optional(),

  // Card Reader
  cardReaderVendor: z.string().optional(),
  cardReaderModel: z.string().optional(),
  cardReaderSerial: z.string().optional(),
  cardReaderPort: z.string().optional(),

  // Physical Media
  mediaType: MediaTypeSchema.optional(),
  mediaSerial: z.string().optional(),
  mediaManufacturer: z.string().optional(),
  mediaCapacity: z.number().int().optional(),
  mediaFirmware: z.string().optional(),

  // Tethered Device
  cameraBodySerial: z.string().optional(),
  cameraInternalName: z.string().optional(),
  phoneDeviceId: z.string().optional(),
  tetheredConnection: z.enum(['usb', 'wifi', 'bluetooth', 'thunderbolt']).optional()
});

export const CustodyEventSchema = z.object({
  eventId: z.string(),                           // ULID
  eventTimestamp: z.string().datetime(),
  eventAction: CustodyEventActionSchema,
  eventOutcome: z.enum(['success', 'failure', 'partial']),
  eventLocation: z.string().optional(),
  eventHost: z.string().optional(),
  eventUser: z.string().optional(),
  eventTool: z.string().optional(),
  eventHash: Blake3FullHashSchema.optional(),
  eventHashAlgorithm: z.string().optional(),
  eventNotes: z.string().optional(),
  eventDetails: z.string().optional()            // JSON blob
});

export const XmpSidecarSchema = z.object({
  // Sidecar Self-Integrity
  schemaVersion: z.number().int().min(1),
  sidecarHash: Blake3FullHashSchema,
  sidecarCreated: z.string().datetime(),
  sidecarUpdated: z.string().datetime(),

  // Core Identity
  contentHash: Blake3FullHashSchema,
  hashAlgorithm: z.literal('blake3'),
  fileSize: z.number().int().nonnegative(),
  verified: z.boolean(),

  // File Classification
  fileCategory: FileCategorySchema,
  fileSubcategory: z.string().optional(),
  detectedMimeType: z.string(),
  declaredExtension: z.string(),
  extensionMismatch: z.boolean().optional(),

  // Source Provenance
  sourcePath: z.string(),
  sourceFilename: z.string(),
  sourceHost: z.string(),
  sourceVolume: z.string().optional(),
  sourceVolumeSerial: z.string().optional(),
  sourceType: SourceTypeSchema,

  // Import Source Device
  sourceDevice: ImportSourceDeviceSchema.optional(),

  // Timestamps
  originalMtime: z.string().datetime(),
  originalCtime: z.string().datetime().optional(),
  originalBtime: z.string().datetime().optional(),

  // Import Context
  importTimestamp: z.string().datetime(),
  sessionId: Blake3IdSchema,
  toolVersion: z.string(),
  importUser: z.string(),
  importHost: z.string(),
  importPlatform: z.enum(['darwin', 'linux', 'win32']),

  // Batch Context
  batchId: z.string().optional(),
  batchName: z.string().optional(),

  // Related Files
  relatedFiles: z.array(z.string()).optional(),
  relationType: z.string().optional(),
  isLivePhoto: z.boolean().optional(),
  livePhotoRole: z.enum(['image', 'video']).optional(),

  // Chain of Custody
  custodyChain: z.array(CustodyEventSchema),
  firstSeen: z.string().datetime(),
  eventCount: z.number().int().nonnegative()
});

// ============================================
// TYPE EXPORTS
// ============================================

export type Blake3Hash = z.infer<typeof Blake3HashSchema>;
export type Blake3Id = z.infer<typeof Blake3IdSchema>;
export type Uuid = z.infer<typeof UuidSchema>;
export type Ulid = z.infer<typeof UlidSchema>;
export type Algorithm = z.infer<typeof AlgorithmSchema>;
export type HashResult = z.infer<typeof HashResultSchema>;
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type VerifyResult = z.infer<typeof VerifyResultSchema>;
export type AuditResult = z.infer<typeof AuditResultSchema>;
export type CopyResult = z.infer<typeof CopyResultSchema>;
export type ImportSession = z.infer<typeof ImportSessionSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
export type FileCategory = z.infer<typeof FileCategorySchema>;
export type MediaType = z.infer<typeof MediaTypeSchema>;
export type CustodyEventAction = z.infer<typeof CustodyEventActionSchema>;
export type ImportSourceDevice = z.infer<typeof ImportSourceDeviceSchema>;
export type CustodyEvent = z.infer<typeof CustodyEventSchema>;
export type XmpSidecar = z.infer<typeof XmpSidecarSchema>;
```

---

## CLI Commands (Detailed)

### `wnb hash`

Compute hashes using BLAKE3 (default) or other algorithms.

```
wnb hash <path> [options]

Arguments:
  path                  File or directory to hash

Options:
  -a, --algorithm       Algorithm: blake3 (default), sha256, sha512, all
  -r, --recursive       Hash directories recursively
  --full                Full 256-bit output (64 hex chars)
  -f, --format          Output: text (default), json, csv, bsd, sfv
  -p, --parallel        Parallel workers (default: auto)
  -q, --quiet           Only output hash values
  --hdd                 Sequential mode for mechanical drives
  --native              Force native b3sum (fail if unavailable)
  --wasm                Force WASM (skip native detection)

Output Formats:
  text:  a1b2c3d4e5f67890  file.txt
  json:  {"path":"file.txt","hash":"a1b2c3d4e5f67890","algorithm":"blake3","size":1234}
  csv:   file.txt,a1b2c3d4e5f67890,blake3,1234
  bsd:   BLAKE3 (file.txt) = a1b2c3d4e5f67890
  sfv:   file.txt a1b2c3d4e5f67890

Examples:
  wnb hash file.txt                    # BLAKE3, 16 hex chars
  wnb hash file.txt --full             # BLAKE3, 64 hex chars
  wnb hash file.txt -a sha256          # SHA-256 for compatibility
  wnb hash ./data -r                   # Directory recursive
  wnb hash ./data -r -f json           # JSON output
  wnb hash ./data -r --hdd             # Sequential for HDD
  wnb hash file.txt -a all             # All algorithms
```

### `wnb id`

Generate unique identifiers (BLAKE3-based by default).

```
wnb id [options]

Options:
  --full                Full 64 hex char ID
  -n, --count           Generate multiple IDs
  -f, --format          Output: text (default), json

Examples:
  wnb id                               # Single BLAKE3 ID (16 chars)
  wnb id --full                        # Full 64 char ID
  wnb id -n 10                         # Generate 10 IDs
  wnb id -f json                       # JSON output
```

### `wnb uuid`

Generate UUIDs (for external system compatibility).

```
wnb uuid [options]

Options:
  -v, --version         UUID version: 4 (default), 1, 5, 7
  -n, --namespace       Namespace for v5: dns, url, oid, x500, or custom UUID
  --name                Name string for v5
  --count               Generate multiple UUIDs
  -f, --format          Output: text (default), json

Examples:
  wnb uuid                             # UUID v4 (random)
  wnb uuid -v 7                        # UUID v7 (timestamp-sortable)
  wnb uuid -v 1                        # UUID v1 (time-based)
  wnb uuid -v 5 -n dns --name example.com  # UUID v5 deterministic
  wnb uuid --count 5                   # Generate 5 UUIDs
```

### `wnb ulid`

Generate ULIDs (sortable, URL-safe).

```
wnb ulid [options]

Options:
  -t, --timestamp       Specific timestamp (ISO 8601)
  --count               Generate multiple ULIDs
  -f, --format          Output: text (default), json

Examples:
  wnb ulid                             # Current timestamp
  wnb ulid -t 2024-01-01T00:00:00Z     # Specific timestamp
  wnb ulid --count 5                   # Generate 5 ULIDs
```

### `wnb verify`

Verify file against expected hash.

```
wnb verify <file> <hash> [options]

Arguments:
  file                  File to verify
  hash                  Expected hash (auto-detects algorithm by length)

Options:
  -a, --algorithm       Force algorithm (auto-detect by default)
  -q, --quiet           Exit code only, no output

Exit Codes:
  0  Hash matches
  1  Hash mismatch
  2  File not found
  3  Invalid hash format

Examples:
  wnb verify file.txt a1b2c3d4e5f67890              # BLAKE3 (16 chars)
  wnb verify file.txt <64-char-hash>                # Auto-detect full BLAKE3 or SHA-256
  wnb verify file.txt <128-char-hash>               # Auto-detect SHA-512
```

### `wnb manifest`

Generate and manage file manifests.

```
wnb manifest <dir> [options]

Arguments:
  dir                   Directory to manifest

Options:
  -o, --output          Output file (default: <dir>/manifest.json)
  --update              Update existing manifest (add new files only)
  --exclude             Glob patterns to exclude (repeatable)
  --include             Glob patterns to include only (repeatable)
  -f, --format          Output: json (default), csv

Examples:
  wnb manifest ./data
  wnb manifest ./data -o backup.json
  wnb manifest ./data --update                     # Add new files only
  wnb manifest ./data --exclude "*.log" --exclude ".git/**"
```

### `wnb check`

Verify directory against manifest.

```
wnb check <dir> <manifest> [options]

Arguments:
  dir                   Directory to check
  manifest              Manifest file to verify against

Options:
  -q, --quiet           Summary only
  -v, --verbose         Show all files, not just mismatches
  -f, --format          Output: text (default), json

Exit Codes:
  0  All files valid
  1  Mismatches found
  2  Missing files
  3  Manifest read error

Examples:
  wnb check ./data manifest.json
  wnb check ./backup ./data/manifest.json -v
```

### `wnb audit`

Strict verification with verbosity levels (hashdeep-style).

```
wnb audit <dir> <manifest> [options]

Arguments:
  dir                   Directory to audit
  manifest              Known-good manifest

Options:
  -v, --verbose         Verbosity level (repeat for more detail)
                        -v     File category counts
                        -vv    All discrepancies
                        -vvv   Every file examined
  --strict              Fail on extra files not in manifest
  -f, --format          Output: text (default), json

Exit Codes:
  0  Audit passed
  1  Mismatches found
  2  Missing files
  3  Extra files (with --strict)
  4  Duplicates detected

Examples:
  wnb audit ./data manifest.json -v                # Summary counts
  wnb audit ./data manifest.json -vv               # All discrepancies
  wnb audit ./data manifest.json -vvv              # Every file
  wnb audit ./data manifest.json --strict          # Fail on extras
```

### `wnb diff`

Compare two manifests.

```
wnb diff <manifest1> <manifest2> [options]

Arguments:
  manifest1             First manifest (base)
  manifest2             Second manifest (compare)

Options:
  -f, --format          Output: text (default), json

Output Categories:
  ADDED      - Files in manifest2 not in manifest1
  REMOVED    - Files in manifest1 not in manifest2
  MODIFIED   - Same path, different hash
  UNCHANGED  - Same path, same hash

Examples:
  wnb diff before.json after.json
  wnb diff prod.json staging.json -f json
```

### `wnb copy`

Network-safe copy with inline BLAKE3 verification.

```
wnb copy <source> <destination> [options]

Arguments:
  source                Source file or directory
  destination           Destination path

Options:
  -r, --recursive       Copy directories recursively
  -p, --parallel        Parallel copies (default: auto)
  --verify              Double-verify after copy (slower, safer)
  --no-verify           Skip post-copy verification
  --dry-run             Show what would be copied
  --retries             Retry count for network errors (default: 3)
  --hdd                 Sequential mode for mechanical drives

Examples:
  wnb copy file.txt /backup/
  wnb copy ./data /mnt/nas/backup -r
  wnb copy ./data /mnt/nas/backup -r --verify

Output:
  COPY file.txt → /backup/file.txt [a1b2c3d4e5f67890] 1.2MB 230ms
```

### `wnb import`

Full import pipeline with XMP sidecar generation.

```
wnb import <source> <destination> [options]

Arguments:
  source                Source directory (memory card, folder, etc.)
  destination           Destination directory

Core Options:
  --dry-run             Show what would happen
  --resume              Resume from last checkpoint
  --dedup               Skip files that already exist by hash
  --duplicates          Strategy: skip (default), overwrite, rename
  -p, --parallel        Parallel operations (default: auto)
  --manifest            Generate manifest after import
  -q, --quiet           Minimal output

File Naming:
  -P, --preserve-name   Keep original filenames (default: rename to blake16)

XMP Sidecar Options:
  -S, --skip-sidecar    Skip XMP sidecar generation (not recommended)
  -a, --archive         Archive mode: preserve full sidecar history
  -b, --batch-name      Name for this import batch (e.g., "Wedding 2024")
  -t, --source-type     Override auto-detected source type
  --quarantine          Mark all files for review before release

Source Types (auto-detected or -t override):
  memory_card, camera_direct, phone_direct, local_disk, network_share,
  cloud_sync, cloud_download, web_download, email_attachment,
  messaging_app, airdrop, bluetooth, optical_disc, ftp_sftp

Pipeline Stages:
  1. SCAN       [0-5%]    Enumerate source files
  2. DEVICE     [5-8%]    Detect source device (USB, card reader, media serial)
  3. HASH       [8-40%]   Compute BLAKE3 hashes
  4. DEDUP      [40-45%]  Check destination for duplicates
  5. COPY       [45-75%]  Network-safe copy with inline hash
  6. RENAME     [75-80%]  Rename to blake16 (unless -P)
  7. VALIDATE   [80-90%]  Re-verify copied files
  8. SIDECAR    [90-98%]  Generate XMP sidecars (unless -S)
  9. MANIFEST   [98-100%] Generate manifest (optional)

Default File Renaming:
  Original:  IMG_4523.CR3
  Renamed:   a7f3b2c1d4e5f678.CR3  (16-char BLAKE3 hash)
  Sidecar:   a7f3b2c1d4e5f678.CR3.xmp

XMP Sidecar Contents:
  - Full BLAKE3 hash (64 chars)
  - Original filename, path, host
  - Source device info (USB fingerprint, card reader, media serial)
  - Timestamps (mtime, ctime, btime)
  - File category (image, video, document, etc.)
  - Chain of custody (append-only)
  - Related files (Live Photo pairs, RAW+JPEG)

Examples:
  wnb import /Volumes/SDCARD /archive/photos
  wnb import /Volumes/SDCARD /archive -b "December Wedding"
  wnb import /mnt/sd-card /archive --manifest
  wnb import /network/share /local --resume
  wnb import ./data /backup --dedup
  wnb import /Volumes/iPhone /archive -t phone_direct
  wnb import ./downloads /archive -P          # Keep original names
  wnb import ./data /backup -S                # Skip sidecars (not recommended)

Output:
  IMPORT IMG_4523.CR3 → a7f3b2c1d4e5f678.CR3 [verified] 28.4MB
  SIDECAR a7f3b2c1d4e5f678.CR3.xmp created
```

### `wnb sidecar`

XMP sidecar operations.

```
wnb sidecar <path> [options]

Arguments:
  path                  File or directory

Display Options:
  (no flags)            Show sidecar summary (human-readable)
  --full                Show full XMP content
  --history             Show custody chain events
  --device              Show source device info only
  -f, --format          Output: text (default), json, xml

Operations:
  --create              Create sidecar for existing file (if missing)
  --verify              Verify sidecar integrity (hash check)
  --update              Update sidecar (add custody event)
  --embed               Embed XMP into file (if format supports)
  --extract             Extract embedded XMP to sidecar

Batch Operations:
  -r, --recursive       Process directories recursively
  --audit               Audit all sidecars (find missing, verify integrity)
  --orphans             Find sidecars without matching files
  --missing             Find files without sidecars

Custody Events (with --update):
  --event               Event type: fixity_check, access, modification, etc.
  --note                Add note to custody event

Examples:
  wnb sidecar photo.jpg                       # Show sidecar summary
  wnb sidecar photo.jpg --full                # Full XMP content
  wnb sidecar photo.jpg --history             # Custody chain
  wnb sidecar photo.jpg --device              # Source device info
  wnb sidecar photo.jpg --create              # Create if missing
  wnb sidecar photo.jpg --verify              # Check integrity
  wnb sidecar ./photos -r --audit             # Audit all sidecars
  wnb sidecar ./photos -r --missing           # Find files without sidecars
  wnb sidecar photo.jpg --update --event fixity_check
  wnb sidecar photo.jpg -f json               # JSON output

Output (default):
  photo.jpg.xmp
  ├── Hash:     af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9...
  ├── Original: IMG_4523.CR3
  ├── Source:   /Volumes/SDCARD_01/DCIM/100CANON/
  ├── Device:   SanDisk SD card via Apple Card Reader
  ├── Category: image/raw
  ├── Imported: 2025-12-22T09:15:43Z
  └── Events:   3 (creation → hash → ingestion)
```

### `wnb device`

Detect import source device information.

```
wnb device <path> [options]

Arguments:
  path                  Volume path or mount point

Options:
  -f, --format          Output: text (default), json
  -v, --verbose         Show all detected fields

Detected Information:
  USB Device:
  ├── Vendor ID         e.g., 0x05ac (Apple)
  ├── Product ID        e.g., 0x8406
  ├── Serial            USB device serial number
  ├── Device Path       e.g., /dev/disk4
  └── Bus Location      USB bus/port

  Card Reader:
  ├── Vendor            e.g., Apple, SanDisk
  ├── Model             e.g., Internal Memory Card Reader
  ├── Serial            Card reader serial
  └── Port/Slot         Which slot on multi-slot reader

  Physical Media:
  ├── Type              sd, cf, cfexpress, ssd, hdd, nvme
  ├── Serial            Hardware serial (from CID for SD cards)
  ├── Manufacturer      e.g., SanDisk, Samsung
  ├── Capacity          In bytes
  └── Firmware          If available

  Tethered Device:
  ├── Camera Serial     Camera body serial (via PTP/gphoto2)
  ├── Phone Device ID   Mobile device identifier
  └── Connection        usb, wifi, bluetooth, thunderbolt

Examples:
  wnb device /Volumes/SDCARD
  wnb device /Volumes/SDCARD -f json
  wnb device /Volumes/SDCARD -v

Output (text):
  Source Device: /Volumes/SDCARD_01
  ├── Type:         memory_card (SD)
  ├── USB Vendor:   0x05ac (Apple Inc.)
  ├── USB Product:  0x8406 (Internal Memory Card Reader)
  ├── USB Serial:   000000000820
  ├── Media Serial: 0x2b3d9127
  ├── Media Make:   SanDisk
  ├── Capacity:     128 GB
  └── Device Path:  /dev/disk4

Output (json):
  {
    "sourceType": "memory_card",
    "mediaType": "sd",
    "usb": {
      "vendorId": "0x05ac",
      "productId": "0x8406",
      "serial": "000000000820",
      "devicePath": "/dev/disk4",
      "deviceName": "Internal Memory Card Reader"
    },
    "media": {
      "serial": "0x2b3d9127",
      "manufacturer": "SanDisk",
      "capacity": 128849018880
    }
  }
```

### `wnb meta`

Extract deep metadata from files using specialized tools.

```
wnb meta <path> [options]

Arguments:
  path                  File or directory

Options:
  -f, --format          Output: text (default), json, yaml
  --raw                 Raw output from all tools (verbose)
  --tools               Show which extraction tools were used
  --category            Force category: photo, video, audio, document, ebook
  -r, --recursive       Process directories recursively
  --summary             Summary statistics for directory
  --missing             Report files with no extractable metadata

Tool Stack (by category):
  Photo:     ExifTool (bundled via exiftool-vendored)
  Video:     ExifTool → MediaInfo (if available) → ffprobe (if available)
  Audio:     ExifTool → ffprobe (if available)
  Document:  ExifTool

Note: MediaInfo and ffprobe are optional external tools that enhance metadata
extraction when installed. ExifTool is always available (bundled).

Examples:
  wnb meta photo.jpg                       # Extract photo metadata
  wnb meta video.mp4                       # Extract video metadata
  wnb meta photo.jpg -f json               # JSON output
  wnb meta photo.jpg --raw                 # Raw tool output
  wnb meta photo.jpg --tools               # Show tools used
  wnb meta ./photos -r --summary           # Directory summary
  wnb meta document.pdf --category document  # Force category

Output (text - photo):
  photo.jpg
  ├── Category:     image/raw
  ├── Dimensions:   6000 x 4000
  ├── Camera:       Canon EOS R5
  ├── Lens:         RF 24-70mm F2.8 L IS USM
  ├── Settings:     f/4.0  1/250s  ISO 400  50mm
  ├── Date:         2025-12-20T14:32:17-08:00
  ├── GPS:          37.7749, -122.4194
  ├── Color:        sRGB, 14-bit
  └── Tools:        exiftool, exiv2

Output (text - video):
  video.mp4
  ├── Category:     video/mp4
  ├── Container:    MP4 (H.264 + AAC)
  ├── Resolution:   3840x2160 @ 59.94fps (progressive)
  ├── Duration:     00:02:34.56
  ├── Bitrate:      150 Mbps (video), 320 kbps (audio)
  ├── Audio:        AAC, 48kHz, stereo
  ├── Color:        Rec.709, SDR
  ├── Date:         2025-12-20T14:30:00Z
  └── Tools:        mediainfo, ffprobe, exiftool

Output (json):
  {
    "category": "image",
    "mimeType": "image/x-canon-cr3",
    "tools": ["exiftool", "exiv2"],
    "photo": {
      "camera": "Canon EOS R5",
      "lens": "RF 24-70mm F2.8 L IS USM",
      "aperture": "f/4.0",
      "shutterSpeed": "1/250",
      "iso": 400,
      "focalLength": "50mm",
      "captureDate": "2025-12-20T14:32:17-08:00",
      "gps": { "lat": 37.7749, "lon": -122.4194 },
      "dimensions": { "width": 6000, "height": 4000 },
      "colorSpace": "sRGB",
      "bitDepth": 14
    }
  }
```

### `wnb dedup`

Find duplicate files by hash.

```
wnb dedup <dir> [options]

Arguments:
  dir                   Directory to scan

Options:
  -r, --recursive       Scan recursively (default: true)
  --min-size            Minimum file size to consider
  --action              What to do: report (default), link, delete-ask
  -f, --format          Output: text (default), json

Examples:
  wnb dedup ./photos
  wnb dedup ./data --min-size 1mb
  wnb dedup ./data --action link      # Replace dupes with hardlinks
  wnb dedup ./data -f json
```

### `wnb rename`

Embed hash in filename.

```
wnb rename <file|dir> [options]

Arguments:
  file|dir              File or directory to rename

Options:
  --embed               Embed hash in filename
  --pattern             Naming pattern (default: "{name}.{hash}.{ext}")
  --dry-run             Show what would be renamed
  -r, --recursive       Process directories recursively

Patterns:
  {name}    Original filename without extension
  {hash}    BLAKE3 hash (16 chars)
  {ext}     File extension
  {date}    File modification date

Examples:
  wnb rename photo.jpg --embed              # photo.a1b2c3d4e5f67890.jpg
  wnb rename ./data -r --embed --dry-run
  wnb rename file.txt --pattern "{hash}.{name}.{ext}"
```

### `wnb fast`

Fast mode - sample large files for quick hash approximation.

```
wnb fast <file|dir> [options]

Arguments:
  file|dir              File or directory to hash

Options:
  --sample-size         Sample size in MB (default: 300)
  -r, --recursive       Process directories recursively
  -f, --format          Output: text (default), json

How It Works:
  - Files < sample-size: Full hash (same as 'wnb hash')
  - Files >= sample-size: Hash first N MB + last N MB + middle

Examples:
  wnb fast large-video.mp4
  wnb fast ./videos -r
  wnb fast ./data --sample-size 100
```

### `wnb diagnose`

System diagnostics and capability check.

```
wnb diagnose [options]

Options:
  -v, --verbose         Detailed output
  -f, --format          Output: text (default), json

Output:
  BLAKE3 Support
  ├── Native b3sum: /opt/homebrew/bin/b3sum (v1.5.0)
  └── WASM fallback: blake3@3.0.0

  Algorithms
  ├── BLAKE3:   AVAILABLE (native)
  ├── SHA-256:  AVAILABLE (crypto)
  └── SHA-512:  AVAILABLE (crypto)

  ID Generation
  ├── UUID:     AVAILABLE (uuid@9.0.0)
  └── ULID:     AVAILABLE (ulid@2.3.0)

  System
  ├── Platform: linux x64
  ├── Node.js:  v20.10.0
  ├── CPUs:     8 cores
  └── Memory:   32GB

  Network Mounts Detected
  ├── /mnt/nas: SMB (CIFS)
  └── /mnt/nfs: NFS

  Recommended Settings
  ├── Default concurrency: 7
  ├── Network concurrency: 2
  └── Buffer size (network): 1MB

Examples:
  wnb diagnose
  wnb diagnose -v -f json
```

---

## Features from Best Practices Audit

### `.wnbignore` File

Gitignore-style patterns for excluding files from operations.

```
# .wnbignore example
*.log
*.tmp
.git/
.DS_Store
node_modules/
*.partial
Thumbs.db
```

Loaded automatically from:
1. `<directory>/.wnbignore`
2. `~/.config/wnb/.wnbignore` (global)

### Output Formats

| Format | Flag | Description |
|--------|------|-------------|
| text | `-f text` | Human-readable (default) |
| json | `-f json` | Machine-readable, streamable |
| csv | `-f csv` | Spreadsheet import |
| bsd | `-f bsd` | BSD checksum style |
| sfv | `-f sfv` | Simple File Verification |

### HDD Mode

For mechanical hard drives, use `--hdd` to switch from parallel to sequential processing:

```bash
wnb hash ./data -r --hdd
```

This prevents seek thrashing on rotational media.

### Fast Mode Sampling

For quick approximations on large files (video, disk images):

```bash
wnb fast ./videos -r
```

Samples first 300MB + middle 300MB + last 300MB for files over threshold.

### Embedded Hash in Filename

RHash-style feature to embed hash in filename:

```bash
wnb rename photo.jpg --embed
# Result: photo.a1b2c3d4e5f67890.jpg
```

---

## Native b3sum Detection

Search paths (in order):
1. `$WNB_NATIVE_B3SUM` environment variable
2. `/opt/homebrew/bin/b3sum` (macOS ARM64)
3. `/usr/local/bin/b3sum` (macOS Intel, Linux manual install)
4. `/usr/bin/b3sum` (Linux package manager)
5. `b3sum` in PATH
6. WASM fallback (always available)

---

## Network Path Detection

Auto-detected patterns:

```typescript
const NETWORK_PATTERNS = [
  /^\/Volumes\//,           // macOS mounted volumes
  /^\/mnt\//,               // Linux mounts
  /^\/media\//,             // Linux automounts
  /^\/run\/user\/.*\/gvfs/, // GNOME virtual filesystem
  /^\/net\//,               // BSD-style automounts
  /^\\\\/,                  // Windows UNC paths
  /^\/\/[^/]+\//            // SMB-style paths
];
```

When network path detected:
- Buffer size: 1MB (vs 64KB)
- Concurrency: 2 (vs CPU cores - 1)
- Retry logic: Enabled with exponential backoff
- Inter-operation delay: 50ms

---

## Retry Logic

For network operations:

```typescript
const RETRYABLE_ERRORS = [
  'EAGAIN', 'ECONNRESET', 'ETIMEDOUT', 'EBUSY', 'EIO',
  'ENETUNREACH', 'EPIPE', 'ENOTCONN', 'EHOSTDOWN',
  'EHOSTUNREACH', 'ENETDOWN', 'ECONNABORTED', 'ESTALE', 'ENOENT'
];

const RETRY_CONFIG = {
  attempts: 3,
  baseDelayMs: 1000,        // 1s, 2s, 4s (exponential)
  maxDelayMs: 10000,
  networkDelayMs: 50        // Between operations
};
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WNB_NATIVE_B3SUM` | (auto) | Path to b3sum binary |
| `WNB_FORCE_WASM` | `false` | Skip native detection |
| `WNB_CONCURRENCY` | (auto) | Default parallel workers |
| `WNB_NETWORK_CONCURRENCY` | `2` | Workers for network ops |
| `WNB_BUFFER_SIZE` | `65536` | Default buffer size |
| `WNB_NETWORK_BUFFER_SIZE` | `1048576` | Buffer for network I/O |
| `WNB_RETRY_COUNT` | `3` | Network retry attempts |
| `WNB_NETWORK_DELAY` | `50` | ms delay between network ops |

### Config File

`~/.config/wnb/config.json`:

```json
{
  "nativeB3sum": "/opt/homebrew/bin/b3sum",
  "concurrency": 8,
  "networkConcurrency": 2,
  "bufferSize": 65536,
  "networkBufferSize": 1048576,
  "retryCount": 3,
  "networkDelayMs": 50,
  "defaultFormat": "text",
  "defaultAlgorithm": "blake3"
}
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error / hash mismatch |
| 2 | File not found |
| 3 | Invalid input (bad hash format, etc.) |
| 4 | Network error (after retries exhausted) |
| 5 | Aborted by user |
| 10 | Audit failed: mismatches |
| 11 | Audit failed: missing files |
| 12 | Audit failed: extra files (--strict) |
| 13 | Audit failed: duplicates |
| 20 | Sidecar: file not found |
| 21 | Sidecar: integrity check failed |
| 22 | Sidecar: parse error |
| 23 | Sidecar: missing (--audit mode) |
| 30 | Device: detection failed |
| 31 | Device: not a mounted volume |

---

## Source Code Reference

### From abandoned-archive

| Original File | Extracts To | Key Functions |
|---------------|-------------|---------------|
| `services/crypto-service.ts` | `core/hasher.ts` | `calculateHash`, native/WASM detection |
| `services/integrity-service.ts` | `core/verifier.ts` | `verifyFile`, `generateManifest` |
| `services/import/copier.ts` | `services/copier.ts` | Network-safe copy, inline hash |
| `services/import/validator.ts` | `services/validator.ts` | Post-copy verification |
| `services/import/hasher.ts` | `services/hasher.ts` | Batch processing |
| `services/worker-pool.ts` | `services/worker-pool.ts` | Thread pool |
| `workers/hash.worker.ts` | `workers/hash.worker.ts` | Worker thread |
| `domain/media.ts` | `schemas/index.ts` | Zod hash schemas |

### From nightfoxfilms

| Original File | Extracts To | Key Functions |
|---------------|-------------|---------------|
| `services/hash-service.ts` | `core/hasher.ts` | `calculateHashBatch` |
| `services/import-controller.ts` | `services/importer.ts` | Pipeline orchestration |
| `services/import/copy-service.ts` | `services/copier.ts` | Network-safe copy |
| `services/import/validator-service.ts` | `services/validator.ts` | Validation with retry |

---

## Testing

### Test Commands

```bash
npm test                      # All tests
npm test -- --watch          # Watch mode
npm test src/core/hasher     # Specific file
npm run test:integration     # Integration tests (needs fixtures)
```

### Key Test Cases

1. **Algorithm consistency**: BLAKE3 native vs WASM identical output
2. **Hash format validation**: All lengths/patterns correct
3. **Network detection**: SMB/NFS paths identified
4. **Retry logic**: Transient failures recovered
5. **Atomic copy**: Temp file cleanup on failure
6. **Manifest round-trip**: Generate → save → load → verify
7. **Concurrency**: No race conditions
8. **Large files**: Streaming works for multi-GB
9. **Abort handling**: Clean shutdown on Ctrl+C
10. **ID generation**: UUID/ULID format compliance

---

## Roadmap

### Phase 1: Core CLI
- [ ] Project setup (package.json, tsconfig)
- [ ] Core hasher (BLAKE3 native + WASM, SHA-256, SHA-512)
- [ ] ID generator (BLAKE3-id, UUID, ULID)
- [ ] Verify command
- [ ] Manifest generate/check
- [ ] Basic output formats (text, json)

### Phase 2: Network Operations
- [ ] Network-safe copy with inline hash
- [ ] Import pipeline (basic)
- [ ] Session persistence/resume
- [ ] Audit command with verbosity

### Phase 3: XMP Sidecar & Device Detection ✅
- [x] XMP sidecar writer (XML generation)
- [x] XMP sidecar reader (parsing & validation)
- [x] `wnb sidecar` command
- [x] `wnb device` command
- [x] `wnb meta` command
- [x] Source device detection (macOS)
- [x] Source device detection (Linux)
- [x] Source device detection (Windows)
- [x] USB fingerprinting
- [x] Card reader detection
- [x] SD card serial extraction
- [ ] Camera body serial (gphoto2/PTP) - Future
- [x] Related file detection (Live Photo, RAW+JPEG)

### Phase 3b: Metadata Extraction Stack ✅
- [x] ExifTool wrapper (via exiftool-vendored, bundled)
- [x] ffprobe wrapper (optional, uses system ffprobe)
- [x] MediaInfo wrapper (optional, uses system mediainfo)
- [x] Category-based tool routing
- [x] Metadata normalization to XMP

**Available Extractors:**
- ExifTool: Always available (bundled via exiftool-vendored)
- ffprobe: Optional (detects if installed)
- MediaInfo: Optional (detects if installed)

### Phase 4: Import Pipeline (Full) ✅
- [x] BLAKE3-16 file renaming (--rename flag)
- [x] Preserve original name (default, use --rename to hash-name)
- [x] `--sidecar` flag (generate XMP sidecars)
- [x] `--batch` flag (batch naming)
- [x] `--operator` flag
- [x] `--detect-device` flag
- [x] `--extract-meta` flag
- [x] Source type auto-detection
- [ ] XMP embedding (JPEG, MP4, etc.) - Future
- [ ] Existing sidecar ingestion - Future

### Phase 5: Advanced Features
- [ ] `.wnbignore` support
- [ ] Fast mode (sampling)
- [ ] HDD sequential mode
- [ ] Dedup command
- [ ] Rename with embedded hash
- [ ] All output formats (csv, bsd, sfv)
- [ ] File category detection (magic bytes)
- [ ] Quarantine mode

### Phase 6: Polish
- [ ] Global config file
- [ ] Diagnose command
- [ ] Better progress UI
- [ ] npm/homebrew distribution
- [ ] MCP server for Claude Code

### Phase 7: GUI (Deferred)
- See `design/gui-dashboard-spec.md`
- Braun Design Language
- CLI-parity

---

## New Services (v0.6.0)

### Camera Fingerprinting

Identify cameras from EXIF metadata, filename patterns, and folder structures using a database of 9,766+ camera signatures.

```typescript
import { CameraFingerprinter } from './services/device/camera-fingerprint.js';

const fingerprinter = new CameraFingerprinter();

// Match from EXIF data
const match = fingerprinter.matchByExif('Canon', 'EOS R5');
// Returns: { id, make, model, category: 'camera_professional', era: 'mirrorless', ... }

// Match from filename pattern
const match = fingerprinter.matchByFilename('A7R5_1234.ARW');
// Returns Sony Alpha 7R V signature

// Match from folder structure
const match = fingerprinter.matchByFolder('/PRIVATE/M4ROOT/CLIP');
// Returns Sony XDCAM signature
```

**Camera Categories:**
- `camera_cinema`: RED, ARRI, Blackmagic
- `camera_professional`: Canon EOS, Sony Alpha, Nikon Z
- `camera_consumer`: Point-and-shoot, compact
- `camera_action`: GoPro, Insta360, DJI Action
- `drone`: DJI Mavic, Mini, Air
- `phone`: iPhone, Pixel, Samsung Galaxy

### Extension Learning

Dynamic extension categorization that learns new file types as encountered.

```typescript
import { ExtensionLearner } from './services/file-type/extension-learner.js';

const learner = new ExtensionLearner('~/.config/blake/extensions');

// Check category (returns 'document' for unknown)
learner.getCategory('.xyz');  // 'document'
learner.getCategory('.mp4');  // 'video'

// Report unknown extension (returns true if first time seen)
learner.reportExtension('.xyz', '/path/to/file.xyz');

// User teaches the system
learner.learn('.xyz', 'video', 'Custom video format');

// Auto-learn with confidence score
learner.autoLearn('.abc', 'audio', 0.8);

// Get statistics
learner.getStats();  // { unknown: 5, learned: 12, userLearned: 3, autoLearned: 9 }
```

### Comprehensive Media Types

400+ file extensions across 10 categories with helper functions.

```typescript
import {
  IMAGE_EXTENSIONS, RAW_EXTENSIONS, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS,
  SIDECAR_EXTENSIONS, EBOOK_EXTENSIONS, GAME_EXTENSIONS, ARCHIVE_EXTENSIONS,
  ALL_MEDIA_EXTENSIONS, ALL_KNOWN_EXTENSIONS,
  getMediaCategory, isMediaExtension, isKnownExtension
} from './services/file-type/media-types.js';

// Category lookup
getMediaCategory('.jpg');   // 'image'
getMediaCategory('.cr3');   // 'raw'
getMediaCategory('.mp4');   // 'video'
getMediaCategory('.epub');  // 'ebook'
getMediaCategory('.nsp');   // 'game'
getMediaCategory('.xyz');   // 'document' (unknown defaults)

// Type guards
isMediaExtension('.mp4');    // true (image/raw/video/audio)
isMediaExtension('.epub');   // false (ebook, not media)
isKnownExtension('.epub');   // true (any recognized category)
```

### USB Vendor Database

50+ USB vendor IDs for cameras, drones, phones, and card readers.

```typescript
import {
  USB_VENDORS, USB_DEVICES, VENDOR_CATEGORIES,
  getVendorName, getDeviceName, getDeviceCategory,
  isCameraVendor, isDroneVendor, isCardReaderVendor,
  parseHexId, formatVidPid
} from './services/device/usb-vendors.js';

// Vendor lookup
getVendorName(1193);         // 'Canon' (0x04a9)
getVendorName(10007);        // 'DJI' (0x2717)

// Device lookup
getDeviceName(1193, 12818);  // 'Canon EOS R5'

// Category checks
getDeviceCategory(1193);     // 'camera_professional'
isCameraVendor(1193);        // true
isDroneVendor(10007);        // true

// Hex parsing (from system_profiler output)
parseHexId('0x04a9');                    // 1193
parseHexId('0x04a9  (Canon Inc.)');      // 1193
formatVidPid(1193, 12818);               // '04a9:3212'
```

### Storage Pattern Detection

Detect storage type and configure I/O accordingly.

```typescript
import {
  detectStorageType, getStorageConfig, detectCameraFromFolder, getVolumeName,
  CAMERA_FOLDER_PATTERNS, FILENAME_PATTERNS
} from './services/device/storage-patterns.js';

// Storage type detection
detectStorageType('smb://server/share');         // 'network'
detectStorageType('/Volumes/Macintosh HD');      // 'local'
detectStorageType('/Volumes/SDCARD/DCIM');       // 'camera_media'

// Get optimized I/O config
const config = getStorageConfig('/Volumes/SDCARD');
// { type: 'camera_media', concurrency: 2, bufferSize: 256KB, operationDelayMs: 10 }

// Camera detection from folder patterns
detectCameraFromFolder('/PRIVATE/M4ROOT/CLIP'); // 'sony'
detectCameraFromFolder('/DCIM/100CANON');       // 'canon'
detectCameraFromFolder('/DCIM/100GOPRO');       // 'gopro'
```

### Pro Camera XML Sidecar Parsing

Extract metadata from professional camera XML sidecars.

```typescript
import {
  parseXmlSidecar, detectSidecarType,
  parseSonyXdcamXml, parseCanonXfXml, parseArriXml
} from './services/metadata/xml-sidecar.js';

// Auto-detect and parse
const result = await parseXmlSidecar('/path/to/M01.XML');
// Returns: {
//   type: 'sony_xdcam',
//   camera: 'Sony FX6',
//   lens: 'FE 24-70mm F2.8 GM',
//   timecode: '10:23:45:12',
//   reel: 'A001',
//   scene: 'Scene 1',
//   take: 'Take 3',
//   ...
// }
```

### Shared Registry (Cross-App Config)

Configuration shared across all blake-family apps at `~/.config/blake/`.

```typescript
import { SharedRegistry } from './services/device/shared-registry.js';

const registry = SharedRegistry.getInstance();

// Camera signatures (9,766+ cameras)
const cameras = registry.getCameraSignatures();

// Extension types
const types = registry.getExtensionTypes();

// Add custom extension
registry.addExtensionType('.xyz', 'video', 'Custom format');

// Sync from GitHub (if configured)
await registry.syncFromRemote();
```

**Registry Structure:**
```
~/.config/blake/
├── camera-signatures/
│   └── canonical.json    # 9,766+ cameras
├── extension-types/
│   ├── builtin.json      # Default types
│   └── learned.json      # User-learned types
└── sync.json             # Sync configuration
```

---

## Programmatic API

### runImport() Options

The `runImport()` function is the core import pipeline that can be called programmatically:

```typescript
import { runImport } from 'wake-n-blake';

const session = await runImport(source, destination, options);
```

#### Integration Options (v0.1.3+)

For external apps like Abandoned Archive that need custom behavior:

```typescript
interface ImportOptions {
  // ... standard options ...

  /**
   * Custom path builder for destination files.
   * If provided, overrides default relative path preservation.
   * Receives the file state and computed hash, returns the full destination path.
   */
  pathBuilder?: (file: ImportFileState, hash: string) => string;

  /**
   * Pre-existing hashes to skip (for dedup against external database).
   * If provided and dedup is true, these hashes are checked INSTEAD of scanning destination.
   * This is faster for large archives where DB lookup beats full directory hash scan.
   */
  existingHashes?: Set<string>;
}
```

#### Example: Abandoned Archive Integration

```typescript
import { runImport } from 'wake-n-blake';
import path from 'node:path';

// Get existing hashes from database (much faster than scanning)
const existingHashes = new Set(
  await db.selectFrom('imgs').select('imghash').execute().map(r => r.imghash)
);

const session = await runImport(sourcePath, archivePath, {
  // Core options
  sidecar: true,
  detectDevice: true,
  extractMeta: true,
  verify: true,

  // Custom path builder for location-based folder structure
  pathBuilder: (file, hash) => {
    const ext = path.extname(file.path);
    const mediaType = file.category === 'video' ? 'org-video' : 'org-images';
    return path.join(archivePath, 'locations', state, locid, 'data', mediaType, `${hash}${ext}`);
  },

  // Use database for dedup (faster than scanning destination)
  existingHashes,

  // Callbacks for integration
  onFile: async (file, action) => {
    if (action === 'validated') {
      // Insert into database from XMP sidecar
      await xmpMapper.mapXmpToDatabase(file.sidecarPath, locid);
      // Queue thumbnail job
      await jobQueue.add('thumbnail', { path: file.destPath });
    }
  }
});
```

This reduces the entire import pipeline to a single `runImport()` call with ~15 lines of integration code.

---

## XMP Pipeline Integration

wake-n-blake is the **first stage** in the media processing pipeline. It creates XMP sidecars that downstream tools (shoemaker, visual-buffet) will extend.

### Pipeline Order (CRITICAL)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  wake-n-blake   │ ──► │    shoemaker    │ ──► │  visual-buffet  │
│   (import)      │     │  (thumbnails)   │     │   (ML tags)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
    wnb: data             shoemaker: data         vbuffet: data
    (provenance)          (thumbnails)            (ML tags)
```

**wake-n-blake MUST run first** because it creates the initial XMP sidecar with:
- Content hash (BLAKE3)
- File provenance (source path, device, host)
- Chain of custody (initial ingestion event)
- Related file groupings (Live Photos, RAW+JPEG pairs)

### Namespace: `wnb:`

```
Namespace URI: http://wake-n-blake.dev/xmp/1.0/
Prefix: wnb
Current Schema Version: 3
```

### XMP Sidecar Naming

All tools in the pipeline use the same naming convention:
```
{filename}.xmp     # Sidecar for {filename}
IMG_1234.jpg.xmp   # Example
```

### For Downstream Tools (shoemaker, visual-buffet)

When modifying XMP sidecars created by wake-n-blake:

1. **Use ExifTool** (not raw file writes) to preserve unknown namespaces
2. **Add custody event** when modifying:
   ```xml
   <wnb:CustodyChain>
     <rdf:Seq>
       <rdf:li rdf:parseType="Resource">
         <wnb:EventID>01HQXYZ...</wnb:EventID>
         <wnb:EventTimestamp>2025-12-23T10:30:00Z</wnb:EventTimestamp>
         <wnb:EventAction>metadata_modification</wnb:EventAction>
         <wnb:EventOutcome>success</wnb:EventOutcome>
         <wnb:EventTool>shoemaker/0.1.9</wnb:EventTool>
         <wnb:EventNotes>Added thumbnail metadata</wnb:EventNotes>
       </rdf:li>
     </rdf:Seq>
   </wnb:CustodyChain>
   ```
3. **Increment `wnb:EventCount`**
4. **Update `wnb:SidecarUpdated`** timestamp

### Related Files

wake-n-blake detects and groups related files:
- Live Photos (image + video pairs)
- RAW+JPEG pairs
- Burst sequences
- HDR brackets

Downstream tools should check `wnb:RelationType` and `wnb:IsPrimaryFile` to avoid duplicate processing.

### Known Issue: Overwrite Behavior

**CURRENT**: `writeSidecar()` completely overwrites the XMP file.
**TODO**: Implement merge logic to preserve non-wnb namespaces when XMP already exists.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.3 | 2025-12-23 | Added `pathBuilder` and `existingHashes` options for external app integration |
| 0.6.0 | 2025-12-23 | Camera fingerprinting (9,766 cameras), extension learning, USB vendors, storage patterns, XML sidecar parsing, shared registry, XMP schema v3 |
| 0.5.0 | 2025-12-22 | Full test suite (96 tests), XMP hash validation fix, case-insensitive file matching |
| 0.4.0 | 2025-12-22 | Added `wnb meta`, metadata extraction stack (ExifTool, MediaInfo, ffprobe, etc.) |
| 0.3.0 | 2025-12-22 | Added XMP sidecar, `wnb sidecar`, `wnb device`, source device detection |
| 0.2.0 | 2024-12-21 | Added multi-algorithm, UUID/ULID, best practices audit |
| 0.1.0 | 2024-12-21 | Initial specification |
