# Universal XMP Sidecar Specification

Version: 1.0.0
Last Updated: 2024-12-24

## Overview

All child repositories in the pipeline create and update XMP sidecar files (`.xmp`) to track file provenance, processing history, and metadata. This specification ensures apps can layer their metadata without overwriting each other.

## Core Principles

1. **Independence**: Any app can create an XMP sidecar from scratch
2. **Layering**: Apps add their namespace without removing others
3. **Custody Chain**: All apps update the shared custody chain
4. **Exiftool**: All reads/writes use exiftool to preserve unknown namespaces

## Namespace Registry

| App | Prefix | URI | Purpose |
|-----|--------|-----|---------|
| wake-n-blake | `wnb:` | `http://wake-n-blake.dev/xmp/1.0/` | Import, hashing, provenance |
| shoemaker | `shoe:` | `http://shoemaker.dev/xmp/1.0/` | Thumbnails, proxies |
| visual-buffet | `vbuffet:` | `http://visual-buffet.dev/xmp/1.0/` | ML tags, classifications |
| national-treasure | `nt:` | `http://national-treasure.dev/xmp/1.0/` | Web capture, archiving |

**Reserved Namespaces** (read-only, do not modify):
- `dc:` - Dublin Core (standard metadata)
- `xmp:` - XMP Core
- `exif:` - EXIF data
- `tiff:` - TIFF metadata
- `photoshop:` - Adobe Photoshop

## Shared Schema Elements

### Sidecar Header (Required by all apps)

Every app that creates or updates a sidecar MUST set these fields using their own namespace prefix:

```xml
<!-- Example: wake-n-blake creating initial sidecar -->
<wnb:SchemaVersion>1</wnb:SchemaVersion>
<wnb:SidecarCreated>2024-12-24T12:00:00Z</wnb:SidecarCreated>
<wnb:SidecarUpdated>2024-12-24T12:00:00Z</wnb:SidecarUpdated>
```

### Content Identity (First app only)

The first app in the pipeline (usually wake-n-blake) sets these core identity fields:

```xml
<wnb:ContentHash>a7f3b2c1d4e5f678</wnb:ContentHash>
<wnb:ContentHashFull>a7f3b2c1d4e5f678901234567890abcdef...</wnb:ContentHashFull>
<wnb:HashAlgorithm>blake3</wnb:HashAlgorithm>
<wnb:FileSize>12345678</wnb:FileSize>
```

**If no hash exists**, subsequent apps SHOULD compute and add it:

```xml
<shoe:ContentHash>a7f3b2c1d4e5f678</shoe:ContentHash>
<shoe:HashAlgorithm>blake3</shoe:HashAlgorithm>
```

### Custody Chain (Shared, updated by all)

The custody chain tracks every processing event. ALL apps MUST append to this chain.

**Namespace**: Always use `wnb:` for custody chain (canonical namespace)

