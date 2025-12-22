# Wake-n-Blake Technical Guide v0.2.0

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
wnb import <src> <dst>               # Full pipeline: scan→hash→copy→validate
wnb import <src> <dst> --resume      # Resume from checkpoint
wnb import <src> <dst> --dedup       # Skip duplicates by hash

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
│   │   │   ├── import.ts    # wnb import
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
│   │   └── worker-pool.ts   # Parallel processing
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
    "blake3": "^3.0.0",
    "commander": "^12.0.0",
    "zod": "^3.23.0",
    "p-queue": "^8.0.0",
    "uuid": "^9.0.0",
    "ulid": "^2.3.0",
    "ignore": "^5.3.0",
    "ora": "^8.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/uuid": "^9.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0",
    "tsx": "^4.0.0"
  }
}
```

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

Full import pipeline with deduplication.

```
wnb import <source> <destination> [options]

Arguments:
  source                Source directory
  destination           Destination directory

Options:
  --dry-run             Show what would happen
  --resume              Resume from last checkpoint
  --dedup               Skip files that already exist by hash
  --duplicates          Strategy: skip (default), overwrite, rename
  -p, --parallel        Parallel operations (default: auto)
  --manifest            Generate manifest after import
  -q, --quiet           Minimal output

Pipeline Stages:
  1. SCAN       [0-5%]    Enumerate source files
  2. HASH       [5-40%]   Compute hashes (skip if network source)
  3. DEDUP      [40-45%]  Check destination for duplicates
  4. COPY       [45-80%]  Network-safe copy with inline hash
  5. VALIDATE   [80-95%]  Re-verify copied files
  6. MANIFEST   [95-100%] Generate manifest (optional)

Examples:
  wnb import /camera-roll /archive/photos
  wnb import /mnt/sd-card /archive --manifest
  wnb import /network/share /local --resume
  wnb import ./data /backup --dedup
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
- [ ] Import pipeline
- [ ] Session persistence/resume
- [ ] Audit command with verbosity

### Phase 3: Advanced Features
- [ ] `.wnbignore` support
- [ ] Fast mode (sampling)
- [ ] HDD sequential mode
- [ ] Dedup command
- [ ] Rename with embedded hash
- [ ] All output formats (csv, bsd, sfv)

### Phase 4: Polish
- [ ] Global config file
- [ ] Diagnose command
- [ ] Better progress UI
- [ ] npm/homebrew distribution
- [ ] MCP server for Claude Code

### Phase 5: GUI (Deferred)
- See `design/gui-dashboard-spec.md`
- Braun Design Language
- CLI-parity

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.2.0 | 2024-12-21 | Added multi-algorithm, UUID/ULID, best practices audit |
| 0.1.0 | 2024-12-21 | Initial specification |
