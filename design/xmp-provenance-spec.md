# XMP Provenance Sidecar Specification

**Version:** 0.5.0
**Status:** Draft
**Author:** wake-n-blake
**Last Updated:** 2025-12-22

> This specification incorporates best practices from [PREMIS](https://www.loc.gov/standards/premis/), [OAIS](https://en.wikipedia.org/wiki/Open_Archival_Information_System), [BagIt](https://datatracker.ietf.org/doc/html/rfc8493), [Photo Mechanic](https://home.camerabits.com/), and production systems including [nightfoxfilms](https://github.com/nightfoxfilms) and [abandoned-archive](https://github.com/abandoned-archive).

## Overview

Every physical file that wake-n-blake touches at a destination receives an XMP sidecar file documenting its complete provenance chain. This creates an "apocalypse-proof" archival record that travels with the file.

This specification draws from established digital preservation standards including [PREMIS](https://www.loc.gov/standards/premis/), [OAIS](https://en.wikipedia.org/wiki/Open_Archival_Information_System), and [BagIt](https://datatracker.ietf.org/doc/html/rfc8493), adapted for per-file XMP sidecars.

## Design Principles

1. **Append-Only Chain of Custody** — History is never deleted or modified, only appended
2. **Belt and Suspenders** — Embed XMP when format supports it AND always create sidecar
3. **Source Preservation** — Existing EXIF/XMP from source files is preserved and incorporated
4. **Portable** — XMP is an open standard; sidecars are human-readable XML
5. **Self-Verifying** — Sidecar includes its own integrity hash
6. **Standards-Based** — Aligns with PREMIS event model and forensic chain-of-custody requirements
7. **Physical Device Tracking** — Import source device (USB fingerprint, card reader, camera serial) is distinct from file metadata

---

## File Naming Convention

Sidecars use the full filename with `.xmp` appended:

```
photo.jpg       →  photo.jpg.xmp
video.mov       →  video.mov.xmp
document.pdf    →  document.pdf.xmp
archive.tar.gz  →  archive.tar.gz.xmp
```

---

## XMP Namespace

```
Namespace URI:  http://wake-n-blake.dev/xmp/1.0/
Prefix:         wnb
Schema Version: 2
```

---

## Schema Definition

### Sidecar Self-Integrity

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:SchemaVersion` | Integer | Yes | Schema version (currently 2) for forward compatibility |
| `wnb:SidecarHash` | Text | Yes | BLAKE3 hash of XMP content (excluding this field) |
| `wnb:SidecarCreated` | Date | Yes | When this sidecar was created |
| `wnb:SidecarUpdated` | Date | Yes | When this sidecar was last updated |

### Core Identity

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:ContentHash` | Text | Yes | BLAKE3 hash (full 64 characters) |
| `wnb:HashAlgorithm` | Text | Yes | "blake3" / "sha256" / "sha512" |
| `wnb:FileSize` | Integer | Yes | File size in bytes |
| `wnb:Verified` | Boolean | Yes | Post-copy verification passed |

### File Classification

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:FileCategory` | Text | Yes | Primary category (see taxonomy below) |
| `wnb:FileSubcategory` | Text | No | Specific type within category |
| `wnb:DetectedMimeType` | Text | Yes | MIME type from magic bytes (not extension) |
| `wnb:DeclaredExtension` | Text | Yes | File extension as declared |
| `wnb:ExtensionMismatch` | Boolean | No | Extension doesn't match detected content |
| `wnb:FormatValid` | Boolean | No | File passes format validation |
| `wnb:FormatWarnings` | Seq | No | Validation warnings |

#### File Category Taxonomy

| Category | Subcategories | Description |
|----------|---------------|-------------|
| `image` | `photo`, `raw`, `graphic`, `screenshot`, `scan` | Still images |
| `video` | `clip`, `movie`, `timelapse`, `screen_recording` | Moving images |
| `audio` | `music`, `voice`, `podcast`, `sound_effect` | Sound files |
| `document` | `text`, `spreadsheet`, `presentation`, `pdf`, `ebook` | Documents |
| `archive` | `compressed`, `disk_image`, `backup` | Container formats |
| `sidecar` | `xmp`, `json`, `xml`, `thm` | Metadata files |
| `executable` | `application`, `script`, `library` | Runnable code |
| `data` | `database`, `config`, `log`, `cache` | Data files |
| `other` | — | Unclassified |

### Source Provenance

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:SourcePath` | Text | Yes | Full absolute path at origin |
| `wnb:SourceFilename` | Text | Yes | Original filename |
| `wnb:SourceHost` | Text | Yes | Hostname of source machine |
| `wnb:SourceVolume` | Text | No | Volume/mount label (e.g., "SDCARD_01") |
| `wnb:SourceVolumeSerial` | Text | No | Hardware serial of source media |
| `wnb:SourceType` | Text | Yes | Source classification (see below) |

#### Source Type Classification

| Type | Description | Examples |
|------|-------------|----------|
| `memory_card` | Removable flash media | SD, CF, CFexpress, microSD |
| `camera_direct` | Tethered camera connection | USB, WiFi direct |
| `phone_direct` | Phone/tablet connection | iPhone, Android via USB/MTP |
| `local_disk` | Internal/external drive | HDD, SSD, NVMe |
| `network_share` | Network mounted volume | SMB, NFS, AFP |
| `cloud_sync` | Cloud-synced folder | iCloud, Dropbox, OneDrive, Google Drive |
| `cloud_download` | Direct cloud download | Manual download from cloud UI |
| `web_download` | Downloaded from web | Browser download, wget, curl |
| `email_attachment` | Extracted from email | Mail.app, Outlook, Gmail |
| `messaging_app` | From messaging platform | iMessage, WhatsApp, Signal, Slack |
| `airdrop` | Apple AirDrop transfer | — |
| `bluetooth` | Bluetooth file transfer | — |
| `optical_disc` | CD/DVD/Blu-ray | — |
| `tape` | Tape backup media | LTO, DAT |
| `ftp_sftp` | FTP/SFTP transfer | — |
| `version_control` | From VCS | Git, SVN |
| `backup_restore` | Restored from backup | Time Machine, restic, borg |
| `forensic_recovery` | Recovered from damaged media | — |
| `unknown` | Source type not determinable | — |

### Timestamps (Full Set)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:OriginalMtime` | Date | Yes | Source file modification time (ISO 8601) |
| `wnb:OriginalCtime` | Date | No | Source file status change time |
| `wnb:OriginalBtime` | Date | No | Source file birth/creation time |
| `wnb:OriginalAtime` | Date | No | Source file last access time |
| `wnb:SourceTimezone` | Text | No | Timezone of source system (IANA format) |
| `wnb:ImportTimezone` | Text | No | Timezone where import ran |

### Import Context

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:ImportTimestamp` | Date | Yes | When this import occurred (ISO 8601) |
| `wnb:SessionID` | Text | Yes | Import session identifier |
| `wnb:ToolVersion` | Text | Yes | wake-n-blake version |
| `wnb:ImportUser` | Text | Yes | OS username who ran import |
| `wnb:ImportHost` | Text | Yes | Hostname where import ran |
| `wnb:ImportPlatform` | Text | Yes | "darwin" / "linux" / "win32" |
| `wnb:ImportOSVersion` | Text | No | Kernel/OS version string |
| `wnb:ImportMethod` | Text | No | "copy" / "move" / "hardlink" / "symlink" |

### Import Source Device Identification

**Chain of Custody Focus:** These fields identify the PHYSICAL DEVICE from which files were imported—not file metadata. This enables forensic-grade provenance tracking of the import source.

#### USB Device Fingerprint

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:USBVendorID` | Text | No | USB Vendor ID (e.g., `0x054c` for Sony) |
| `wnb:USBProductID` | Text | No | USB Product ID (e.g., `0x0994`) |
| `wnb:USBSerial` | Text | No | USB device serial number |
| `wnb:USBDevicePath` | Text | No | System device path (e.g., `/dev/disk4`) |
| `wnb:USBDeviceName` | Text | No | Human-readable device name |
| `wnb:USBBusLocation` | Text | No | USB bus/port location |

#### Card Reader Identification

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:CardReaderVendor` | Text | No | Card reader manufacturer |
| `wnb:CardReaderModel` | Text | No | Card reader model name |
| `wnb:CardReaderSerial` | Text | No | Card reader hardware serial |
| `wnb:CardReaderPort` | Text | No | Which slot/port on multi-slot reader |

#### Physical Media Serial

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:MediaType` | Text | No | "sd" / "cf" / "cfexpress" / "ssd" / "hdd" / "nvme" |
| `wnb:MediaSerial` | Text | No | Hardware serial of the physical media |
| `wnb:MediaManufacturer` | Text | No | Media manufacturer (SanDisk, Samsung, etc.) |
| `wnb:MediaCapacity` | Integer | No | Media capacity in bytes |
| `wnb:MediaFirmware` | Text | No | Media firmware version (if available) |

#### Camera/Device Direct Connection

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:CameraBodySerial` | Text | No | Camera body serial number (from USB/PTP) |
| `wnb:CameraInternalName` | Text | No | Camera's internal USB device name |
| `wnb:PhoneDeviceID` | Text | No | Phone/tablet unique device ID |
| `wnb:TetheredConnection` | Text | No | "usb" / "wifi" / "bluetooth" / "thunderbolt" |

#### Detection Priority

Import source device identification follows this priority:

1. **Tethered Camera** — Direct USB/PTP connection to camera body
2. **Phone/Tablet** — MTP/PTP connection to mobile device
3. **Card Reader** — USB card reader with inserted media
4. **Direct Media** — SD card in laptop slot, external SSD, etc.
5. **Network/Cloud** — No physical device (use source type instead)

### Batch/Collection Context

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:BatchID` | Text | No | Unique batch identifier |
| `wnb:BatchName` | Text | No | User-provided batch name |
| `wnb:BatchDescription` | Text | No | Notes about this import batch |
| `wnb:BatchFileCount` | Integer | No | Total files in batch |
| `wnb:BatchSequence` | Integer | No | This file's position (1 of N) |
| `wnb:BatchTotalBytes` | Integer | No | Total bytes in batch |

### Deduplication

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:DedupStatus` | Text | No | "unique" / "duplicate" / "hardlinked" |
| `wnb:DuplicateOf` | Text | No | Path to canonical file (if deduped) |
| `wnb:DuplicateCount` | Integer | No | Number of duplicates seen |
| `wnb:FirstSeenHash` | Text | No | Hash when first seen (for re-import comparison) |

### Hash Integrity Verification

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:HashMismatch` | Boolean | No | Hash differs from previous custody event |
| `wnb:PreviousHash` | Text | No | Hash from prior custody event (if mismatch) |
| `wnb:MismatchAction` | Text | No | "accepted" / "rejected" / "quarantined" |
| `wnb:MismatchReason` | Text | No | Explanation if mismatch was accepted |

### Collision Handling

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:CollisionOccurred` | Boolean | No | Destination filename already existed |
| `wnb:CollisionHandling` | Text | No | "renamed" / "overwritten" / "skipped" / "merged" |
| `wnb:OriginalDestName` | Text | No | Intended filename before collision rename |
| `wnb:FinalDestName` | Text | No | Actual destination filename used |

### Related Files (Companions)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:RelatedFiles` | Seq | No | List of related file references |
| `wnb:RelationType` | Text | No | Relationship type (see below) |
| `wnb:IsPrimaryFile` | Boolean | No | This is the primary file in the group |

#### Relation Types

| Type | Description |
|------|-------------|
| `raw_jpeg_pair` | RAW file and its embedded JPEG |
| `raw_sidecar` | RAW file and XMP/THM sidecar |
| `video_audio` | Video file with separate audio |
| `video_proxy` | Full-res video and proxy version |
| `burst_sequence` | Photos from burst/continuous shooting |
| `hdr_bracket` | HDR exposure bracket set |
| `panorama_set` | Images for panorama stitching |
| `focus_stack` | Focus stacking image set |
| `stereo_pair` | Left/right stereo images |
| `live_photo` | iOS Live Photo (HEIC + MOV) |
| `motion_photo` | Android Motion Photo (image + embedded MP4) |
| `sdr_hdr_pair` | SDR and HDR versions of same image |
| `drone_telemetry` | Video + SRT/LRF telemetry sidecar |
| `document_assets` | Document with embedded images/fonts |

---

## Live Photo & Motion Detection

### Overview

Live Photos and Motion Photos are multi-file captures that combine a still image with a short video clip. Wake-n-blake detects, links, and preserves these relationships.

### Detection Patterns

#### iOS Live Photo
```
IMG_1234.HEIC  +  IMG_1234.MOV  →  Live Photo pair
IMG_1234.JPG   +  IMG_1234.MOV  →  Live Photo pair (older devices)
```

**Detection Rules:**
1. Match by filename stem (case-insensitive)
2. Image: `.heic`, `.heif`, `.jpg`, `.jpeg`
3. Video: `.mov` (only, not `.mp4`)
4. Both must be in same source directory

#### Android Motion Photo
```
YYYYMMDD_HHMMSS.jpg  +  YYYYMMDD_HHMMSS.mp4  →  Motion Photo pair
```

**Detection Rules:**
1. Match by timestamp-based filename pattern
2. Video typically embedded in image (extracted separately by some tools)
3. Check for `MotionPhoto` EXIF tag if available

#### SDR/HDR Duplicates
```
IMG_1234.jpg      (HDR primary)
IMG_1234_SDR.jpg  (SDR fallback)
```

**Detection Rules:**
1. `_SDR` suffix indicates SDR version
2. SDR version auto-hidden when HDR exists

### XMP Fields for Motion Media

| Property | Type | Description |
|----------|------|-------------|
| `wnb:IsLivePhoto` | Boolean | Part of a Live Photo/Motion Photo set |
| `wnb:LivePhotoRole` | Text | "image" / "video" |
| `wnb:LivePhotoPairHash` | Text | Content hash of the paired file |
| `wnb:MotionHidden` | Boolean | Video component hidden from UI (still archived) |
| `wnb:SDRDuplicate` | Boolean | This is an SDR fallback of an HDR image |
| `wnb:HDRPrimaryHash` | Text | Hash of HDR version (if SDR duplicate) |

### Handling Behavior

| Scenario | Behavior |
|----------|----------|
| **Import Live Photo pair** | Both files imported; video marked `MotionHidden: true` |
| **Import only image** | Imported normally; no motion relationship |
| **Import only video** | Imported as standalone video |
| **Re-import pair** | Dedup by hash; relationship preserved |
| **Export with `--archive`** | Both files exported; relationship in XMP |

### DJI Drone Telemetry

DJI drones produce companion files:

| Extension | Content | Handling |
|-----------|---------|----------|
| `.SRT` | GPS, altitude, gimbal, speed | Parsed and linked to video |
| `.LRF` | Low-resolution reference frame | Hidden, linked to video |

**Detection:** Match by filename stem to `.MP4` or `.MOV` video

### Filesystem Metadata

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:SourceWasSymlink` | Boolean | No | Source was a symbolic link |
| `wnb:SymlinkTarget` | Text | No | Original symlink target path |
| `wnb:SourceHardlinkCount` | Integer | No | Number of hard links at source |
| `wnb:SourceInode` | Text | No | Inode number at source |
| `wnb:SourcePermissions` | Text | No | Unix permissions (octal) |
| `wnb:SourceOwner` | Text | No | Owner user:group |

### Platform-Specific Metadata

#### macOS

| Property | Type | Description |
|----------|------|-------------|
| `wnb:QuarantineOrigin` | Text | URL from com.apple.quarantine xattr |
| `wnb:QuarantineTimestamp` | Date | When file was quarantined |
| `wnb:QuarantineAgent` | Text | App that downloaded file |
| `wnb:ResourceForkSize` | Integer | Size of resource fork (bytes) |
| `wnb:ResourceForkHash` | Text | Hash of resource fork content |
| `wnb:ExtendedAttributes` | Seq | List of xattr names preserved |
| `wnb:FinderFlags` | Text | Finder info flags |
| `wnb:SpotlightComment` | Text | Finder comment (kMDItemComment) |

#### Windows

| Property | Type | Description |
|----------|------|-------------|
| `wnb:ZoneIdentifier` | Text | Zone.Identifier ADS content |
| `wnb:AlternateDataStreams` | Seq | List of NTFS ADS names |

### Chain of Custody (Append-Only)

Based on [PREMIS event model](https://www.loc.gov/standards/premis/).

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:CustodyChain` | Seq | Yes | Ordered list of custody events |
| `wnb:FirstSeen` | Date | Yes | Earliest known timestamp |
| `wnb:EventCount` | Integer | Yes | Number of events in chain |

#### Custody Event Structure

Each event in `wnb:CustodyChain` contains:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wnb:EventID` | Text | Yes | Unique event identifier (ULID) |
| `wnb:EventTimestamp` | Date | Yes | When this event occurred |
| `wnb:EventAction` | Text | Yes | Action type (see below) |
| `wnb:EventOutcome` | Text | Yes | "success" / "failure" / "partial" |
| `wnb:EventLocation` | Text | No | Path or device where action occurred |
| `wnb:EventHost` | Text | No | Hostname where action occurred |
| `wnb:EventUser` | Text | No | User who performed action |
| `wnb:EventTool` | Text | No | Tool/version that performed action |
| `wnb:EventHash` | Text | No | Hash at time of event (detects modifications) |
| `wnb:EventHashAlgorithm` | Text | No | Algorithm used for event hash |
| `wnb:EventNotes` | Text | No | Optional notes/context |
| `wnb:EventDetails` | Text | No | JSON blob for action-specific details |

#### Event Actions (PREMIS-Aligned)

| Action | Description |
|--------|-------------|
| `creation` | File was originally created (from EXIF/metadata) |
| `ingestion` | File was ingested into archive (PREMIS term) |
| `message_digest_calculation` | Hash was computed |
| `fixity_check` | Integrity verification performed |
| `virus_check` | Malware scan performed |
| `format_identification` | File type detected |
| `format_validation` | File format validated |
| `migration` | File converted to new format |
| `normalization` | File normalized for preservation |
| `replication` | File copied to new location |
| `deletion` | File removed (record kept) |
| `modification` | File content modified |
| `metadata_modification` | Metadata modified (not content) |
| `deaccession` | File removed from archive |
| `recovery` | File recovered from damage/deletion |
| `quarantine` | File isolated for review |
| `release` | File released from quarantine |
| `access` | File was accessed/exported |
| `redaction` | Sensitive content redacted |
| `decryption` | File decrypted |
| `compression` | File compressed |
| `decompression` | File decompressed |

### Inherited Metadata (Photo)

| Property | Type | Description |
|----------|------|-------------|
| `wnb:InheritedXMP` | Text | Base64-encoded original XMP packet |
| `wnb:InheritedSidecar` | Text | Base64-encoded original sidecar content |
| `wnb:InheritedSidecarFormat` | Text | Format of inherited sidecar (xmp/json/xml) |
| `wnb:CreationDevice` | Text | Camera/device model (from EXIF) |
| `wnb:CreationSoftware` | Text | Software that created file (from EXIF) |
| `wnb:CaptureDate` | Date | Original capture date (from EXIF) |
| `wnb:GPSLatitude` | Real | GPS latitude (from EXIF) |
| `wnb:GPSLongitude` | Real | GPS longitude (from EXIF) |
| `wnb:GPSAltitude` | Real | GPS altitude in meters (from EXIF) |
| `wnb:LensModel` | Text | Lens used (from EXIF) |
| `wnb:FocalLength` | Text | Focal length (from EXIF) |
| `wnb:Aperture` | Text | F-stop (from EXIF) |
| `wnb:ShutterSpeed` | Text | Shutter speed (from EXIF) |
| `wnb:ISO` | Integer | ISO sensitivity (from EXIF) |
| `wnb:ColorSpace` | Text | Color space (sRGB, AdobeRGB, ProPhoto) |
| `wnb:BitDepth` | Integer | Bits per channel |
| `wnb:ICCProfile` | Text | ICC profile name |

### Video Metadata (MediaInfo/ffprobe)

| Property | Type | Description |
|----------|------|-------------|
| `wnb:VideoContainer` | Text | Container format (MP4, MOV, MKV, etc.) |
| `wnb:VideoCodec` | Text | Video codec (H.264, H.265, ProRes, etc.) |
| `wnb:VideoResolution` | Text | Resolution (e.g., "3840x2160") |
| `wnb:VideoWidth` | Integer | Frame width in pixels |
| `wnb:VideoHeight` | Integer | Frame height in pixels |
| `wnb:VideoFrameRate` | Real | Frame rate (fps) |
| `wnb:VideoFrameRateMode` | Text | "constant" / "variable" |
| `wnb:VideoBitRate` | Integer | Video bitrate (bps) |
| `wnb:VideoDuration` | Real | Duration in seconds |
| `wnb:VideoFrameCount` | Integer | Total frame count |
| `wnb:VideoColorSpace` | Text | Color space (Rec.709, Rec.2020, etc.) |
| `wnb:VideoHDR` | Text | HDR format (HDR10, HLG, Dolby Vision) |
| `wnb:VideoScanType` | Text | "progressive" / "interlaced" |
| `wnb:AudioCodec` | Text | Audio codec (AAC, PCM, etc.) |
| `wnb:AudioChannels` | Integer | Number of audio channels |
| `wnb:AudioSampleRate` | Integer | Sample rate (Hz) |
| `wnb:AudioBitRate` | Integer | Audio bitrate (bps) |
| `wnb:AudioBitDepth` | Integer | Audio bit depth |
| `wnb:TimecodeStart` | Text | SMPTE timecode start |
| `wnb:ChapterCount` | Integer | Number of chapters |

### Audio Metadata (mutagen/id3v2)

| Property | Type | Description |
|----------|------|-------------|
| `wnb:AudioAlbum` | Text | Album name |
| `wnb:AudioArtist` | Text | Artist name |
| `wnb:AudioTitle` | Text | Track title |
| `wnb:AudioTrack` | Text | Track number (e.g., "5/12") |
| `wnb:AudioDisc` | Text | Disc number (e.g., "1/2") |
| `wnb:AudioYear` | Integer | Release year |
| `wnb:AudioGenre` | Text | Genre |
| `wnb:AudioDuration` | Real | Duration in seconds |
| `wnb:AudioFormat` | Text | Format (MP3, FLAC, AAC, etc.) |
| `wnb:AudioHasArt` | Boolean | Album art embedded |
| `wnb:AudioReplayGain` | Real | ReplayGain value (dB) |
| `wnb:AudioBPM` | Integer | Beats per minute |
| `wnb:AudioComment` | Text | Comment field |

### Document Metadata (Tika/Poppler)

| Property | Type | Description |
|----------|------|-------------|
| `wnb:DocumentTitle` | Text | Document title |
| `wnb:DocumentAuthor` | Text | Document author |
| `wnb:DocumentSubject` | Text | Document subject |
| `wnb:DocumentKeywords` | Seq | Keywords list |
| `wnb:DocumentCreated` | Date | Document creation date |
| `wnb:DocumentModified` | Date | Document modification date |
| `wnb:DocumentPageCount` | Integer | Number of pages |
| `wnb:DocumentWordCount` | Integer | Word count (if available) |
| `wnb:DocumentLanguage` | Text | Document language (ISO 639) |
| `wnb:PDFVersion` | Text | PDF version (e.g., "1.7") |
| `wnb:PDFProducer` | Text | PDF producer software |
| `wnb:PDFEncrypted` | Boolean | PDF is encrypted |
| `wnb:PDFHasForm` | Boolean | PDF contains form fields |
| `wnb:PDFHasSignature` | Boolean | PDF is digitally signed |
| `wnb:OfficeApplication` | Text | Office application (Word, Excel, etc.) |
| `wnb:OfficeTemplate` | Text | Template used |

### Ebook Metadata (Calibre)

| Property | Type | Description |
|----------|------|-------------|
| `wnb:EbookTitle` | Text | Book title |
| `wnb:EbookAuthor` | Seq | Author(s) |
| `wnb:EbookPublisher` | Text | Publisher |
| `wnb:EbookISBN` | Text | ISBN |
| `wnb:EbookLanguage` | Text | Language (ISO 639) |
| `wnb:EbookFormat` | Text | Format (EPUB, MOBI, AZW, PDF) |
| `wnb:EbookSeries` | Text | Series name |
| `wnb:EbookSeriesIndex` | Real | Position in series |
| `wnb:EbookPublishDate` | Date | Publication date |
| `wnb:EbookHasCover` | Boolean | Cover image present |

### Format Verification (Siegfried)

| Property | Type | Description |
|----------|------|-------------|
| `wnb:PRONOMId` | Text | PRONOM format ID (e.g., "fmt/18") |
| `wnb:PRONOMName` | Text | PRONOM format name |
| `wnb:FormatVersion` | Text | Specific format version |
| `wnb:FormatBasis` | Text | How format was identified (signature, extension, etc.) |
| `wnb:FormatWarning` | Text | Any warnings from identification |

### Cloud/Download Provenance

| Property | Type | Description |
|----------|------|-------------|
| `wnb:DownloadURL` | Text | Original download URL (if known) |
| `wnb:DownloadTimestamp` | Date | When downloaded |
| `wnb:DownloadReferrer` | Text | HTTP referrer (if available) |
| `wnb:CloudService` | Text | "icloud" / "dropbox" / "gdrive" / etc. |
| `wnb:CloudPath` | Text | Path within cloud service |
| `wnb:CloudSharedBy` | Text | Email/name if shared by someone |
| `wnb:CloudShareDate` | Date | When shared |
| `wnb:EmailSubject` | Text | If from email attachment |
| `wnb:EmailSender` | Text | If from email attachment |
| `wnb:EmailDate` | Date | If from email attachment |

### Error/Warning Log

| Property | Type | Description |
|----------|------|-------------|
| `wnb:ImportWarnings` | Seq | List of warnings during import |
| `wnb:ImportErrors` | Seq | List of non-fatal errors |
| `wnb:RetryCount` | Integer | Number of retries needed |
| `wnb:RecoveryAttempted` | Boolean | Recovery was attempted |
| `wnb:RecoveryMethod` | Text | How recovery was performed |

---

## Embedding Strategy

### Formats Supporting XMP Embedding

| Format | Embedding Support | Notes |
|--------|-------------------|-------|
| JPEG | Yes | APP1 segment |
| TIFF | Yes | Tag 700 |
| PNG | Yes | iTXt chunk |
| PDF | Yes | Metadata stream |
| PSD | Yes | Image resource |
| DNG/CR2/CR3/NEF/ARW | Yes | Varies by format |
| MP4/MOV | Yes | UUID atom |
| HEIC/HEIF | Yes | meta box |
| WebP | Partial | Extended format only |
| GIF | No | Sidecar only |
| BMP | No | Sidecar only |
| RAR/ZIP/TAR | No | Sidecar only |

### Dual-Write Behavior

For all files:
1. **Always** create `.xmp` sidecar
2. **If format supports embedding**: also embed XMP in file
3. Both copies contain identical data
4. Sidecar is canonical if discrepancy detected

---

## File Renaming

### Default Behavior: BLAKE3-16 Hash Naming

By default, wake-n-blake renames all imported files to their truncated BLAKE3 hash:

```
Original:   IMG_4523.CR3
Renamed:    a7f3b2c1d4e5f678.CR3
            └── 16-char BLAKE3 hash (64 bits)
```

### Rationale

| Benefit | Description |
|---------|-------------|
| **Collision-resistant** | Hash-based names virtually eliminate filename conflicts |
| **Content-addressable** | Filename IS the content identifier |
| **Dedup-friendly** | Identical files = identical names = instant dedup detection |
| **Platform-safe** | No special characters, consistent length, case-insensitive safe |
| **Provenance preserved** | Original filename stored in XMP sidecar (`wnb:SourceFilename`) |

### Renaming Schema

| Component | Value | Description |
|-----------|-------|-------------|
| Base name | First 16 chars of BLAKE3 hash | Content identifier |
| Extension | Preserved from original | `.CR3`, `.jpg`, `.mov`, etc. |
| Case | Lowercase hash, original extension case | `a7f3b2c1d4e5f678.CR3` |

### Sidecar Naming

Sidecars follow the renamed file:

```
Original:   IMG_4523.CR3  +  IMG_4523.CR3.xmp (if existed)
Renamed:    a7f3b2c1d4e5f678.CR3  +  a7f3b2c1d4e5f678.CR3.xmp
```

### Preserve Original Name (`--preserve-name` / `-P`)

When `--preserve-name` is used:
- Files keep their original names
- Collision handling applies (see Collision Handling section)
- XMP sidecar still records both `wnb:SourceFilename` and `wnb:FinalDestName`

### XMP Fields for Renaming

| Property | Type | Description |
|----------|------|-------------|
| `wnb:WasRenamed` | Boolean | File was renamed during import |
| `wnb:SourceFilename` | Text | Original filename before rename |
| `wnb:DestFilename` | Text | Final filename after import |
| `wnb:RenameReason` | Text | "hash_naming" / "collision" / "sanitization" |

---

## CLI Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--archive` | `-a` | Bring existing sidecar content with the file (merged into new XMP) |
| `--skip-sidecar` | `-S` | Do not create XMP sidecars (not recommended for archival use) |
| `--preserve-name` | `-P` | Keep original filenames instead of hash-based naming |
| `--batch-name` | `-b` | Name for this import batch |
| `--source-type` | `-t` | Override auto-detected source type |
| `--quarantine` | `-q` | Mark all files for review before release |

### Warning Behavior

When `--skip-sidecar` is used:
- Print warning: `⚠️  Skipping XMP sidecar generation. Provenance will not be recorded.`
- Still perform all other operations (hash, copy, verify)
- Manifest will note `"sidecarGenerated": false` for affected files
- Embedded XMP is also skipped (no metadata written to files)

---

## Existing Sidecar Handling

### Default Behavior (No Flag)

When source has existing `.xmp` sidecar:
1. Read and parse existing sidecar
2. Extract relevant metadata into `wnb:Inherited*` fields
3. Add custody event: `ingestion`
4. Original sidecar **stays at source** (not copied)
5. New sidecar created at destination with merged data

### Archive Mode (`--archive` or `-a`)

When source has existing `.xmp` sidecar:
1. Read and parse existing sidecar
2. **Preserve entire original sidecar** in `wnb:InheritedSidecar` (base64)
3. Merge all custody events into unified chain
4. Original sidecar **travels with file** (as embedded data)
5. New sidecar created at destination with complete history

---

## Source Type Detection

### Auto-Detection Heuristics

| Pattern | Detected Type |
|---------|---------------|
| `/Volumes/*` + removable flag | `memory_card` or `local_disk` |
| `/dev/mmcblk*` | `memory_card` |
| `DCIM/` in path | `memory_card` (camera) |
| `/mnt/`, `/media/` | `local_disk` or `network_share` |
| SMB/CIFS mount | `network_share` |
| `~/Library/Mobile Documents/` | `cloud_sync` (iCloud) |
| `~/Dropbox/` | `cloud_sync` |
| `~/Google Drive/` | `cloud_sync` |
| `~/OneDrive/` | `cloud_sync` |
| `com.apple.quarantine` xattr present | `web_download` or `email_attachment` |
| `.eml`, `.msg` source | `email_attachment` |
| `gphoto2://` | `camera_direct` |
| MTP path | `phone_direct` |

---

## Source Device Detection

### USB Device Fingerprinting

#### macOS

```bash
# List all USB devices with details
system_profiler SPUSBDataType -json

# Get USB device info by mount point (trace back from volume)
diskutil info /Volumes/SDCARD | grep "Device Node"
# Output: Device Node: /dev/disk4s1

# Find USB info for a specific disk
ioreg -p IOUSB -l -w 0 | grep -A 20 "disk4"

# Get vendor/product IDs and serial
ioreg -r -c IOUSBDevice | grep -E "(USB Vendor Name|USB Product Name|USB Serial Number|idVendor|idProduct)"
```

#### Linux

```bash
# List all USB devices
lsusb -v

# Get USB device info by device node
udevadm info --query=all --name=/dev/sdb | grep -E "(ID_VENDOR|ID_MODEL|ID_SERIAL|ID_USB)"

# Get full USB path including bus location
udevadm info --query=all --name=/dev/sdb | grep DEVPATH
```

#### Windows

```powershell
# List all USB devices
Get-PnpDevice -Class USB | Select-Object Status, Class, FriendlyName, InstanceId

# Get USB device details
Get-CimInstance Win32_USBHub | Select-Object DeviceID, Name, PNPDeviceID

# Get USB storage specifically
Get-WmiObject Win32_DiskDrive | Where-Object { $_.InterfaceType -eq 'USB' } |
    Select-Object Model, SerialNumber, PNPDeviceID
```

### Card Reader Detection

#### macOS

```bash
# Detect card readers
ioreg -r -c IOCardReaderDriver

# Get card reader USB device
system_profiler SPUSBDataType -json | jq '.SPUSBDataType[] | select(.manufacturer_string | contains("Card"))'

# Multi-slot reader - identify which slot
ioreg -r -c IOSDCard | grep -E "(Slot|Card Reader)"
```

#### Linux

```bash
# Card reader via SD/MMC subsystem
ls /sys/class/mmc_host/
cat /sys/class/mmc_host/mmc0/device/name

# USB card reader info
udevadm info --query=all --name=/dev/mmcblk0 | grep -E "(ID_.*READER|ID_SERIAL)"
```

### Media Serial Detection

#### SD Card Physical Serial (macOS)

```bash
# Get SD card hardware serial (not filesystem UUID)
ioreg -r -c IOSDCard | grep "Serial Number"

# Get SD card CID (Card Identification register)
ioreg -r -c IOSDCard | grep -E "(CID|Product Name|OEM ID|Manufacturer)"

# Via diskutil (gets volume info, not hardware)
diskutil info /Volumes/SDCARD | grep "Volume UUID"
```

#### SD Card Physical Serial (Linux)

```bash
# SD card serial from sysfs
cat /sys/block/mmcblk0/device/serial

# Full card identification
cat /sys/block/mmcblk0/device/cid      # Card ID
cat /sys/block/mmcblk0/device/name     # Product name
cat /sys/block/mmcblk0/device/manfid   # Manufacturer ID
cat /sys/block/mmcblk0/device/oemid    # OEM ID
```

#### Disk Serial (All Platforms)

```bash
# macOS - disk hardware serial
system_profiler SPStorageDataType -json | jq '.SPStorageDataType[].physical_drive.device_serial'
diskutil info /dev/disk4 | grep "Device / Media Name"

# Linux - disk serial
udevadm info --query=all --name=/dev/sdb | grep ID_SERIAL
hdparm -I /dev/sdb | grep "Serial Number"

# Windows
Get-PhysicalDisk | Select-Object DeviceId, SerialNumber, MediaType
```

### Camera Body Serial (Tethered)

#### Via gphoto2 (Linux/macOS)

```bash
# Detect connected cameras
gphoto2 --auto-detect

# Get camera serial number
gphoto2 --get-config /main/settings/serialnumber

# Get all camera info
gphoto2 --summary
```

#### Via PTP/USB (macOS)

```bash
# List PTP devices
system_profiler SPCameraDataType

# Get camera USB device info
ioreg -r -c IOUSBDevice | grep -A 30 "Canon"  # or Sony, Nikon, etc.
```

#### Via libmtp (Android Phones)

```bash
# List MTP devices
mtp-detect

# Get device info
mtp-detect | grep -E "(Serial|Manufacturer|Model)"
```

### Implementation Notes

- Device detection is **best-effort** — not all devices expose serials
- Store whatever is available; empty strings for undetectable fields
- Cache device info per session (avoid repeated lookups during batch import)
- USB device path may change between connections; prefer hardware serial for identification
- Some card readers don't expose slot identification for multi-slot units
- Camera serial via tether may require camera-specific drivers (Canon EOS Utility, Sony Imaging Edge, etc.)

### Node.js Implementation Approach

```typescript
// Recommended packages for device detection
// macOS: use child_process to call ioreg, system_profiler, diskutil
// Linux: use child_process to call udevadm, lsblk
// Windows: use wmic or PowerShell via child_process

interface ImportSourceDevice {
  // USB device
  usbVendorId?: string;      // 0x054c
  usbProductId?: string;     // 0x0994
  usbSerial?: string;
  usbDevicePath?: string;
  usbDeviceName?: string;
  usbBusLocation?: string;

  // Card reader (if applicable)
  cardReaderVendor?: string;
  cardReaderModel?: string;
  cardReaderSerial?: string;
  cardReaderPort?: string;

  // Physical media
  mediaType?: 'sd' | 'cf' | 'cfexpress' | 'ssd' | 'hdd' | 'nvme';
  mediaSerial?: string;
  mediaManufacturer?: string;
  mediaCapacity?: number;
  mediaFirmware?: string;

  // Camera/phone (if tethered)
  cameraBodySerial?: string;
  cameraInternalName?: string;
  phoneDeviceId?: string;
  tetheredConnection?: 'usb' | 'wifi' | 'bluetooth' | 'thunderbolt';
}

async function detectImportSourceDevice(volumePath: string): Promise<ImportSourceDevice> {
  const platform = process.platform;

  if (platform === 'darwin') {
    return detectMacOSDevice(volumePath);
  } else if (platform === 'linux') {
    return detectLinuxDevice(volumePath);
  } else if (platform === 'win32') {
    return detectWindowsDevice(volumePath);
  }

  return {};
}
```

---

## File Type Detection

### Magic Bytes Detection

Use [file-type](https://github.com/sindresorhus/file-type) or similar library that detects types via magic bytes rather than extension.

Key principle: **Trust magic bytes, not extensions.**

```typescript
// Example detection
const fileType = await fileTypeFromFile(path);
const declaredExt = path.extname(filePath);
const extensionMismatch = fileType?.ext !== declaredExt.slice(1);
```

### MIME Type Mapping

Map detected types to categories:

| MIME Pattern | Category |
|--------------|----------|
| `image/*` | `image` |
| `video/*` | `video` |
| `audio/*` | `audio` |
| `application/pdf` | `document` |
| `application/zip`, `application/x-*-compressed` | `archive` |
| `text/*` | `document` |
| `application/json`, `application/xml` | `data` or `sidecar` |

---

## Metadata Extraction Stack

Deep metadata extraction uses specialized tools per file category. All extracted metadata is normalized and written to XMP sidecar fields.

### Extraction Priority

```
file + libmagic → Detect category → Route to specialized tools → Normalize → XMP
```

### 1. Photo

| Priority | Tool | Purpose |
|----------|------|---------|
| 1 | **ExifTool** | EXIF, IPTC, XMP, maker notes, GPS — Swiss army knife |
| 2 | **exiv2** | Faster batch ops, cleaner standards compliance |
| 3 | **libraw** (raw-identify) | RAW sensor data, proprietary camera internals, lens corrections |
| 4 | **GDAL** (gdalinfo) | GeoTIFF, drone imagery, projection data beyond ExifTool |
| * | **ImageMagick** (identify) | ICC profiles, color space, bit depth — technical properties |

### 2. Video

| Priority | Tool | Purpose |
|----------|------|---------|
| 1 | **MediaInfo** | Containers, codecs, bitrates, chapters, stream counts |
| 2 | **ffprobe** | Stream-level detail, frame counts, timecodes, encoding params |
| 3 | **ExifTool** | Embedded XMP, QuickTime metadata, creation date |
| 4 | **MKVToolNix** (mkvinfo) | Matroska-specific deep extraction |
| 5 | **AtomicParsley** | MP4/M4V metadata specialist |

### 3. Audio

| Priority | Tool | Purpose |
|----------|------|---------|
| 1 | **ExifTool** | Embedded metadata across formats |
| 2 | **MediaInfo** | Container/codec info |
| 3 | **mutagen** | FLAC, Ogg, MP4/M4A, WMA, APE — broad format coverage |
| 4 | **ffprobe** | Stream-level detail, codec parameters |
| 5 | **metaflac** | FLAC-specific, Vorbis comments, embedded art |
| 6 | **id3v2/eyeD3** | MP3 ID3 tags, album art, genre/year/track |

### 4. Documents

| Priority | Tool | Purpose |
|----------|------|---------|
| 1 | **ExifTool** | XMP, PDF metadata, Office doc properties |
| 2 | **Poppler** (pdfinfo/pdftotext) | PDF structure, fonts, encryption, page geometry |
| 3 | **Apache Tika** | Enterprise-grade: Office, emails, archives, EPUBs, HTML |

### 5. Ebooks

| Priority | Tool | Purpose |
|----------|------|---------|
| 1 | **ebook-meta** (Calibre) | EPUB, MOBI, AZW metadata extraction |

### 6. Verification/Detection

| Priority | Tool | Purpose |
|----------|------|---------|
| 1 | **file + libmagic** | MIME detection, magic bytes, format verification |
| 2 | **Siegfried** | PRONOM-based format ID — National Archives standard for digital preservation |

### Tool-to-XMP Field Mapping

#### Photo Fields (ExifTool → XMP)

| Source Field | Maps To |
|--------------|---------|
| `EXIF:Make` + `EXIF:Model` | `wnb:CreationDevice` |
| `EXIF:Software` | `wnb:CreationSoftware` |
| `EXIF:DateTimeOriginal` | `wnb:CaptureDate` |
| `EXIF:GPSLatitude` | `wnb:GPSLatitude` |
| `EXIF:GPSLongitude` | `wnb:GPSLongitude` |
| `EXIF:GPSAltitude` | `wnb:GPSAltitude` |
| `EXIF:LensModel` | `wnb:LensModel` |
| `EXIF:FocalLength` | `wnb:FocalLength` |
| `EXIF:FNumber` | `wnb:Aperture` |
| `EXIF:ExposureTime` | `wnb:ShutterSpeed` |
| `EXIF:ISOSpeedRatings` | `wnb:ISO` |
| `EXIF:SerialNumber` | `wnb:CameraBodySerial` (if tethered) |
| `XMP:CreateDate` | Fallback for `wnb:CaptureDate` |
| `XMP:CreatorTool` | Fallback for `wnb:CreationSoftware` |

#### Video Fields (MediaInfo/ffprobe → XMP)

| Source Field | Maps To |
|--------------|---------|
| `Format` | `wnb:VideoContainer` |
| `CodecID` | `wnb:VideoCodec` |
| `Width` x `Height` | `wnb:VideoResolution` |
| `FrameRate` | `wnb:VideoFrameRate` |
| `BitRate` | `wnb:VideoBitRate` |
| `Duration` | `wnb:VideoDuration` |
| `Encoded_Date` | `wnb:CaptureDate` |
| `AudioCodecID` | `wnb:AudioCodec` |
| `AudioChannels` | `wnb:AudioChannels` |
| `AudioSamplingRate` | `wnb:AudioSampleRate` |

#### Audio Fields (mutagen/id3v2 → XMP)

| Source Field | Maps To |
|--------------|---------|
| `Title` | `dc:title` |
| `Artist` | `dc:creator` |
| `Album` | `wnb:AudioAlbum` |
| `Year` | `wnb:AudioYear` |
| `Track` | `wnb:AudioTrack` |
| `Genre` | `wnb:AudioGenre` |
| `Duration` | `wnb:AudioDuration` |
| `BitRate` | `wnb:AudioBitRate` |
| `SampleRate` | `wnb:AudioSampleRate` |

#### Document Fields (Tika/Poppler → XMP)

| Source Field | Maps To |
|--------------|---------|
| `dc:title` | `dc:title` |
| `dc:creator` | `dc:creator` |
| `pdf:PDFVersion` | `wnb:PDFVersion` |
| `xmp:CreateDate` | `wnb:DocumentCreated` |
| `xmp:ModifyDate` | `wnb:DocumentModified` |
| `xmp:CreatorTool` | `wnb:CreationSoftware` |
| `pdf:encrypted` | `wnb:DocumentEncrypted` |
| `Content-Length` | `wnb:FileSize` |
| `Content-Type` | `wnb:DetectedMimeType` |

### Extraction Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    file + libmagic                          │
│               Detect MIME type & category                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
     ┌─────────┐    ┌──────────┐    ┌───────────┐
     │  Photo  │    │  Video   │    │   Audio   │
     └────┬────┘    └────┬─────┘    └─────┬─────┘
          │              │                │
          ▼              ▼                ▼
    ExifTool        MediaInfo        ExifTool
    exiv2           ffprobe          MediaInfo
    libraw          ExifTool         mutagen
          │              │                │
          └──────────────┴────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │  Normalize to    │
              │  XMP properties  │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │  Write sidecar   │
              │  + embed (opt)   │
              └──────────────────┘
```

### Node.js Implementation

```typescript
// Recommended packages
import { exiftool } from 'exiftool-vendored';  // ExifTool wrapper
import { fileTypeFromFile } from 'file-type';   // Magic bytes detection
import { execFile } from 'child_process';       // For mediainfo, ffprobe, etc.

interface MetadataExtractor {
  extract(filePath: string): Promise<Record<string, unknown>>;
}

const extractors: Record<string, MetadataExtractor[]> = {
  'image': [exiftoolExtractor, exiv2Extractor, librawExtractor],
  'video': [mediainfoExtractor, ffprobeExtractor, exiftoolExtractor],
  'audio': [exiftoolExtractor, mediainfoExtractor, mutagenExtractor],
  'document': [exiftoolExtractor, popplerExtractor, tikaExtractor],
};

async function extractMetadata(filePath: string): Promise<XmpSidecar> {
  // 1. Detect file type
  const fileType = await fileTypeFromFile(filePath);
  const category = categorizeFileType(fileType);

  // 2. Run extractors in priority order
  const metadata: Record<string, unknown> = {};
  for (const extractor of extractors[category] ?? []) {
    try {
      const result = await extractor.extract(filePath);
      Object.assign(metadata, result); // Later extractors override earlier
    } catch (e) {
      // Log and continue to next extractor
    }
  }

  // 3. Normalize to XMP schema
  return normalizeToXmp(metadata, category);
}
```

### Binary Dependencies

| Tool | Install (macOS) | Install (Linux) | Install (Windows) |
|------|-----------------|-----------------|-------------------|
| ExifTool | `brew install exiftool` | `apt install libimage-exiftool-perl` | [exiftool.org](https://exiftool.org) |
| MediaInfo | `brew install mediainfo` | `apt install mediainfo` | [mediaarea.net](https://mediaarea.net) |
| ffprobe | `brew install ffmpeg` | `apt install ffmpeg` | [ffmpeg.org](https://ffmpeg.org) |
| exiv2 | `brew install exiv2` | `apt install exiv2` | [exiv2.org](https://exiv2.org) |
| libraw | `brew install libraw` | `apt install libraw-bin` | [libraw.org](https://libraw.org) |
| Poppler | `brew install poppler` | `apt install poppler-utils` | [poppler.freedesktop.org](https://poppler.freedesktop.org) |
| Apache Tika | Java JAR download | Java JAR download | Java JAR download |
| Siegfried | `brew install siegfried` | [github.com/richardlehane/siegfried](https://github.com/richardlehane/siegfried) | Binary release |
| ImageMagick | `brew install imagemagick` | `apt install imagemagick` | [imagemagick.org](https://imagemagick.org) |
| GDAL | `brew install gdal` | `apt install gdal-bin` | [gdal.org](https://gdal.org) |
| MKVToolNix | `brew install mkvtoolnix` | `apt install mkvtoolnix` | [mkvtoolnix.download](https://mkvtoolnix.download) |
| AtomicParsley | `brew install atomicparsley` | `apt install atomicparsley` | Binary release |
| mutagen | `pip install mutagen` | `pip install mutagen` | `pip install mutagen` |
| Calibre | `brew install calibre` | `apt install calibre` | [calibre-ebook.com](https://calibre-ebook.com) |

### Optional: Deep Metadata Pass

For archival-grade extraction, run multiple tools and merge results:

```bash
# Photo: full extraction
exiftool -json -G -struct photo.jpg > photo.exiftool.json
exiv2 -pa photo.jpg > photo.exiv2.txt
raw-identify -v photo.CR3 > photo.libraw.txt

# Video: full extraction
mediainfo --Output=JSON video.mp4 > video.mediainfo.json
ffprobe -v quiet -print_format json -show_format -show_streams video.mp4 > video.ffprobe.json
exiftool -json -G video.mp4 > video.exiftool.json

# Document: full extraction
exiftool -json -G document.pdf > document.exiftool.json
pdfinfo document.pdf > document.pdfinfo.txt
java -jar tika-app.jar -j document.pdf > document.tika.json
```

---

## Example: Complete XMP Sidecar

```xml
<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:wnb="http://wake-n-blake.dev/xmp/1.0/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/">

      <!-- Sidecar Self-Integrity -->
      <wnb:SchemaVersion>2</wnb:SchemaVersion>
      <wnb:SidecarHash>b7e23ec29af22b0b4e41da31e868d57226121c84</wnb:SidecarHash>
      <wnb:SidecarCreated>2025-12-22T09:15:43Z</wnb:SidecarCreated>
      <wnb:SidecarUpdated>2025-12-22T09:15:43Z</wnb:SidecarUpdated>

      <!-- Core Identity -->
      <wnb:ContentHash>af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262</wnb:ContentHash>
      <wnb:HashAlgorithm>blake3</wnb:HashAlgorithm>
      <wnb:FileSize>28459832</wnb:FileSize>
      <wnb:Verified>true</wnb:Verified>

      <!-- File Classification -->
      <wnb:FileCategory>image</wnb:FileCategory>
      <wnb:FileSubcategory>raw</wnb:FileSubcategory>
      <wnb:DetectedMimeType>image/x-canon-cr3</wnb:DetectedMimeType>
      <wnb:DeclaredExtension>.CR3</wnb:DeclaredExtension>
      <wnb:ExtensionMismatch>false</wnb:ExtensionMismatch>
      <wnb:FormatValid>true</wnb:FormatValid>

      <!-- Source Provenance -->
      <wnb:SourcePath>/Volumes/SDCARD_01/DCIM/100CANON/IMG_4523.CR3</wnb:SourcePath>
      <wnb:SourceFilename>IMG_4523.CR3</wnb:SourceFilename>
      <wnb:SourceHost>blake-macbook</wnb:SourceHost>
      <wnb:SourceVolume>SDCARD_01</wnb:SourceVolume>
      <wnb:SourceVolumeSerial>0x1234ABCD</wnb:SourceVolumeSerial>
      <wnb:SourceType>memory_card</wnb:SourceType>

      <!-- Import Source Device (Physical Chain of Custody) -->
      <wnb:USBVendorID>0x05ac</wnb:USBVendorID>
      <wnb:USBProductID>0x8406</wnb:USBProductID>
      <wnb:USBSerial>000000000820</wnb:USBSerial>
      <wnb:USBDevicePath>/dev/disk4</wnb:USBDevicePath>
      <wnb:USBDeviceName>Apple Internal Memory Card Reader</wnb:USBDeviceName>
      <wnb:CardReaderVendor>Apple</wnb:CardReaderVendor>
      <wnb:CardReaderModel>Internal Memory Card Reader</wnb:CardReaderModel>
      <wnb:MediaType>sd</wnb:MediaType>
      <wnb:MediaSerial>0x2b3d9127</wnb:MediaSerial>
      <wnb:MediaManufacturer>SanDisk</wnb:MediaManufacturer>
      <wnb:MediaCapacity>128849018880</wnb:MediaCapacity>

      <!-- Timestamps -->
      <wnb:OriginalMtime>2025-12-20T14:32:17Z</wnb:OriginalMtime>
      <wnb:OriginalBtime>2025-12-20T14:32:17Z</wnb:OriginalBtime>
      <wnb:SourceTimezone>America/Los_Angeles</wnb:SourceTimezone>
      <wnb:ImportTimezone>America/Los_Angeles</wnb:ImportTimezone>

      <!-- Import Context -->
      <wnb:ImportTimestamp>2025-12-22T09:15:43Z</wnb:ImportTimestamp>
      <wnb:SessionID>wnb_2025-12-22_09-15-00_a7f3b2c1</wnb:SessionID>
      <wnb:ToolVersion>0.2.0</wnb:ToolVersion>
      <wnb:ImportUser>blake</wnb:ImportUser>
      <wnb:ImportHost>blake-macbook</wnb:ImportHost>
      <wnb:ImportPlatform>darwin</wnb:ImportPlatform>
      <wnb:ImportOSVersion>Darwin 25.2.0</wnb:ImportOSVersion>
      <wnb:ImportMethod>copy</wnb:ImportMethod>

      <!-- Batch Context -->
      <wnb:BatchID>batch_2025-12-22_a7f3b2c1</wnb:BatchID>
      <wnb:BatchName>December shoot - client A</wnb:BatchName>
      <wnb:BatchFileCount>247</wnb:BatchFileCount>
      <wnb:BatchSequence>42</wnb:BatchSequence>

      <!-- Deduplication -->
      <wnb:DedupStatus>unique</wnb:DedupStatus>

      <!-- Related Files -->
      <wnb:RelatedFiles>
        <rdf:Seq>
          <rdf:li>IMG_4523.CR3.xmp</rdf:li>
        </rdf:Seq>
      </wnb:RelatedFiles>
      <wnb:RelationType>raw_sidecar</wnb:RelationType>
      <wnb:IsPrimaryFile>true</wnb:IsPrimaryFile>

      <!-- Inherited Metadata -->
      <wnb:CreationDevice>Canon EOS R5</wnb:CreationDevice>
      <wnb:CreationSoftware>Firmware 1.8.1</wnb:CreationSoftware>
      <wnb:CaptureDate>2025-12-20T14:32:17Z</wnb:CaptureDate>
      <wnb:GPSLatitude>37.7749</wnb:GPSLatitude>
      <wnb:GPSLongitude>-122.4194</wnb:GPSLongitude>
      <wnb:GPSAltitude>52.3</wnb:GPSAltitude>
      <wnb:LensModel>RF 24-70mm F2.8 L IS USM</wnb:LensModel>
      <wnb:FocalLength>50mm</wnb:FocalLength>
      <wnb:Aperture>f/4.0</wnb:Aperture>
      <wnb:ShutterSpeed>1/250</wnb:ShutterSpeed>
      <wnb:ISO>400</wnb:ISO>

      <!-- Chain of Custody -->
      <wnb:FirstSeen>2025-12-20T14:32:17Z</wnb:FirstSeen>
      <wnb:EventCount>3</wnb:EventCount>
      <wnb:CustodyChain>
        <rdf:Seq>
          <rdf:li rdf:parseType="Resource">
            <wnb:EventID>01JFXYZ123456789ABCDEF0001</wnb:EventID>
            <wnb:EventTimestamp>2025-12-20T14:32:17Z</wnb:EventTimestamp>
            <wnb:EventAction>creation</wnb:EventAction>
            <wnb:EventOutcome>success</wnb:EventOutcome>
            <wnb:EventLocation>Canon EOS R5</wnb:EventLocation>
            <wnb:EventHost>camera</wnb:EventHost>
            <wnb:EventTool>Canon EOS R5 Firmware 1.8.1</wnb:EventTool>
            <wnb:EventHash>af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262</wnb:EventHash>
            <wnb:EventHashAlgorithm>blake3</wnb:EventHashAlgorithm>
          </rdf:li>
          <rdf:li rdf:parseType="Resource">
            <wnb:EventID>01JFXYZ123456789ABCDEF0002</wnb:EventID>
            <wnb:EventTimestamp>2025-12-22T09:15:42Z</wnb:EventTimestamp>
            <wnb:EventAction>message_digest_calculation</wnb:EventAction>
            <wnb:EventOutcome>success</wnb:EventOutcome>
            <wnb:EventHost>blake-macbook</wnb:EventHost>
            <wnb:EventUser>blake</wnb:EventUser>
            <wnb:EventTool>wake-n-blake 0.2.0</wnb:EventTool>
            <wnb:EventHash>af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262</wnb:EventHash>
            <wnb:EventHashAlgorithm>blake3</wnb:EventHashAlgorithm>
          </rdf:li>
          <rdf:li rdf:parseType="Resource">
            <wnb:EventID>01JFXYZ123456789ABCDEF0003</wnb:EventID>
            <wnb:EventTimestamp>2025-12-22T09:15:43Z</wnb:EventTimestamp>
            <wnb:EventAction>ingestion</wnb:EventAction>
            <wnb:EventOutcome>success</wnb:EventOutcome>
            <wnb:EventLocation>/Volumes/Archive/2025/12/20/IMG_4523.CR3</wnb:EventLocation>
            <wnb:EventHost>blake-macbook</wnb:EventHost>
            <wnb:EventUser>blake</wnb:EventUser>
            <wnb:EventTool>wake-n-blake 0.2.0</wnb:EventTool>
            <wnb:EventHash>af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262</wnb:EventHash>
            <wnb:EventHashAlgorithm>blake3</wnb:EventHashAlgorithm>
            <wnb:EventNotes>Initial import from SD card</wnb:EventNotes>
          </rdf:li>
        </rdf:Seq>
      </wnb:CustodyChain>

    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
```

---

## Implementation Checklist

### Phase 1: Core

- [ ] XMP sidecar writer (XML generation)
- [ ] Sidecar self-hash calculation
- [ ] Schema version management
- [ ] File category detection (magic bytes)
- [ ] Source type auto-detection
- [ ] Full timestamp extraction (mtime, ctime, btime)
- [ ] BLAKE3-16 file renaming (default behavior)

### Phase 2: Source Device Detection

- [ ] USB device fingerprinting (macOS)
- [ ] USB device fingerprinting (Linux)
- [ ] USB device fingerprinting (Windows)
- [ ] Card reader detection
- [ ] SD card physical serial extraction
- [ ] Camera body serial (tethered via gphoto2/PTP)
- [ ] Phone device ID (MTP connections)
- [ ] Device info caching per session

### Phase 3: Metadata Extraction Stack

- [ ] ExifTool wrapper (photo, video, document)
- [ ] MediaInfo wrapper (video, audio)
- [ ] ffprobe wrapper (video, audio)
- [ ] exiv2 wrapper (photo - faster batch ops)
- [ ] libraw wrapper (RAW files)
- [ ] Poppler wrapper (PDF)
- [ ] Apache Tika wrapper (documents, Office)
- [ ] mutagen wrapper (audio tags)
- [ ] metaflac wrapper (FLAC)
- [ ] id3v2/eyeD3 wrapper (MP3)
- [ ] ebook-meta wrapper (EPUB, MOBI)
- [ ] file + libmagic (MIME detection)
- [ ] Siegfried integration (PRONOM format ID)
- [ ] GDAL wrapper (GeoTIFF, drone imagery)
- [ ] ImageMagick identify (ICC, color, bit depth)
- [ ] MKVToolNix wrapper (Matroska)
- [ ] AtomicParsley wrapper (MP4/M4V)
- [ ] Category-based tool routing
- [ ] Metadata normalization to XMP schema
- [ ] Cloud/download provenance extraction
- [ ] macOS quarantine xattr extraction
- [ ] Related file detection (Live Photo, RAW+JPEG pairs)

### Phase 4: Embedding

- [ ] XMP embedder per format (JPEG, TIFF, PNG, PDF, MP4)
- [ ] Existing sidecar parser and merger
- [ ] `--archive` flag implementation
- [ ] `--preserve-name` flag implementation

### Phase 5: Integrity

- [ ] Custody chain append logic
- [ ] Hash mismatch detection
- [ ] Collision handling
- [ ] Batch context tracking

---

## References

### Standards

- [PREMIS 3.0](https://www.loc.gov/standards/premis/) — Preservation Metadata standard
- [OAIS Reference Model](https://public.ccsds.org/pubs/650x0m2.pdf) — Open Archival Information System
- [BagIt RFC 8493](https://datatracker.ietf.org/doc/html/rfc8493) — File packaging format
- [XMP Specification](https://www.adobe.com/devnet/xmp.html) — Extensible Metadata Platform
- [ISO/IEC 27037](https://www.iso.org/standard/44381.html) — Digital evidence handling

### Tools

- [ExifTool](https://exiftool.org/) — Metadata extraction
- [Archivematica](https://www.archivematica.org/) — Digital preservation system
- [Photo Mechanic](https://home.camerabits.com/) — Professional photo workflow
- [restic](https://restic.net/) / [borg](https://borgbackup.readthedocs.io/) — Backup with integrity verification

### Research

- [Digital Preservation Vocabulary](https://digital-preservation-a-critical-vocabulary.pubpub.org/) — Critical definitions
- [DAM Workflows](https://www.canto.com/digital-asset-management/) — Asset management patterns

---

## Supported File Extensions

Comprehensive extension lists derived from production systems ([nightfoxfilms](https://github.com/nightfoxfilms), [abandoned-archive](https://github.com/abandoned-archive)).

### Image Formats (93+ extensions)

#### Standard Web/Display
`.jpg`, `.jpeg`, `.jpe`, `.jfif`, `.png`, `.gif`, `.bmp`, `.tiff`, `.tif`, `.webp`

#### Modern/Advanced
`.heic`, `.heif`, `.hif` (Apple HEIF), `.avif` (AV1), `.jxl` (JPEG XL), `.jp2`, `.jpx`, `.j2k`, `.j2c` (JPEG 2000)

#### RAW Camera Formats
| Brand | Extensions |
|-------|------------|
| Adobe | `.dng` |
| Canon | `.cr2`, `.cr3`, `.crw`, `.ciff` |
| Nikon | `.nef`, `.nrw` |
| Sony | `.arw`, `.arq`, `.srf`, `.sr2` |
| Fujifilm | `.raf` |
| Olympus | `.orf`, `.ori` |
| Panasonic/Leica | `.rw2`, `.raw`, `.rwl` |
| Pentax | `.pef`, `.ptx` |
| Samsung | `.srw` |
| Sigma | `.x3f` |
| Hasselblad | `.3fr`, `.fff` |
| Phase One | `.iiq` |
| Mamiya/Leaf | `.mef`, `.mos` |
| Kodak | `.dcr`, `.k25`, `.kdc` |
| Minolta | `.mrw` |
| Epson | `.erf` |
| GoPro | `.gpr` |
| Rawzor | `.rwz` |

#### Professional/Scientific
`.exr` (OpenEXR), `.hdr`, `.dpx` (Digital Picture Exchange), `.cin` (Cineon), `.fits`, `.fit`, `.fts` (FITS)

#### Vector/Print
`.ai`, `.eps`, `.epsf`, `.svg`, `.svgz`, `.pdf` (when image-only)

#### Legacy/Specialty
`.psd`, `.psb` (Photoshop), `.tga`, `.icb`, `.vda`, `.vst` (Targa), `.pcx`, `.dcx`, `.ppm`, `.pgm`, `.pbm`, `.pnm`, `.dds`, `.ico`, `.cur`

### Video Formats (50+ extensions)

#### Modern Container Formats
`.mp4`, `.m4v`, `.mov`, `.mkv`, `.webm`, `.mxf`, `.gxf`

#### Broadcast/Professional
`.mts`, `.m2ts`, `.ts` (Transport Stream), `.vob`, `.mpg`, `.mpeg`, `.mpe`, `.mpv`, `.m2v`

#### Camera Raw
`.r3d` (RED), `.braw` (Blackmagic), `.ari` (ARRI)

#### Legacy/Regional
`.avi`, `.divx`, `.wmv`, `.asf`, `.flv`, `.f4v`, `.rm`, `.rmvb`, `.3gp`, `.3g2`, `.dv`, `.dif`

#### Specialty
`.ogv`, `.ogg`, `.ogm`, `.nut`, `.roq`, `.nsv`, `.bik`, `.bk2`, `.smk`, `.yuv`, `.y4m`

### Audio Formats
`.wav`, `.mp3`, `.aac`, `.flac`, `.m4a`, `.aiff`, `.aif`, `.ogg`, `.oga`, `.opus`, `.wma`, `.spx`

### Document Formats
`.pdf`, `.doc`, `.docx`, `.docm`, `.xls`, `.xlsx`, `.xlsm`, `.xlsb`, `.ppt`, `.pptx`, `.pptm`, `.odt`, `.ods`, `.odp`, `.odg`, `.rtf`, `.txt`, `.text`, `.log`, `.csv`, `.tsv`, `.epub`, `.mobi`, `.azw`, `.azw3`, `.djvu`, `.djv`, `.xps`, `.oxps`

### Metadata/Sidecar Formats
`.xmp` (XMP sidecar), `.xml` (generic XML), `.json`, `.thm` (thumbnail), `.srt` (subtitles/telemetry), `.vtt`, `.edl`, `.fcpxml`, `.aaf`, `.omf`, `.mhl`, `.md5`

### GIS/Map Formats
`.geotiff`, `.gtiff`, `.gpx`, `.kml`, `.kmz`, `.shp`, `.geojson`, `.topojson`, `.osm`, `.mbtiles`

### Auto-Hidden Files

Files that are imported but hidden from default views:

| Extension | Reason |
|-----------|--------|
| `.aae` | Apple photo adjustment sidecar |
| `.lrf` | DJI low-res reference frame |
| `.thm` | Thumbnail/preview (when original exists) |
| `*_SDR.*` | SDR duplicate when HDR exists |
| Live Photo `.mov` | Motion component of Live Photo |

### Skipped/Ignored Files

Files that are **not** imported:

| Pattern | Reason |
|---------|--------|
| `._*` | macOS resource fork remnants |
| `.DS_Store` | macOS folder metadata |
| `Thumbs.db` | Windows thumbnail cache |
| `desktop.ini` | Windows folder settings |
| `.Spotlight-*` | macOS Spotlight index |
| `.fseventsd` | macOS filesystem events |
| `.Trashes` | macOS trash folder |

---

## AI/ML Integration (Optional)

Wake-n-blake can optionally integrate with AI systems for enhanced metadata extraction. This is non-blocking and fire-and-forget.

### Supported Providers

| Provider | Models | Use Case |
|----------|--------|----------|
| **Ollama (local)** | LLaVA, Llama 3.2 Vision, BakLLaVA | Image captioning, tagging |
| **OpenAI** | GPT-4o, GPT-4o Mini | Cloud vision analysis |
| **Anthropic** | Claude 3.5 Sonnet/Haiku | Cloud vision analysis |
| **Google** | Gemini 1.5 Pro/Flash | Cloud vision analysis |
| **ONNX** | SigLIP, CLIP, RAM++ | Local embeddings, auto-tagging |

### XMP Fields for AI Metadata

| Property | Type | Description |
|----------|------|-------------|
| `wnb:AICaption` | Text | Auto-generated description |
| `wnb:AITags` | Seq | Auto-generated tags |
| `wnb:AIModel` | Text | Model that generated metadata |
| `wnb:AIConfidence` | Real | Confidence score (0-1) |
| `wnb:AITimestamp` | Date | When AI analysis was performed |
| `wnb:ViewType` | Text | "exterior" / "interior" / "aerial" / "detail" / "portrait" |
| `wnb:QualityScore` | Real | Image quality assessment (0-1) |

### Processing Flow

```
Import completes → Fire-and-forget AI jobs → XMP updated when ready
                   ↓
                   Jobs queued with BACKGROUND priority
                   ↓
                   Results written to sidecar asynchronously
```

---

## Future Considerations

- **Per-filetype plugins** — Specialized handling for RAW formats, video, documents
- **Signature support** — Optional cryptographic signing of custody events
- **Distributed ledger** — Optional blockchain anchoring for legal chain of custody
- **Search index** — SQLite index of all XMP sidecars for fast querying
- **Perceptual hashing** — pHash/dHash for near-duplicate detection across re-encodes
- **Face/object detection** — Optional local ML for content indexing
- **Legal hold flags** — Retention policy and legal hold support
- **Video proxy generation** — 720p H.264 proxies for instant scrubbing
- **Scene detection** — Content-based shot boundary detection for video
- **BagIt export** — RFC 8493 archive packages for long-term preservation