```xml
<wnb:FirstSeen>2024-12-24T12:00:00Z</wnb:FirstSeen>
<wnb:EventCount>3</wnb:EventCount>
<wnb:CustodyChain>
  <rdf:Seq>
    <!-- Event 1: wake-n-blake import -->
    <rdf:li rdf:parseType="Resource">
      <wnb:EventID>01HXY123ABC...</wnb:EventID>
      <wnb:EventTimestamp>2024-12-24T12:00:00Z</wnb:EventTimestamp>
      <wnb:EventAction>ingestion</wnb:EventAction>
      <wnb:EventOutcome>success</wnb:EventOutcome>
      <wnb:EventTool>wake-n-blake/0.1.5</wnb:EventTool>
      <wnb:EventHost>MacBook-Air.local</wnb:EventHost>
      <wnb:EventUser>john</wnb:EventUser>
      <wnb:EventNotes>Import from SD card</wnb:EventNotes>
    </rdf:li>

    <!-- Event 2: shoemaker thumbnails -->
    <rdf:li rdf:parseType="Resource">
      <wnb:EventID>01HXY456DEF...</wnb:EventID>
      <wnb:EventTimestamp>2024-12-24T12:05:00Z</wnb:EventTimestamp>
      <wnb:EventAction>thumbnail_generation</wnb:EventAction>
      <wnb:EventOutcome>success</wnb:EventOutcome>
      <wnb:EventTool>shoemaker/0.1.10</wnb:EventTool>
      <wnb:EventHost>MacBook-Air.local</wnb:EventHost>
      <wnb:EventUser>john</wnb:EventUser>
    </rdf:li>

    <!-- Event 3: visual-buffet tagging -->
    <rdf:li rdf:parseType="Resource">
      <wnb:EventID>01HXY789GHI...</wnb:EventID>
      <wnb:EventTimestamp>2024-12-24T12:10:00Z</wnb:EventTimestamp>
      <wnb:EventAction>ml_tagging</wnb:EventAction>
      <wnb:EventOutcome>success</wnb:EventOutcome>
      <wnb:EventTool>visual-buffet/0.1.10</wnb:EventTool>
      <wnb:EventHost>MacBook-Air.local</wnb:EventHost>
      <wnb:EventUser>john</wnb:EventUser>
      <wnb:EventNotes>Plugins: ram_plus, siglip</wnb:EventNotes>
    </rdf:li>
  </rdf:Seq>
</wnb:CustodyChain>
```

### Event Actions (Enumerated)

| Action | App | Description |
|--------|-----|-------------|
| `ingestion` | wake-n-blake | Initial file import |
| `verification` | wake-n-blake | Hash verification |
| `thumbnail_generation` | shoemaker | Thumbnail/proxy creation |
| `ml_tagging` | visual-buffet | ML classification |
| `web_capture` | national-treasure | Web archiving |
| `metadata_extraction` | any | Metadata read |
| `file_move` | any | File relocated |
| `file_copy` | any | File duplicated |
| `manual_edit` | any | Human modification |

## App-Specific Schemas

### wake-n-blake (`wnb:`)

```xml
<!-- Source provenance -->
<wnb:SourcePath>/Volumes/SDCARD/DCIM/100CANON/IMG_4523.CR3</wnb:SourcePath>
<wnb:SourceFilename>IMG_4523.CR3</wnb:SourceFilename>
<wnb:SourceHost>MacBook-Air.local</wnb:SourceHost>
<wnb:SourceType>memory_card</wnb:SourceType>

<!-- File classification -->
<wnb:FileCategory>image</wnb:FileCategory>
<wnb:FileSubcategory>raw</wnb:FileSubcategory>
<wnb:DetectedMimeType>image/x-canon-cr3</wnb:DetectedMimeType>

<!-- Device fingerprinting -->
<wnb:USBVendorID>0x05ac</wnb:USBVendorID>
<wnb:USBProductID>0x8406</wnb:USBProductID>
<wnb:MediaSerial>0x2b3d9127</wnb:MediaSerial>

<!-- Import context -->
<wnb:ImportTimestamp>2024-12-24T12:00:00Z</wnb:ImportTimestamp>
<wnb:SessionID>abc123def456</wnb:SessionID>
<wnb:ToolVersion>0.1.5</wnb:ToolVersion>

<!-- Deduplication -->
<wnb:DedupStatus>unique</wnb:DedupStatus>
<wnb:IsPrimaryFile>true</wnb:IsPrimaryFile>

<!-- Related files -->
<wnb:IsLivePhoto>true</wnb:IsLivePhoto>
<wnb:LivePhotoRole>image</wnb:LivePhotoRole>
<wnb:LivePhotoPairHash>def456...</wnb:LivePhotoPairHash>
```

### shoemaker (`shoe:`)

