# Wake-n-Blake

Universal BLAKE3 hashing, verification, and file provenance CLI.

## Installation

```bash
npm install -g wake-n-blake
```

Or use directly with npx:

```bash
npx wake-n-blake hash myfile.txt
```

## Features

- **BLAKE3 Hashing**: Fast, cryptographically secure hashing
- **File Verification**: Verify files against known hashes
- **Import Pipeline**: Copy files with hashing, deduplication, and verification
- **XMP Sidecars**: Generate provenance sidecars with chain-of-custody tracking
- **Device Detection**: Identify source devices (cameras, cards, phones)
- **Metadata Extraction**: Extract EXIF, video, and audio metadata
- **Related Files**: Detect Live Photos, RAW+JPEG pairs, and more

## Commands

### Hashing

```bash
# Hash a file (BLAKE3, 16-char)
wnb hash photo.jpg

# Full 64-char hash
wnb hash --full photo.jpg

# Hash with different algorithm
wnb hash --algo sha256 photo.jpg

# Hash entire directory
wnb hash ./photos/
```

### Verification

```bash
# Verify file against expected hash
wnb verify photo.jpg abc123def456...
```

### Import Pipeline

```bash
# Basic import with verification
wnb import /source/path /dest/path

# Import with all XMP features
wnb import /Volumes/SDCARD /archive/photos \
  --sidecar \
  --detect-device \
  --extract-meta \
  --rename \
  --batch "Wedding 2024" \
  --operator "John Doe"

# Import with deduplication
wnb import /source /dest --dedup

# Generate manifest after import
wnb import /source /dest --manifest

# Dry run (preview only)
wnb import /source /dest --dry-run
```

#### Import Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview without copying |
| `--resume` | Resume from checkpoint |
| `--dedup` | Skip duplicate files |
| `--manifest` | Generate manifest.json |
| `--no-verify` | Skip verification |
| `--sidecar` | Generate XMP sidecar files |
| `--detect-device` | Detect source device |
| `--extract-meta` | Extract file metadata |
| `--rename` | Rename to BLAKE3-16 format |
| `--batch <name>` | Batch name for import |
| `--operator <name>` | Operator name |
| `--exclude <pattern>` | Exclude patterns |

### XMP Sidecars

```bash
# Generate sidecar for a file
wnb sidecar generate photo.jpg

# Read existing sidecar
wnb sidecar read photo.jpg.xmp

# Verify sidecar integrity
wnb sidecar verify photo.jpg.xmp

# Add custody event
wnb sidecar event photo.jpg.xmp --action fixity_check
```

#### Custody Event Actions (PREMIS-aligned)

- `ingestion` - Initial import/capture
- `fixity_check` - Hash verification
- `migration` - Format conversion
- `replication` - Copy to new location
- `modification` - Content change
- `metadata_modification` - Metadata update
- `access` - File accessed/viewed
- `deletion` - File removed

### Device Detection

```bash
# List removable volumes
wnb device list

# Detect device for a path
wnb device detect /Volumes/SDCARD

# Show detailed device info
wnb device info /Volumes/SDCARD
```

Detects:
- USB device fingerprint (VID:PID, serial)
- Card reader info
- Media info (SD, CF, CFexpress)
- Camera body serial (from EXIF)

### Metadata Extraction

```bash
# Extract metadata from files
wnb meta photo.jpg video.mp4

# Quick mode (skip slow extractors)
wnb meta --quick large_video.mov

# Include device serials
wnb meta --device photo.jpg

# Show available extraction tools
wnb meta --tools
```

Extracts:
- **Photos**: Camera, lens, exposure, GPS, color space
- **Videos**: Codec, resolution, frame rate, duration
- **Audio**: Artist, album, track, duration
- **Documents**: Author, title, page count

### Manifests

```bash
# Generate manifest
wnb manifest ./archive/

# Verify against manifest
wnb check ./archive/ manifest.json

# Strict audit
wnb audit ./archive/ manifest.json

# Compare manifests
wnb diff manifest1.json manifest2.json
```

### ID Generation

```bash
# BLAKE3-based ID (16 hex chars)
wnb id

# UUID v4
wnb uuid

# ULID (sortable)
wnb ulid
```

### Deduplication

```bash
# Find duplicates
wnb dedup ./photos/

# With actions
wnb dedup ./photos/ --action list
```

### Rename

```bash
# Rename files with hash prefix
wnb rename ./photos/
```

## XMP Sidecar Format

Wake-n-Blake generates XMP sidecars with:

