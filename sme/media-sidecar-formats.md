# Media Sidecar File Formats

> **Generated**: 2025-12-23
> **Sources current as of**: 2025-12-23
> **Scope**: Comprehensive
> **Version**: 1.0

---

## Executive Summary / TLDR

Media sidecar files are companion files that store metadata, thumbnails, proxies, or telemetry data alongside primary media files. They are critical for archival workflows because:

1. **They contain unique metadata** not embedded in the primary file (GPS telemetry, edit decisions, color science, timecode)
2. **Losing them loses information** - archive integrity requires preserving ALL companion data
3. **Naming conventions vary widely** - from simple same-basename (`.MOI`) to complex suffixes (`M01.XML`)

**Key finding**: Most implementations only extract summary data from sidecars. For true archival compliance, the FULL sidecar content must be preserved (embedded as base64 in XMP or copied verbatim).

**Priority formats by usage frequency**:
| Priority | Format | Cameras | Content |
|----------|--------|---------|---------|
| HIGH | `.SRT` | DJI | Per-frame GPS telemetry |
| HIGH | `M01.XML` | Sony Pro | Timecode, UMID, color science |
| HIGH | `.MOI` | Sony AVCHD | DateTimeOriginal, duration |
| HIGH | `.THM` | Canon, GoPro | EXIF thumbnail with GPS |
| MEDIUM | `.LRF` | DJI | Low-res proxy video |
| MEDIUM | `.GPR` | GoPro | RAW sensor data |
| MEDIUM | `.AAE` | Apple | Non-destructive edits |
| MEDIUM | `.RMD` | RED | Camera settings, LUT |
| LOW | `.ALE` | ARRI | Avid Log Exchange |
| LOW | `.NKSC` | Nikon | NX Studio edits |

---

## Background & Context

Sidecar files emerged because:
1. Some file formats don't support embedded metadata
2. Non-destructive editing requires external storage
3. Professional workflows need machine-readable metadata interchange
4. Telemetry data (GPS, gyroscope) may be too large to embed

**Archive implications**: Discarding sidecars violates archival principles. They must be:
- Copied alongside primary files with hash verification
- Content embedded in XMP for single-file integrity
- Indexed for searchability

---

## Sidecar Categories

### 1. Telemetry Sidecars (GPS, Motion, Sensor Data)

#### DJI `.SRT` - Subtitle Telemetry
| Property | Value |
|----------|-------|
| **Extension** | `.srt` |
| **Format** | Text (SRT subtitle format) |
| **Naming** | Same basename: `DJI_0001.MOV` → `DJI_0001.SRT` |
| **Primary files** | `.MOV`, `.MP4` |
| **Content** | Per-frame GPS, altitude, camera settings, timestamp |

**Sample content**:
```
1
00:00:00,000 --> 00:00:00,033
<font size="28">SrtCnt : 1, DiffTime : 33ms
2024-03-15 14:23:45.123
[iso: 100] [shutter: 1/640.0] [fnum: 2.8] [ev: 0.3] [ct: 5417]
[color_md : dlog_m] [focal_len: 24.00] [dzoom_ratio: 1.00]
[latitude: 41.98172] [longitude: -76.24034]
[rel_alt: 45.200 abs_alt: 312.456]
```

**Extraction priority**:
- `DateTimeOriginal` - First timestamp
- `GPSLatitude/Longitude` - First position (start of flight)
- `GPSLatitudeEnd/LongitudeEnd` - Last position (end of flight)
- `DJI:*` - All camera settings, altitude, frame count

#### DJI `.LRF` - Low Resolution Flyback
| Property | Value |
|----------|-------|
| **Extension** | `.lrf` |
| **Format** | Binary (H.264 video) |
| **Naming** | Same basename: `DJI_0001.MOV` → `DJI_0001.LRF` |
| **Primary files** | `.MOV`, `.MP4` |
| **Content** | Low-res preview video for quick scrubbing |

**Archive handling**: Copy alongside primary, don't extract metadata (proxy only).

---

### 2. Professional Camera Metadata Sidecars

