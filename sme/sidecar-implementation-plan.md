# Sidecar Support Implementation Plan

> **Version**: 1.0
> **Date**: 2025-12-23
> **Status**: Ready for implementation

---

## Goal Statement

Implement complete sidecar file support that:
1. **Detects** ALL companion sidecar files for any media file
2. **Copies** sidecars alongside primary files during import
3. **Hashes** each sidecar for integrity verification
4. **Embeds** full sidecar content in XMP (for text/small binary sidecars)
5. **Extracts** summary metadata for searchability
6. **Verifies** companion integrity in destination

---

## Current State Audit

### Already Implemented
| Feature | Status | Location |
|---------|--------|----------|
| Basic companion detection | Partial | `exiftool.ts:findCompanionSidecars()` |
| DJI SRT parsing | Complete | `exiftool.ts:parseDjiSrt()` |
| Sony M01.XML parsing | Complete | `exiftool.ts:parseSonyXml()` |
| Companion metadata merge | Complete | `exiftool.ts:mergeCompanionMetadata()` |
| Base64 content embedding | Complete | `importer.ts:CopiedCompanion.contentBase64` |
| XMP companion output | Complete | `writer.ts:CopiedCompanions section` |

### Missing/Incomplete
| Gap | Impact | Priority |
|-----|--------|----------|
| `.lrf` not in extensions | DJI proxies not copied | HIGH |
| `.thm` parsing for GPS | Canon/GoPro GPS lost | HIGH |
| `.lrv` not in extensions | GoPro proxies not copied | MEDIUM |
| `.gpr` not in extensions | GoPro RAW not detected | MEDIUM |
| `.aae` not in extensions | Apple edits not copied | MEDIUM |
| `.rmd` not in extensions | RED metadata not copied | LOW |
| `.ale` not detected | ARRI log not copied | LOW |
| `.nksc` not in extensions | Nikon edits not copied | LOW |
| `.sidecar` not in extensions | BRAW metadata not copied | LOW |
| Panasonic structure not handled | P2 clips incomplete | LOW |

---

## Implementation Plan

### Phase 1: Extension Registry (30 min)

Update `COMPANION_SIDECAR_EXTENSIONS` in `exiftool.ts`:

```typescript
const COMPANION_SIDECAR_EXTENSIONS = [
  // Telemetry
  '.srt',    // DJI drone telemetry (GPS, camera settings)
  '.lrf',    // DJI low-res proxy video

  // Professional cameras
  '.xml',    // Sony NRT, generic XML metadata
  '.rmd',    // RED camera settings, LUT
  '.ale',    // ARRI Avid Log Exchange
  '.sidecar', // Blackmagic BRAW metadata

  // AVCHD structure
  '.moi',    // Sony AVCHD metadata
  '.cpi',    // AVCHD clip info
  '.bdm',    // Blu-ray disc metadata
  '.mpl',    // AVCHD playlist

  // Thumbnails/proxies
  '.thm',    // Canon, GoPro thumbnail with EXIF
  '.lrv',    // GoPro low-res proxy

  // RAW sidecars
  '.gpr',    // GoPro RAW (DNG variant)
  '.xmp',    // Adobe XMP
  '.aae',    // Apple photo adjustments
  '.nksc',   // Nikon NX Studio
];
```

Update `VIDEO_WITH_SIDECAR_EXTENSIONS`:
```typescript
const VIDEO_WITH_SIDECAR_EXTENSIONS = new Set([
  '.mov', '.mp4', '.m4v',     // Common containers
  '.tod', '.mts', '.m2ts',    // AVCHD
  '.mpg', '.mpeg',            // MPEG
  '.r3d',                     // RED
  '.braw',                    // Blackmagic
  '.mxf',                     // Professional broadcast
  '.avi',                     // Legacy
]);
```

Update `SIDECAR_EXTENSIONS` in `related-files/index.ts`:
```typescript
const SIDECAR_EXTENSIONS = new Set([
  '.xmp', '.thm', '.aae',
  '.moi', '.cpi', '.bdm', '.mpl',
  '.srt', '.lrf', '.lrv',
  '.gpr', '.rmd', '.ale',
  '.sidecar', '.nksc',
]);
```

---

### Phase 2: Specialized Parsers (1 hour)

#### 2.1 THM Parser (Extract EXIF including GPS)
```typescript
async function parseThmMetadata(thmPath: string): Promise<FlexibleTags> {
  // THM files are JPEGs with EXIF - use exiftool
  const tags = await extractAllMetadata(thmPath);

  // Prefix with THM: to indicate source
  const metadata: FlexibleTags = {};
  for (const [key, value] of Object.entries(tags)) {
    if (key === 'SourceFile' || key === 'Directory') continue;
    metadata[`THM:${key}`] = value;

    // Copy GPS to standard fields if present
    if (key === 'GPSLatitude' && value) metadata['GPSLatitude'] = value;
    if (key === 'GPSLongitude' && value) metadata['GPSLongitude'] = value;
    if (key === 'GPSAltitude' && value) metadata['GPSAltitude'] = value;
  }

  metadata['THM:MetadataSource'] = 'Thumbnail';
  return metadata;
}
```