```xml
<shoe:SchemaVersion>1</shoe:SchemaVersion>
<shoe:GeneratedAt>2024-12-24T12:05:00Z</shoe:GeneratedAt>
<shoe:Method>extracted</shoe:Method>  <!-- extracted | decoded | direct | video -->

<!-- Thumbnails -->
<shoe:Thumbnails>
  <rdf:Seq>
    <rdf:li rdf:parseType="Resource">
      <shoe:Size>small</shoe:Size>
      <shoe:Resolution>1080</shoe:Resolution>
      <shoe:Format>webp</shoe:Format>
      <shoe:Path>./thumbs/a7f3b2c1_small.webp</shoe:Path>
      <shoe:Bytes>45678</shoe:Bytes>
    </rdf:li>
    <rdf:li rdf:parseType="Resource">
      <shoe:Size>large</shoe:Size>
      <shoe:Resolution>2048</shoe:Resolution>
      <shoe:Format>webp</shoe:Format>
      <shoe:Path>./thumbs/a7f3b2c1_large.webp</shoe:Path>
      <shoe:Bytes>123456</shoe:Bytes>
    </rdf:li>
  </rdf:Seq>
</shoe:Thumbnails>

<!-- Video metadata (if video file) -->
<shoe:Video>
  <shoe:Duration>154.56</shoe:Duration>
  <shoe:Resolution>3840x2160</shoe:Resolution>
  <shoe:FrameRate>59.94</shoe:FrameRate>
  <shoe:Codec>H.264</shoe:Codec>
  <shoe:IsHdr>false</shoe:IsHdr>
</shoe:Video>

<!-- Proxies (if video) -->
<shoe:Proxies>
  <rdf:Seq>
    <rdf:li rdf:parseType="Resource">
      <shoe:Size>proxy</shoe:Size>
      <shoe:Resolution>1280x720</shoe:Resolution>
      <shoe:Codec>H.264</shoe:Codec>
      <shoe:Bitrate>5000000</shoe:Bitrate>
      <shoe:Path>./proxies/a7f3b2c1_proxy.mp4</shoe:Path>
    </rdf:li>
  </rdf:Seq>
</shoe:Proxies>
```

### visual-buffet (`vbuffet:`)

```xml
<vbuffet:SchemaVersion>1</vbuffet:SchemaVersion>
<vbuffet:TaggedAt>2024-12-24T12:10:00Z</vbuffet:TaggedAt>
<vbuffet:Threshold>0.5</vbuffet:Threshold>
<vbuffet:SizeUsed>original</vbuffet:SizeUsed>
<vbuffet:InferenceTimeMs>142.5</vbuffet:InferenceTimeMs>

<!-- Plugins used -->
<vbuffet:PluginsUsed>
  <rdf:Bag>
    <rdf:li>ram_plus</rdf:li>
    <rdf:li>siglip</rdf:li>
  </rdf:Bag>
</vbuffet:PluginsUsed>

<!-- Tags with confidence -->
<vbuffet:Tags>
  <rdf:Bag>
    <rdf:li rdf:parseType="Resource">
      <vbuffet:Label>dog</vbuffet:Label>
      <vbuffet:Confidence>0.95</vbuffet:Confidence>
      <vbuffet:Plugin>ram_plus</vbuffet:Plugin>
    </rdf:li>
    <rdf:li rdf:parseType="Resource">
      <vbuffet:Label>outdoor</vbuffet:Label>
      <vbuffet:Confidence>0.89</vbuffet:Confidence>
      <vbuffet:Plugin>ram_plus</vbuffet:Plugin>
    </rdf:li>
  </rdf:Bag>
</vbuffet:Tags>
```

### national-treasure (`nt:`)