#### Sony NonRealTimeMeta `.XML` (M01.XML suffix)
| Property | Value |
|----------|-------|
| **Extension** | `.XML` with `M01` suffix |
| **Format** | XML (Sony proprietary schema) |
| **Naming** | Base + suffix: `A001C001_240315.MP4` → `A001C001_240315M01.XML` |
| **Primary files** | `.MP4`, `.MXF` |
| **Content** | UMID, timecode, codec, color science, gyroscope |

**Suffix patterns**:
- `M01.XML` - First metadata clip
- `C01.XML` - Clip variant (some cameras)

**Sample structure**:
```xml
<NonRealTimeMeta xmlns="urn:schemas-professionalDisc:nonRealTimeMeta:ver.2.00">
  <Duration value="1234"/>
  <CreationDate value="2024-03-15T14:23:45-05:00"/>
  <Device manufacturer="Sony" modelName="ILME-FX6"/>
  <VideoFormat>
    <VideoRecPort videoCodec="AVC-I"/>
    <VideoFrame captureFps="23976/1000"/>
  </VideoFormat>
  <AcquisitionRecord>
    <Group name="CameraUnitMetadataSet">
      <Item name="CaptureGammaEquation" value="S-Log3"/>
      <Item name="CaptureColorPrimaries" value="S-Gamut3.Cine"/>
    </Group>
  </AcquisitionRecord>
</NonRealTimeMeta>
```

**Extraction fields**:
- `Sony:UMID` - Unique Material Identifier
- `Sony:TimecodeStart` - Initial timecode
- `Sony:GammaEquation` - Log profile (S-Log3, etc.)
- `Sony:ColorPrimaries` - Color space (S-Gamut3, etc.)
- `Sony:HasGyroscopeData` - Boolean for stabilization data presence

#### RED `.RMD` - RED Metadata
| Property | Value |
|----------|-------|
| **Extension** | `.RMD` |
| **Format** | Binary/XML hybrid |
| **Naming** | Same basename: `A001_C001.R3D` → `A001_C001.RMD` |
| **Primary files** | `.R3D` |
| **Content** | Camera settings, LUTs, CDL, lens metadata |

**Archive handling**: Copy alongside `.R3D`, critical for color pipeline.

#### ARRI `.ALE` - Avid Log Exchange
| Property | Value |
|----------|-------|
| **Extension** | `.ALE` |
| **Format** | Tab-delimited text |
| **Naming** | Varies (may be per-roll or per-clip) |
| **Primary files** | `.ARR`, `.MXF`, `.MOV` |
| **Content** | Timecode, reel, scene/take, sound TC |

**Sample**:
```
Heading
FIELD_DELIM	TABS
VIDEO_FORMAT	1080
AUDIO_FORMAT	48kHz
FPS	24

Column
Name	Start	End	Tracks	Soundroll
A001C001	01:00:00:00	01:00:32:15	VA1A2	SR001
```

#### Blackmagic `.sidecar`
| Property | Value |
|----------|-------|
| **Extension** | `.sidecar` |
| **Format** | Binary (BRAW-specific) |
| **Naming** | Same basename: `clip.braw` → `clip.sidecar` |
| **Primary files** | `.BRAW` |
| **Content** | Color metadata, LUTs, decode settings |

---

### 3. AVCHD Structure Files

AVCHD uses a complex folder structure with multiple sidecar types:

```
PRIVATE/
└── AVCHD/
    ├── AVCHDTN/           # Thumbnails
    │   └── *.THM
    ├── BDMV/
    │   ├── CLIPINF/       # Clip info files
    │   │   └── *.CPI
    │   ├── PLAYLIST/      # Playlist metadata
    │   │   └── *.MPL
    │   └── STREAM/        # Video streams
    │       └── *.MTS
    └── INDEX.BDM          # Index file
```

#### `.MOI` - Metadata Object Information
| Property | Value |
|----------|-------|
| **Extension** | `.MOI` |
| **Format** | Binary (Sony proprietary) |
| **Naming** | Same basename: `MOV001.TOD` → `MOV001.MOI` |
| **Primary files** | `.TOD`, `.MTS`, `.MPG` |
| **Content** | DateTimeOriginal, duration, aspect ratio |

**ExifTool extraction**:
```
DateTimeOriginal: 2024:03:15 14:23:45
Duration: 123.45 s
AspectRatio: 16:9
VideoCodec: AVCHD
```