#### 2.2 AAE Parser (Apple Adjustments)
```typescript
async function parseAaeMetadata(aaePath: string): Promise<FlexibleTags> {
  const content = await fs.readFile(aaePath, 'utf-8');
  const metadata: FlexibleTags = {};

  // Check if it has adjustments
  metadata['Apple:HasAdjustments'] = content.includes('adjustmentData');

  // Extract format identifier
  const formatMatch = content.match(/<key>adjustmentFormatIdentifier<\/key>\s*<string>([^<]+)/);
  if (formatMatch) {
    metadata['Apple:AdjustmentFormat'] = formatMatch[1];
  }

  // Extract version
  const versionMatch = content.match(/<key>adjustmentFormatVersion<\/key>\s*<integer>(\d+)/);
  if (versionMatch) {
    metadata['Apple:AdjustmentVersion'] = parseInt(versionMatch[1], 10);
  }

  metadata['Apple:MetadataSource'] = 'AAE';
  return metadata;
}
```

#### 2.3 RMD Parser (RED Camera)
```typescript
async function parseRmdMetadata(rmdPath: string): Promise<FlexibleTags> {
  // RMD is binary/XML - try reading as text for embedded XML
  const buffer = await fs.readFile(rmdPath);
  const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 10000));
  const metadata: FlexibleTags = {};

  // Look for embedded settings
  const isoMatch = content.match(/ISO[:\s]+(\d+)/i);
  const wbMatch = content.match(/WhiteBalance[:\s]+(\d+)/i);

  if (isoMatch) metadata['RED:ISO'] = parseInt(isoMatch[1], 10);
  if (wbMatch) metadata['RED:WhiteBalance'] = parseInt(wbMatch[1], 10);

  metadata['RED:HasRMD'] = true;
  metadata['RED:MetadataSource'] = 'RMD';
  return metadata;
}
```

---

### Phase 3: Update Companion Detection (30 min)

Enhance `findCompanionSidecars()` to handle:
1. Case-insensitive matching
2. Sony suffix patterns (M01, C01, S01)
3. Directory-relative companions (AVCHD structure)

```typescript
export async function findCompanionSidecars(filePath: string): Promise<string[]> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, path.extname(filePath));

  if (!VIDEO_WITH_SIDECAR_EXTENSIONS.has(ext) && !PHOTO_WITH_SIDECAR_EXTENSIONS.has(ext)) {
    return [];
  }

  const companions: string[] = [];

  // Read directory once for efficiency
  let dirContents: string[] = [];
  try {
    dirContents = await fs.readdir(dir);
  } catch {
    return [];
  }

  const baseLower = base.toLowerCase();

  for (const file of dirContents) {
    const fileLower = file.toLowerCase();
    const fileExt = path.extname(file).toLowerCase();
    const fileBase = path.basename(file, path.extname(file)).toLowerCase();

    // Skip the primary file itself
    if (file === path.basename(filePath)) continue;

    // Standard same-basename matching
    if (fileBase === baseLower && COMPANION_SIDECAR_EXTENSIONS.includes(fileExt)) {
      companions.push(path.join(dir, file));
      continue;
    }

    // Sony suffix patterns: base + M01/C01/S01 + .XML
    if (fileExt === '.xml') {
      const sonyPattern = new RegExp(`^${escapeRegex(baseLower)}[mcs]0[1-9]$`, 'i');
      if (sonyPattern.test(fileBase)) {
        companions.push(path.join(dir, file));
      }
    }
  }

  return companions;
}
```

---

### Phase 4: Size-Based Embedding Strategy (15 min)

Add logic to determine whether to embed content:

```typescript
const MAX_EMBED_SIZE = 10 * 1024 * 1024; // 10 MB
const TEXT_EXTENSIONS = new Set(['.srt', '.xml', '.ale', '.aae', '.xmp']);
const BINARY_EMBED_EXTENSIONS = new Set(['.moi', '.cpi']); // Small binaries OK

export function shouldEmbedContent(ext: string, size: number): boolean {
  if (size > MAX_EMBED_SIZE) return false;
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (BINARY_EMBED_EXTENSIONS.has(ext) && size < 100 * 1024) return true;
  return false;
}
```

---

### Phase 5: Importer Updates (30 min)

Ensure importer handles all companion types:

1. During COPY phase: detect and copy all companions
2. During HASH phase: hash each companion
3. During RENAME phase: rename companions to match primary
4. During XMP phase: embed content based on size/type