- **Core Identity**: BLAKE3 hash (full + short), file size
- **Source Provenance**: Original path, host, volume
- **Device Chain**: USB, card reader, media, camera serials
- **Timestamps**: Original mtime, import time
- **Custody Chain**: PREMIS-aligned event log
- **Metadata**: Photo/video/audio/document-specific fields

Example sidecar structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:wnb="http://wake-n-blake.dev/xmp/1.0/">
    <rdf:Description>
      <wnb:ContentHash>abcdef1234567890...</wnb:ContentHash>
      <wnb:HashAlgorithm>blake3</wnb:HashAlgorithm>
      <wnb:FileSize>2048576</wnb:FileSize>
      <wnb:SourcePath>/Volumes/SDCARD/DCIM/IMG_001.CR2</wnb:SourcePath>
      <wnb:SourceType>memory_card</wnb:SourceType>
      <wnb:CustodyChain>
        <rdf:Seq>
          <rdf:li>
            <wnb:EventAction>ingestion</wnb:EventAction>
            <wnb:EventTimestamp>2024-01-15T10:30:00Z</wnb:EventTimestamp>
            <wnb:EventOutcome>success</wnb:EventOutcome>
          </rdf:li>
        </rdf:Seq>
      </wnb:CustodyChain>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
```

## Source Types

| Type | Description |
|------|-------------|
| `memory_card` | SD, CF, CFexpress via card reader |
| `camera_direct` | Camera connected via USB |
| `phone_direct` | Phone connected via USB/MTP |
| `local_disk` | Internal or external drive |
| `network_share` | SMB, NFS, AFP mount |
| `cloud_sync` | Dropbox, Google Drive, iCloud |
| `unknown` | Could not determine |

## Requirements

- Node.js 18+
- Optional: ExifTool (bundled via exiftool-vendored)
- Optional: ffprobe (for detailed video metadata)
- Optional: MediaInfo (for codec details)

## Using as a Library

Wake-n-Blake exports all core functions for programmatic use:

```typescript
import {
  // Hashing
  hashFile, hashBuffer, hashString, verifyFile,

  // ID Generation
  generateBlake3Id, generateUuid, generateULID,

  // File Operations
  copyWithHash, fastHash,

  // Import Pipeline
  runImport,

  // XMP Sidecars
  writeSidecar, readSidecar, verifySidecar,

  // Device Detection
  detectSourceDevice, getRemovableVolumes,

  // Schemas & Types
  Blake3HashSchema, type HashResult, type ImportSession
} from 'wake-n-blake';

// Hash a file
const result = await hashFile('/path/to/file', 'blake3');
console.log(result.hash);  // '1234567890abcdef'

// Run import pipeline
const session = await runImport('/source', '/destination', {
  dedup: true,
  sidecar: true,
  onProgress: (s) => console.log(s.processedFiles)
});
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for full API documentation.

## Additional Commands

### Safe Copy

```bash
# Copy with inline hashing and verification
wnb copy source.jpg dest.jpg

# Copy without verification
wnb copy source.jpg dest.jpg --no-verify
```

### Fast Hash (Sampling)

```bash
# Quick hash for large files (samples beginning, middle, end)
wnb fast largefile.iso

# Useful for deduplication pre-screening
wnb fast *.iso --format json
```

### Diagnostics

```bash
# System info and available tools
wnb diagnose

# Check blake3 performance
wnb diagnose --benchmark
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error / hash mismatch |
| 2 | File not found |
| 3 | Invalid input |
| 4 | Partial failure (some files errored) |
| 5 | Aborted by user |

## Configuration

### .wnbignore

Create a `.wnbignore` file to exclude patterns:

```
# Ignore system files
.DS_Store
Thumbs.db
*.tmp

# Ignore directories
node_modules/
.git/
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WNB_BUFFER_SIZE` | Buffer size for local files | 64KB |
| `WNB_NETWORK_BUFFER` | Buffer size for network files | 256KB |
| `WNB_WORKERS` | Worker pool size | CPU count |

## Troubleshooting

### "blake3 native not found"

This is informational only. Wake-n-Blake uses WASM blake3 by default.
For maximum speed, install native b3sum:

```bash
# macOS
brew install b3sum

# Linux
cargo install b3sum

# Windows
scoop install b3sum
```

### Slow imports over network

Use smaller batch sizes and increase buffer:

```bash
WNB_NETWORK_BUFFER=1048576 wnb import /network/share /local
```

### Permission errors on macOS

Grant Full Disk Access to Terminal/iTerm in System Preferences > Privacy.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run in dev mode
npm run dev

# Type check
npm run typecheck
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for architecture and contribution guide.

## License

MIT