#### `.CPI` - Clip Information
| Property | Value |
|----------|-------|
| **Extension** | `.CPI` |
| **Format** | Binary |
| **Naming** | Same basename (in CLIPINF folder) |
| **Content** | Stream details, markers, thumbnails |

#### `.BDM` - Blu-ray Disc Metadata
| Property | Value |
|----------|-------|
| **Extension** | `.BDM` |
| **Format** | Binary |
| **Naming** | `INDEX.BDM` (structure file) |
| **Content** | Disc structure, playlist links |

---

### 4. Thumbnail/Preview Sidecars

#### Canon/GoPro `.THM` - Thumbnail
| Property | Value |
|----------|-------|
| **Extension** | `.THM` |
| **Format** | JPEG with EXIF |
| **Naming** | Same basename: `MVI_0001.MOV` → `MVI_0001.THM` |
| **Primary files** | `.MOV`, `.AVI`, `.MP4` |
| **Content** | Thumbnail image + full EXIF (GPS, camera, datetime) |

**Important**: THM files often contain GPS that the video lacks!

#### GoPro `.LRV` - Low Resolution Video
| Property | Value |
|----------|-------|
| **Extension** | `.LRV` |
| **Format** | H.264 video |
| **Naming** | Same basename: `GOPR0001.MP4` → `GOPR0001.LRV` |
| **Content** | 240p proxy for mobile preview |

---

### 5. RAW Sidecars

#### GoPro `.GPR` - GoPro RAW
| Property | Value |
|----------|-------|
| **Extension** | `.GPR` |
| **Format** | DNG variant |
| **Naming** | Same basename as JPEG: `GOPR0001.JPG` → `GOPR0001.GPR` |
| **Content** | RAW sensor data |

#### Adobe `.XMP` - Extensible Metadata Platform
| Property | Value |
|----------|-------|
| **Extension** | `.XMP`, `.xmp` |
| **Format** | XML |
| **Naming** | Same basename: `IMG_0001.CR2` → `IMG_0001.xmp` |
| **Primary files** | All RAW formats |
| **Content** | Edits, ratings, keywords, develop settings |

#### Nikon `.NKSC` - NX Studio Sidecar
| Property | Value |
|----------|-------|
| **Extension** | `.NKSC` |
| **Format** | Proprietary binary |
| **Naming** | Same basename: `DSC_0001.NEF` → `DSC_0001.NKSC` |
| **Content** | NX Studio adjustments, Picture Control |

---

### 6. Edit Decision Sidecars

#### Apple `.AAE` - Apple Adjustments
| Property | Value |
|----------|-------|
| **Extension** | `.AAE` |
| **Format** | XML (plist) |
| **Naming** | Same basename: `IMG_0001.HEIC` → `IMG_0001.AAE` |
| **Primary files** | `.HEIC`, `.JPG`, `.MOV` |
| **Content** | Non-destructive edits, filters, crops |

**Sample**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN">
<plist version="1.0">
<dict>
    <key>adjustmentData</key>
    <data>base64encodedadjustments==</data>
    <key>adjustmentFormatIdentifier</key>
    <string>com.apple.photo</string>
</dict>
</plist>
```

---

### 7. Panasonic Sidecars

#### `.CONT` - Content Information
| Property | Value |
|----------|-------|
| **Extension** | `.CONT` |
| **Format** | XML |
| **Naming** | Within folder structure |
| **Content** | Clip metadata, timecode |

#### P2 Structure
```
CONTENTS/
├── CLIP/
│   └── *.XML       # Clip metadata
├── VIDEO/
│   └── *.MXF       # Video essence
└── ICON/
    └── *.BMP       # Thumbnails
