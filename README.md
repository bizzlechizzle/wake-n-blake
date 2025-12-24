# Wake-n-Blake

Universal BLAKE3 hashing, verification, and file provenance CLI for professional media workflows.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Version](https://img.shields.io/badge/version-0.1.2-blue.svg)](package.json)

## Features

- **Multi-algorithm hashing**: BLAKE3 (native + WASM), SHA-256, SHA-512, MD5, xxHash64
- **File provenance**: XMP sidecars with PREMIS-aligned chain of custody
- **Professional formats**: MHL (Media Hash List), BagIt (RFC 8493)
- **Device detection**: Automatic source device fingerprinting (USB, cards, cameras)
- **Camera fingerprinting**: 9,766+ camera signatures for identification from EXIF, filenames, folders
- **GPS enrichment**: Match photos/videos to GPS tracks (KML, GPX, GeoJSON)
- **Perceptual hashing**: Find similar images with dHash/aHash/pHash
- **Extension learning**: Dynamic file type categorization with user feedback loop
- **400+ media types**: Comprehensive coverage of image, video, audio, RAW, sidecar, ebook, game, archive formats
- **Network-aware**: Optimized for SMB/NFS with automatic retry logic
- **Cross-app config**: Shared registry at `~/.config/blake/` for camera DB, extension types
- **Library-first**: All 70+ functions available for programmatic use

## Installation

```bash
# Global CLI
npm install -g wake-n-blake

# Project dependency
npm install wake-n-blake
```

### Optional: Native BLAKE3 (2-5x faster)

```bash
# macOS
brew install b3sum

# Linux
cargo install b3sum
```

## Quick Start

```bash
# Hash a file
wnb hash myfile.mov

# Verify integrity
wnb verify myfile.mov abc123def456

# Generate MHL for post-production handoff
wnb mhl /footage -o footage.mhl -a both

# Import with full provenance tracking
wnb import /DCIM /archive --sidecar --detect-device --extract-meta

# Create archival package
wnb bagit /archive --source-org "MyStudio"
```

---

## CLI Reference

### Hashing

#### `wnb hash` - Compute file hashes
```bash
wnb hash <path> [options]

Options:
  -a, --algorithm <alg>   blake3|sha256|sha512|md5|xxhash64|all (default: blake3)
  --full                  64-char BLAKE3 instead of 16-char
  -r, --recursive         Hash directories recursively
  -f, --format <fmt>      text|json|csv|bsd|sfv (default: text)
  -p, --parallel <n>      Worker count (default: CPU-1)
  --hdd                   Sequential mode for mechanical drives
  --native                Force native b3sum
  --wasm                  Force WASM mode
  -q, --quiet             Output hash only

Examples:
  wnb hash video.mp4                    # BLAKE3 hash (16 chars)
  wnb hash video.mp4 --full             # Full 64-char hash
  wnb hash video.mp4 -a xxhash64        # xxHash64 (MHL-compatible)
  wnb hash /footage -a all -r           # All algorithms, recursive
  wnb hash /footage -r -f json          # JSON output
```

#### `wnb verify` - Verify file integrity
```bash
wnb verify <file> <hash> [options]

Options:
  -a, --algorithm <alg>   Algorithm (auto-detected from hash length)
  -q, --quiet             Exit code only

Exit codes: 0=match, 1=mismatch, 2=not found, 3=error
```

#### `wnb copy` - Copy with inline hashing
```bash
wnb copy <source> <destination> [options]

Options:
  -a, --algorithm <alg>   Hash algorithm (default: blake3)
  --no-verify             Skip post-copy verification
  --overwrite             Overwrite existing files
  --move                  Move instead of copy
  -r, --recursive         Copy directories
```

#### `wnb fast` - Sample-based hashing for large files
```bash
wnb fast <path> [options]

Options:
  --sample-size <mb>      Sample size (default: 300MB)
  --threshold <mb>        Min file size to sample (default: 1GB)
  -r, --recursive         Process directories
```

---

### ID Generation

#### `wnb id` - BLAKE3-based unique IDs
```bash
wnb id [options]

Options:
  --full           64-char ID instead of 16-char
  -n, --count <n>  Generate multiple IDs
  --from <input>   Deterministic ID from input
```

#### `wnb uuid` - UUID generation (v1, v4, v5, v7)
```bash
wnb uuid [options]

Options:
  -v, --version <v>       1|4|5|7 (default: 4, recommend v7 for databases)
  -n, --namespace <ns>    dns|url|oid|x500|<uuid> (for v5)
  --name <name>           Name for v5 (requires namespace)
  -c, --count <n>         Generate multiple
```

#### `wnb ulid` - ULID generation (sortable, 26-char)
```bash
wnb ulid [options]

Options:
  -t, --timestamp <iso>   Custom timestamp
  -c, --count <n>         Generate multiple
  --monotonic             Monotonic mode for same-ms ordering
  --decode <ulid>         Decode ULID timestamp
```

---

### Manifests

#### `wnb manifest` - Generate file manifest
```bash
wnb manifest <dir> [options]

Options:
  -o, --output <path>     Output file (default: manifest.json)
  --update                Add new files only (incremental)
  --exclude <pattern...>  Patterns to exclude
  -f, --format            json|csv
```

#### `wnb check` - Verify against manifest
```bash
wnb check <dir> <manifest> [-q] [-v] [-f json]
```

#### `wnb audit` - Strict verification
```bash
wnb audit <dir> <manifest> [--strict] [-v]
```

#### `wnb diff` - Compare manifests
```bash
wnb diff <manifest1> <manifest2> [-f json]
```

---

### File Operations

#### `wnb dedup` - Find/handle duplicates
```bash
wnb dedup <dir> [options]

Options:
  -r, --recursive         Recursive scan
  --min-size <bytes>      Minimum file size
  --action <action>       report|link|delete (default: report)
  --dry-run               Preview changes
  --exclude <pattern...>  Patterns to exclude

Examples:
  wnb dedup /photos                         # Find duplicates
  wnb dedup /photos --action link --dry-run # Preview hardlinking
```

#### `wnb rename` - Embed hash in filename
```bash
wnb rename <path> [options]

Options:
  --pattern <p>     Name pattern (default: {name}.{hash}.{ext})
  --dry-run         Preview changes
  -r, --recursive   Process directories
  --full            Use full 64-char hash
```

---

### Import Pipeline

#### `wnb import` - Full import with provenance
```bash
wnb import <source> <destination> [options]

Options:
  --dry-run               Preview import
  --resume                Resume from checkpoint
  --dedup                 Skip duplicates
  --manifest              Generate manifest
  --no-verify             Skip verification
  --exclude <pattern...>  Patterns to exclude
  --sidecar               Generate XMP sidecars
  --detect-device         Detect source device
  --extract-meta          Extract metadata
  --rename                Rename with hash
  --batch <name>          Batch identifier
  --operator <name>       Operator name

Examples:
  # Full provenance import from camera card
  wnb import /Volumes/DCIM /archive \
    --sidecar --detect-device --extract-meta \
    --batch "Wedding 2024" --operator "John Doe"

  # Quick import with deduplication
  wnb import /source /dest --dedup --manifest
```

---

### XMP Sidecars

#### `wnb sidecar generate` - Create provenance sidecars
```bash
wnb sidecar generate <files...> [options]

Options:
  -f, --force             Overwrite existing
  -d, --detect-device     Include device info
  -s, --session <id>      Session identifier
  -b, --batch <name>      Batch name
```

#### `wnb sidecar read` - Display sidecar contents
```bash
wnb sidecar read <file> [-s section] [-o json]

Sections: identity|classification|provenance|device|timestamps|custody
```

#### `wnb sidecar verify` - Verify integrity
```bash
wnb sidecar verify <file> [-c] [-o json]

Options:
  -c, --content   Verify content hash matches file
```

#### `wnb sidecar event` - Add custody event
```bash
wnb sidecar event <file> --action <action> [-n notes]

Actions: ingestion|fixity_check|migration|replication|modification|access|deletion
```

---

### Device Detection

#### `wnb device list` - List removable volumes
```bash
wnb device list [-a] [-o json]
```

#### `wnb device detect` - Detect source device
```bash
wnb device detect <path> [-o json]
```

#### `wnb device info` - Detailed device info
```bash
wnb device info <volume>
```

---

### Metadata

#### `wnb meta` - Extract file metadata
```bash
wnb meta <files...> [options]

Options:
  -o, --output <fmt>      text|json
  -q, --quick             Fast mode (skip slow extractors)
  -a, --all               Include all metadata
  -d, --device            Include device info
  -t, --tools             Show available tools
```

---

### Professional Formats

#### `wnb mhl` - Media Hash List (post-production standard)
```bash
wnb mhl <path> [options]

Options:
  -o, --output <path>     Output MHL file
  -a, --algorithm <alg>   xxhash64|md5|both (default: xxhash64)
  --verify                Verify existing MHL
  --base <path>           Base path for verification
  --exclude <pattern...>  Patterns to exclude
  -f, --format            text|json|xml

Examples:
  # Generate MHL with xxhash64 + md5 for maximum compatibility
  wnb mhl /footage -o shoot.mhl -a both

  # Verify MHL on ingest
  wnb mhl shoot.mhl --verify

  # Output XML to stdout
  wnb mhl /footage -f xml
```

#### `wnb bagit` - BagIt packages (RFC 8493)
```bash
wnb bagit <dir> [options]

Options:
  -o, --output <path>     Output bag directory
  -a, --algorithm <alg>   sha256|sha512 (default: sha256)
  --verify                Verify existing bag
  --no-move               Copy instead of move
  --include-hidden        Include hidden files
  --exclude <pattern...>  Patterns to exclude
  --source-org <org>      Source-Organization
  --contact-name <name>   Contact-Name
  --contact-email <email> Contact-Email
  --description <desc>    External-Description
  --identifier <id>       External-Identifier

Examples:
  # Create archival bag
  wnb bagit /archive --source-org "MyStudio" --contact-email "archivist@example.com"

  # Verify existing bag
  wnb bagit /archive.bag --verify
```

---

### Advanced Features

#### `wnb gps enrich` - Add GPS from tracks
```bash
wnb gps enrich <paths...> [options]

Options:
  --from <map>            GPS file (KML, GPX, GeoJSON)
  -s, --strategy <s>      timestamp|nearest|interpolate (default: timestamp)
  -t, --tolerance <sec>   Time tolerance (default: 300 seconds)
  --offset <sec>          Camera clock offset correction
  -r, --recursive         Process directories
  --overwrite             Overwrite existing GPS
  --dry-run               Preview matches

Examples:
  # Enrich photos with GPS from recorded track
  wnb gps enrich /photos --from route.gpx

  # With camera clock offset (camera was 2 minutes ahead)
  wnb gps enrich /photos --from track.kml --offset 120
```

#### `wnb phash` - Perceptual hashing (find similar images)
```bash
wnb phash <paths...> [options]

Options:
  -a, --algorithm <alg>   dhash|ahash|phash (default: dhash)
  -t, --threshold <n>     Distance threshold 0-64 (default: 10, lower=stricter)
  -r, --recursive         Process directories
  --compare               Compare exactly two images
  --hash-only             Output hashes only (no grouping)

Examples:
  # Find similar images
  wnb phash /photos -t 5

  # Compare two images
  wnb phash img1.jpg img2.jpg --compare
```

#### `wnb diagnose` - System diagnostics
```bash
wnb diagnose [-v] [-f json]
```

---

## Library Usage

All 70+ CLI functions are available for programmatic use:

```typescript
import {
  // Hashing
  hashFile, hashBlake3, hashSha256, hashFileAll, verifyFile,
  hashMd5, hashXxhash64,

  // ID Generation
  generateBlake3Id, generateUuid, generateULID,

  // File Operations
  copyWithHash, scanDirectory, findDuplicates, detectFileType,

  // Import Pipeline
  runImport,

  // XMP Sidecars
  writeSidecar, readSidecar, verifySidecar,

  // Device Detection
  detectSourceDevice, getRemovableVolumes,

  // Metadata
  extractMetadata,

  // Professional Formats
  generateMhl, writeMhl, verifyMhl,
  createBag, verifyBag,

  // File Type Detection (400+ extensions)
  getMediaCategory, isMediaExtension, isKnownExtension,

  // Types
  type Algorithm, type HashResult, type XmpSidecar, type ImportSession,
} from 'wake-n-blake';

// Hash a file
const result = await hashFile('/path/to/file.mov', 'blake3');
console.log(result.hash); // "abc123def456..."

// Generate MHL
const mhl = await generateMhl('/footage', { algorithm: 'both' });
await writeMhl(mhl, 'footage.mhl');

// Run import with provenance
const session = await runImport('/source', '/dest', {
  sidecar: true,
  detectDevice: true,
  extractMeta: true,
  onProgress: (s) => console.log(`${s.processedFiles}/${s.totalFiles}`),
});
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for full API documentation.

---

## XMP Sidecar Format

Wake-n-Blake generates XMP sidecars with comprehensive provenance:

- **Core Identity**: BLAKE3 hash (full + short), file size
- **Source Provenance**: Original path, host, volume, source type
- **Device Chain**: USB VID:PID, card reader, media serial, camera body
- **Timestamps**: Original mtime/ctime/btime, import time, timezone
- **Custody Chain**: PREMIS-aligned event log with hash verification
- **Metadata**: Photo/video/audio/document-specific fields

```xml
<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:wnb="http://wake-n-blake.dev/xmp/1.0/">
    <rdf:Description>
      <wnb:ContentHash>abcdef1234567890...</wnb:ContentHash>
      <wnb:HashAlgorithm>blake3</wnb:HashAlgorithm>
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

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WNB_NATIVE_B3SUM` | Path to b3sum binary | Auto-detect |
| `WNB_FORCE_WASM` | Force WASM mode | false |
| `WNB_CONCURRENCY` | Worker count | CPU-1 |
| `WNB_NETWORK_CONCURRENCY` | Network worker count | 2 |
| `WNB_BUFFER_SIZE` | Local buffer size | 1MB |
| `WNB_NETWORK_BUFFER_SIZE` | Network buffer size | 256KB |
| `WNB_RETRY_COUNT` | Network retry attempts | 3 |
| `WNB_FORMAT` | Default output format | text |
| `WNB_ALGORITHM` | Default algorithm | blake3 |

### Config File

`~/.config/wnb/config.json`:

```json
{
  "defaultAlgorithm": "blake3",
  "defaultFormat": "text",
  "concurrency": 8,
  "networkConcurrency": 2,
  "bufferSize": 1048576
}
```

### Ignore Patterns

`.wnbignore` (gitignore syntax):

```
.DS_Store
Thumbs.db
*.tmp
node_modules/
.git/
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Verification failed / mismatch |
| 2 | File not found / invalid path |
| 3 | Invalid arguments / error |
| 4 | Partial success (import with errors) |

---

## Performance Tips

1. **Install native b3sum** - 2-5x faster than WASM
2. **Use `--hdd` for mechanical drives** - Sequential I/O
3. **Tune concurrency** - `WNB_CONCURRENCY=8` for fast NVMe
4. **Network shares** - Auto-detected, uses lower concurrency
5. **Large files** - Use `wnb fast` for sample-based hashing

---

## Troubleshooting

### "blake3 native not found"
Informational only - WASM fallback works. For max speed, install native b3sum.

### Slow network imports
```bash
WNB_NETWORK_BUFFER_SIZE=1048576 wnb import /smb/share /local
```

### Permission errors on macOS
Grant Full Disk Access to Terminal in System Preferences > Privacy.

---

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Run tests
npm run lint         # Lint code
npm run dev          # Dev mode
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for architecture guide.

---

## License

MIT License - see [LICENSE](LICENSE)

---

## Related

- [BLAKE3](https://github.com/BLAKE3-team/BLAKE3) - Cryptographic hash function
- [Media Hash List](https://mediahashlist.org/) - MHL specification
- [BagIt](https://datatracker.ietf.org/doc/html/rfc8493) - RFC 8493