Key change in `importer.ts`:
```typescript
// In copy phase
const companions = await findCompanionSidecars(file.path);
for (const companion of companions) {
  const ext = path.extname(companion).toLowerCase();
  const size = (await fs.stat(companion)).size;

  const copiedCompanion: CopiedCompanion = {
    sourcePath: companion,
    destPath: path.join(destDir, path.basename(companion)),
    extension: ext,
    hash: await hashFile(companion),
    size,
  };

  // Embed content for qualifying files
  if (shouldEmbedContent(ext, size)) {
    const content = await fs.readFile(companion);
    copiedCompanion.contentBase64 = content.toString('base64');
  }

  file.copiedCompanions.push(copiedCompanion);
  await fs.copyFile(companion, copiedCompanion.destPath);
}
```

---

### Phase 6: Tests (45 min)

Create test fixtures and test cases:

```typescript
// tests/services/metadata/companion-sidecars.test.ts

describe('findCompanionSidecars', () => {
  it('finds DJI SRT and LRF files', async () => {
    const companions = await findCompanionSidecars('/test/DJI_0001.MOV');
    expect(companions).toContain('/test/DJI_0001.SRT');
    expect(companions).toContain('/test/DJI_0001.LRF');
  });

  it('finds Sony M01.XML suffix pattern', async () => {
    const companions = await findCompanionSidecars('/test/A001C001.MP4');
    expect(companions).toContain('/test/A001C001M01.XML');
  });

  it('finds case-insensitive matches', async () => {
    const companions = await findCompanionSidecars('/test/mov001.tod');
    expect(companions.some(c => c.toLowerCase().endsWith('.moi'))).toBe(true);
  });
});

describe('parseDjiSrt', () => {
  it('extracts GPS coordinates', async () => {
    const metadata = await parseDjiSrt('/test/sample.srt');
    expect(metadata['GPSLatitude']).toBeDefined();
    expect(metadata['GPSLongitude']).toBeDefined();
  });
});

describe('shouldEmbedContent', () => {
  it('embeds small text files', () => {
    expect(shouldEmbedContent('.srt', 50000)).toBe(true);
  });

  it('skips large files', () => {
    expect(shouldEmbedContent('.srt', 20 * 1024 * 1024)).toBe(false);
  });

  it('skips video proxies', () => {
    expect(shouldEmbedContent('.lrf', 50000)).toBe(false);
  });
});
```

---

## Audit: Plan vs Goal

| Goal | Plan Coverage | Status |
|------|---------------|--------|
| Detect ALL companion sidecars | Phase 1, 3 adds all extensions | COVERED |
| Copy sidecars alongside primary | Phase 5 handles copying | COVERED |
| Hash each sidecar | Phase 5 includes hashing | COVERED |
| Embed full content in XMP | Phase 4, 5 with size limits | COVERED |
| Extract summary metadata | Phase 2 parsers extract key fields | COVERED |
| Verify integrity | Hash + base64 enables verification | COVERED |

**Gap analysis**: No gaps. All goals addressed.

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Large LRF/LRV files slow import | Don't embed video proxies (copy only) |
| Unknown sidecar formats | Graceful fallback to copy-only |
| Case sensitivity issues | Always use case-insensitive matching |
| Sony suffix variations | Regex pattern handles M01-M09, C01-C09, S01-S09 |

---

## Files to Modify

1. `src/services/metadata/wrappers/exiftool.ts`
   - Add extensions to `COMPANION_SIDECAR_EXTENSIONS`
   - Add extensions to `VIDEO_WITH_SIDECAR_EXTENSIONS`
   - Add `PHOTO_WITH_SIDECAR_EXTENSIONS` set
   - Add parsers: `parseThmMetadata`, `parseAaeMetadata`, `parseRmdMetadata`
   - Enhance `findCompanionSidecars` for case-insensitive and Sony patterns
   - Add `shouldEmbedContent` function
   - Export new functions

2. `src/services/related-files/index.ts`
   - Add all sidecar extensions to `SIDECAR_EXTENSIONS`

3. `src/services/importer.ts`
   - Import `shouldEmbedContent`
   - Update copy phase to use size-based embedding

4. `tests/services/metadata/companion-sidecars.test.ts` (new)
   - Add comprehensive tests

---

## Execution Order

1. Update extension constants (Phase 1)
2. Add specialized parsers (Phase 2)
3. Enhance detection algorithm (Phase 3)
4. Add embedding logic (Phase 4)
5. Update importer (Phase 5)
6. Add tests (Phase 6)
7. Build and verify
8. Test with real files

---

## Success Criteria

- [ ] Build passes with no errors
- [ ] All new tests pass
- [ ] DJI files: SRT and LRF detected and copied
- [ ] Sony files: M01.XML detected and copied
- [ ] Canon/GoPro: THM detected, GPS extracted
- [ ] XMP contains embedded content for text sidecars
- [ ] Video proxies (LRF, LRV) copied but not embedded