```

---

## Complete Sidecar Extension Reference

| Extension | Format | Naming Pattern | Contains | Cameras |
|-----------|--------|----------------|----------|---------|
| `.srt` | Text | Same basename | GPS telemetry | DJI |
| `.lrf` | Binary | Same basename | Proxy video | DJI |
| `.xml` | XML | Same basename | Generic metadata | Various |
| `M01.XML` | XML | Base+suffix | Sony NRT metadata | Sony Pro |
| `C01.XML` | XML | Base+suffix | Sony clip variant | Sony Pro |
| `.moi` | Binary | Same basename | DateTime, duration | Sony AVCHD |
| `.cpi` | Binary | Same basename | Clip info | AVCHD |
| `.bdm` | Binary | Structure file | Disc index | AVCHD |
| `.mpl` | Binary | Same basename | Playlist | AVCHD |
| `.thm` | JPEG | Same basename | Thumbnail+EXIF | Canon, GoPro |
| `.lrv` | H.264 | Same basename | Proxy video | GoPro |
| `.gpr` | DNG | Same basename | RAW data | GoPro |
| `.xmp` | XML | Same basename | Edits, ratings | Adobe |
| `.aae` | XML | Same basename | Apple edits | Apple |
| `.rmd` | Binary | Same basename | RED metadata | RED |
| `.sidecar` | Binary | Same basename | BRAW metadata | Blackmagic |
| `.ale` | Text | Varies | Avid log | ARRI |
| `.nksc` | Binary | Same basename | Nikon edits | Nikon |

---

## Implementation Requirements

### Detection Algorithm

1. **Same-basename matching**:
   ```
   primary: /path/to/DJI_0001.MOV
   companions: [
     /path/to/DJI_0001.SRT,
     /path/to/DJI_0001.LRF
   ]
   ```

2. **Suffix-pattern matching** (Sony):
   ```
   primary: /path/to/A001C001.MP4
   companions: [
     /path/to/A001C001M01.XML,
     /path/to/A001C001C01.XML
   ]
   ```

3. **Case-insensitive matching** (FAT32 SD cards):
   ```
   primary: /path/to/mov001.tod
   companions: [
     /path/to/MOV001.MOI,
     /path/to/mov001.moi
   ]
   ```

### Archive Workflow

```
1. DETECT companions for each primary file
2. COPY companions alongside primary during import
3. HASH each companion (BLAKE3)
4. READ companion content (< 10MB: embed as base64)
5. EXTRACT summary metadata for search indexing
6. WRITE to XMP:
   - wnb:CopiedCompanions (list with hashes)
   - wnb:CompanionContent (base64 for text/small binaries)
   - wnb:IngestedCompanions (extracted metadata)
7. VERIFY all companions present in destination
```

### XMP Schema for Companions

```xml
<wnb:CopiedCompanions>
  <rdf:Bag>
    <rdf:li>
      <wnb:SourcePath>/source/DJI_0001.SRT</wnb:SourcePath>
      <wnb:DestPath>/dest/DJI_0001.SRT</wnb:DestPath>
      <wnb:Extension>.srt</wnb:Extension>
      <wnb:Hash>blake3:abc123...</wnb:Hash>
      <wnb:Size>12345</wnb:Size>
      <wnb:CompanionContent encoding="base64">
        MSAwMDowMDowMCwwMDAg...
      </wnb:CompanionContent>
    </rdf:li>
  </rdf:Bag>
</wnb:CopiedCompanions>
```

---

## Limitations & Uncertainties

### What This Document Does NOT Cover
- Audio-only sidecars (BWF metadata files)
- CAD/3D model sidecars
- Scientific imaging formats (FITS, DICOM)

### Unverified Claims
- Some Panasonic P2 extensions may have additional variants
- ARRI ALE may have newer versions not documented

### Source Conflicts
- GoPro `.GPR` documentation conflicts on whether it's true DNG or modified

### Knowledge Gaps
- Exact binary format specs for `.MOI`, `.CPI` (proprietary, no public docs)
- Full Sony NRT XML schema variations across camera models

### Recency Limitations
- New camera models may introduce new sidecar formats
- DJI naming conventions may change with firmware updates

---

## Source Appendix

| # | Source | Date | Type | Used For |
|---|--------|------|------|----------|
| 1 | ExifTool documentation | 2025 | Primary | Format support reference |
| 2 | DJI firmware release notes | 2024 | Primary | SRT format details |
| 3 | Sony Professional Support | 2024 | Primary | NRT XML schema |
| 4 | Adobe XMP Specification | 2024 | Primary | XMP sidecar format |
| 5 | GoPro Developer Docs | 2024 | Primary | LRV/GPR details |
| 6 | AVCHD Specification | 2011 | Primary | Structure definition |
| 7 | RED Workflow Guide | 2024 | Secondary | RMD handling |
| 8 | Blackmagic DaVinci Manual | 2024 | Secondary | BRAW sidecar |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-23 | Initial comprehensive version |