```xml
<nt:SchemaVersion>1</nt:SchemaVersion>
<nt:CapturedAt>2024-12-24T12:15:00Z</nt:CapturedAt>

<!-- Web provenance -->
<nt:SourceURL>https://example.com/image.jpg</nt:SourceURL>
<nt:PageURL>https://example.com/gallery</nt:PageURL>
<nt:PageTitle>Photo Gallery - Example Site</nt:PageTitle>
<nt:CaptureMethod>screenshot</nt:CaptureMethod>

<!-- Browser context -->
<nt:BrowserEngine>chromium</nt:BrowserEngine>
<nt:UserAgent>Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...</nt:UserAgent>
<nt:ViewportSize>1920x1080</nt:ViewportSize>

<!-- Archive references -->
<nt:WarcFile>./archive/capture_20241224.warc.gz</nt:WarcFile>
<nt:WarcRecordID>urn:uuid:12345678-1234-...</nt:WarcRecordID>

<!-- Quality analysis -->
<nt:HttpStatus>200</nt:HttpStatus>
<nt:WasBlocked>false</nt:WasBlocked>
<nt:ContentType>image/jpeg</nt:ContentType>
```

## Implementation Guide

### Reading XMP (All Apps)

```typescript
// TypeScript (wake-n-blake, shoemaker)
import { exiftool } from 'exiftool-vendored';

async function readXmp(filePath: string): Promise<Record<string, unknown>> {
  const xmpPath = `${filePath}.xmp`;
  if (!existsSync(xmpPath)) return {};
  return await exiftool.read(xmpPath);
}
```

```python
# Python (visual-buffet, national-treasure)
from exiftool import ExifToolHelper

def read_xmp(file_path: str) -> dict:
    xmp_path = f"{file_path}.xmp"
    if not Path(xmp_path).exists():
        return {}
    with ExifToolHelper() as et:
        return et.get_metadata(xmp_path)[0]
```

### Writing XMP (All Apps)

```typescript
// TypeScript - Add namespace without overwriting others
async function writeXmp(
  filePath: string,
  data: Record<string, unknown>,
  namespace: string
): Promise<void> {
  const xmpPath = `${filePath}.xmp`;

  // Build args with namespace prefix
  const args: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    args.push(`-XMP-${namespace}:${key}=${value}`);
  }

  await exiftool.write(xmpPath, {}, args);
}
```

```python
# Python - Add namespace without overwriting others
def write_xmp(file_path: str, data: dict, namespace: str) -> None:
    xmp_path = f"{file_path}.xmp"

    with ExifToolHelper() as et:
        # Build tags with namespace prefix
        tags = {f"XMP-{namespace}:{k}": v for k, v in data.items()}
        et.set_tags(xmp_path, tags)
```

### Updating Custody Chain

```typescript
// TypeScript - Append custody event
async function appendCustodyEvent(
  filePath: string,
  event: CustodyEvent
): Promise<void> {
  const xmpPath = `${filePath}.xmp`;
  const existing = await readXmp(filePath);

  // Read existing chain or create new
  const chain = existing['CustodyChain'] || [];
  chain.push(event);

  // Update count and chain
  await exiftool.write(xmpPath, {}, [
    `-XMP-wnb:EventCount=${chain.length}`,
    `-XMP-wnb:SidecarUpdated=${new Date().toISOString()}`,
    // Append event... (exiftool struct syntax)
  ]);
}
```

## Validation

Apps SHOULD validate XMP on read:

1. Check `SchemaVersion` matches expected version
2. Verify required fields present
3. Validate hash integrity if `ContentHash` present
4. Log warnings for unknown namespaces (don't fail)

## Migration

### shoemaker Migration (from XMP-dc:Source hack)

shoemaker currently stores data in `XMP-dc:Source` as JSON. Migration:

1. Read existing `XMP-dc:Source` if starts with `shoemaker:`
2. Parse JSON payload
3. Write to new `shoe:` namespace
4. Clear `XMP-dc:Source` hack
5. Update `XMP-xmp:Label` from `shoemaker-managed` to `shoe-managed`

## File Naming

XMP sidecars use the pattern: `{original_filename}.xmp`

Examples:
- `IMG_4523.CR3` → `IMG_4523.CR3.xmp`
- `video.mp4` → `video.mp4.xmp`
- `photo.jpg` → `photo.jpg.xmp`
