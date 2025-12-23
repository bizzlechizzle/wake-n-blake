/**
 * XMP Sidecar Reader
 *
 * Parses XMP sidecar files back into structured data.
 */

import * as fs from 'node:fs/promises';
import { createHash as createBlake3Hash } from 'blake3';
import {
  type XmpSidecarData,
  type CustodyEvent,
  type CustodyEventAction,
  type FileCategory,
  type SourceType,
  type ImportSourceDevice,
  type PhotoMetadata,
  type VideoMetadata,
  type AudioMetadata,
  type DocumentMetadata,
  type RelationType,
  type MediaType,
} from './schema.js';

/**
 * Parse result with validation info
 */
export interface ParseResult {
  data: XmpSidecarData;
  isValid: boolean;
  hashMatch: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Read and parse an XMP sidecar file
 */
export async function readSidecar(sidecarPath: string): Promise<ParseResult> {
  const content = await fs.readFile(sidecarPath, 'utf-8');
  return parseSidecarContent(content);
}

/**
 * Parse XMP sidecar content string
 */
export function parseSidecarContent(content: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Verify sidecar hash if present
  const storedHash = extractValue(content, 'SidecarHash');
  let hashMatch = true;

  if (storedHash) {
    // Remove hash line and its leading whitespace/newline to restore original content
    const withoutHash = content.replace(/\n\s*<wnb:SidecarHash>.*<\/wnb:SidecarHash>/g, '');
    const hasher = createBlake3Hash();
    hasher.update(withoutHash);
    const calculatedHash = hasher.digest('hex');
    hashMatch = storedHash === calculatedHash;
    if (!hashMatch) {
      errors.push('Sidecar hash mismatch - file may have been modified');
    }
  } else {
    warnings.push('No sidecar hash present');
  }

  // Parse required fields
  const schemaVersion = parseInt(extractValue(content, 'SchemaVersion') || '0', 10);
  const sidecarCreated = extractValue(content, 'SidecarCreated') || '';
  const sidecarUpdated = extractValue(content, 'SidecarUpdated') || '';
  const contentHash = extractValue(content, 'ContentHash') || '';
  const fileSize = parseInt(extractValue(content, 'FileSize') || '0', 10);
  const verified = extractValue(content, 'Verified') === 'true';
  const fileCategory = (extractValue(content, 'FileCategory') || 'other') as FileCategory;
  const detectedMimeType = extractValue(content, 'DetectedMimeType') || 'application/octet-stream';
  const declaredExtension = extractValue(content, 'DeclaredExtension') || '';
  const sourcePath = extractValue(content, 'SourcePath') || '';
  const sourceFilename = extractValue(content, 'SourceFilename') || '';
  const sourceHost = extractValue(content, 'SourceHost') || '';
  const sourceType = (extractValue(content, 'SourceType') || 'unknown') as SourceType;
  const originalMtime = extractValue(content, 'OriginalMtime') || '';
  const importTimestamp = extractValue(content, 'ImportTimestamp') || '';
  const sessionId = extractValue(content, 'SessionID') || '';
  const toolVersion = extractValue(content, 'ToolVersion') || '';
  const importUser = extractValue(content, 'ImportUser') || '';
  const importHost = extractValue(content, 'ImportHost') || '';
  const importPlatform = (extractValue(content, 'ImportPlatform') || 'darwin') as 'darwin' | 'linux' | 'win32';
  const firstSeen = extractValue(content, 'FirstSeen') || '';
  const eventCount = parseInt(extractValue(content, 'EventCount') || '0', 10);

  // Validate required fields
  if (!contentHash) errors.push('Missing required field: ContentHash');
  if (!sourcePath) errors.push('Missing required field: SourcePath');
  if (!importTimestamp) errors.push('Missing required field: ImportTimestamp');
  if (!sessionId) errors.push('Missing required field: SessionID');

  // Parse optional fields
  const fileSubcategory = extractValue(content, 'FileSubcategory');
  const extensionMismatch = extractValue(content, 'ExtensionMismatch') === 'true';
  const formatValid = extractValue(content, 'FormatValid') === 'true';
  const sourceVolume = extractValue(content, 'SourceVolume');
  const sourceVolumeSerial = extractValue(content, 'SourceVolumeSerial');
  const originalCtime = extractValue(content, 'OriginalCtime');
  const originalBtime = extractValue(content, 'OriginalBtime');
  const originalAtime = extractValue(content, 'OriginalAtime');
  const sourceTimezone = extractValue(content, 'SourceTimezone');
  const importTimezone = extractValue(content, 'ImportTimezone');
  const importOSVersion = extractValue(content, 'ImportOSVersion');
  const importMethod = extractValue(content, 'ImportMethod') as 'copy' | 'move' | 'hardlink' | 'symlink' | undefined;

  // Parse source device
  const sourceDevice = parseSourceDevice(content);

  // Parse batch context
  const batchId = extractValue(content, 'BatchID');
  const batchName = extractValue(content, 'BatchName');
  const batchDescription = extractValue(content, 'BatchDescription');
  const batchFileCount = extractValue(content, 'BatchFileCount');
  const batchSequence = extractValue(content, 'BatchSequence');
  const batchTotalBytes = extractValue(content, 'BatchTotalBytes');

  // Parse deduplication
  const dedupStatus = extractValue(content, 'DedupStatus') as 'unique' | 'duplicate' | 'hardlinked' | undefined;
  const duplicateOf = extractValue(content, 'DuplicateOf');
  const duplicateCount = extractValue(content, 'DuplicateCount');

  // Parse file renaming
  const wasRenamed = extractValue(content, 'WasRenamed') === 'true';
  const destFilename = extractValue(content, 'DestFilename');
  const renameReason = extractValue(content, 'RenameReason') as 'hash_naming' | 'collision' | 'sanitization' | undefined;

  // Parse related files
  const isLivePhoto = extractValue(content, 'IsLivePhoto') === 'true';
  const livePhotoRole = extractValue(content, 'LivePhotoRole') as 'image' | 'video' | undefined;
  const livePhotoPairHash = extractValue(content, 'LivePhotoPairHash');
  const relationType = extractValue(content, 'RelationType') as RelationType | undefined;
  const isPrimaryFile = extractValue(content, 'IsPrimaryFile') === 'true';

  // Parse category-specific metadata
  const photo = parsePhotoMetadata(content);
  const video = parseVideoMetadata(content);
  const audio = parseAudioMetadata(content);
  const document = parseDocumentMetadata(content);

  // Parse custody chain
  const custodyChain = parseCustodyChain(content);

  // Parse cloud/download provenance
  const downloadURL = extractValue(content, 'DownloadURL');
  const downloadTimestamp = extractValue(content, 'DownloadTimestamp');
  const downloadReferrer = extractValue(content, 'DownloadReferrer');
  const cloudService = extractValue(content, 'CloudService');
  const cloudPath = extractValue(content, 'CloudPath');
  const cloudSharedBy = extractValue(content, 'CloudSharedBy');
  const cloudShareDate = extractValue(content, 'CloudShareDate');
  const emailSubject = extractValue(content, 'EmailSubject');
  const emailSender = extractValue(content, 'EmailSender');
  const emailDate = extractValue(content, 'EmailDate');

  // Parse platform-specific
  const quarantineOrigin = extractValue(content, 'QuarantineOrigin');
  const quarantineTimestamp = extractValue(content, 'QuarantineTimestamp');
  const quarantineAgent = extractValue(content, 'QuarantineAgent');
  const zoneIdentifier = extractValue(content, 'ZoneIdentifier');

  // Parse warnings/errors
  const importWarnings = parseStringArray(content, 'ImportWarnings');
  const importErrors = parseStringArray(content, 'ImportErrors');

  const data: XmpSidecarData = {
    schemaVersion,
    sidecarCreated,
    sidecarUpdated,
    contentHash,
    hashAlgorithm: 'blake3',
    fileSize,
    verified,
    fileCategory,
    fileSubcategory,
    detectedMimeType,
    declaredExtension,
    extensionMismatch,
    formatValid,
    sourcePath,
    sourceFilename,
    sourceHost,
    sourceVolume,
    sourceVolumeSerial,
    sourceType,
    sourceDevice,
    originalMtime,
    originalCtime,
    originalBtime,
    originalAtime,
    sourceTimezone,
    importTimezone,
    importTimestamp,
    sessionId,
    toolVersion,
    importUser,
    importHost,
    importPlatform,
    importOSVersion,
    importMethod,
    batchId,
    batchName,
    batchDescription,
    batchFileCount: batchFileCount ? parseInt(batchFileCount, 10) : undefined,
    batchSequence: batchSequence ? parseInt(batchSequence, 10) : undefined,
    batchTotalBytes: batchTotalBytes ? parseInt(batchTotalBytes, 10) : undefined,
    dedupStatus,
    duplicateOf,
    duplicateCount: duplicateCount ? parseInt(duplicateCount, 10) : undefined,
    wasRenamed: wasRenamed || undefined,
    destFilename,
    renameReason,
    isLivePhoto: isLivePhoto || undefined,
    livePhotoRole,
    livePhotoPairHash,
    relationType,
    isPrimaryFile: isPrimaryFile || undefined,
    photo,
    video,
    audio,
    document,
    downloadURL,
    downloadTimestamp,
    downloadReferrer,
    cloudService,
    cloudPath,
    cloudSharedBy,
    cloudShareDate,
    emailSubject,
    emailSender,
    emailDate,
    quarantineOrigin,
    quarantineTimestamp,
    quarantineAgent,
    zoneIdentifier,
    custodyChain,
    firstSeen,
    eventCount,
    importWarnings: importWarnings.length > 0 ? importWarnings : undefined,
    importErrors: importErrors.length > 0 ? importErrors : undefined,
  };

  return {
    data,
    isValid: errors.length === 0,
    hashMatch,
    errors,
    warnings,
  };
}

/**
 * Extract a value from XMP content by tag name
 */
function extractValue(content: string, tagName: string): string | undefined {
  const regex = new RegExp(`<wnb:${tagName}>([^<]*)</wnb:${tagName}>`);
  const match = content.match(regex);
  return match ? unescapeXml(match[1]) : undefined;
}

/**
 * Parse source device from XMP content
 */
function parseSourceDevice(content: string): ImportSourceDevice | undefined {
  const usbVendorId = extractValue(content, 'USBVendorID');
  const usbProductId = extractValue(content, 'USBProductID');
  const usbSerial = extractValue(content, 'USBSerial');
  const usbDevicePath = extractValue(content, 'USBDevicePath');
  const usbDeviceName = extractValue(content, 'USBDeviceName');
  const usbBusLocation = extractValue(content, 'USBBusLocation');

  const cardReaderVendor = extractValue(content, 'CardReaderVendor');
  const cardReaderModel = extractValue(content, 'CardReaderModel');
  const cardReaderSerial = extractValue(content, 'CardReaderSerial');
  const cardReaderPort = extractValue(content, 'CardReaderPort');

  const mediaType = extractValue(content, 'MediaType') as MediaType | undefined;
  const mediaSerial = extractValue(content, 'MediaSerial');
  const mediaManufacturer = extractValue(content, 'MediaManufacturer');
  const mediaCapacity = extractValue(content, 'MediaCapacity');
  const mediaFirmware = extractValue(content, 'MediaFirmware');

  const cameraBodySerial = extractValue(content, 'CameraBodySerial');
  const cameraInternalName = extractValue(content, 'CameraInternalName');
  const phoneDeviceId = extractValue(content, 'PhoneDeviceID');
  const tetheredConnection = extractValue(content, 'TetheredConnection') as 'usb' | 'wifi' | 'bluetooth' | 'thunderbolt' | undefined;

  const hasUsb = usbVendorId || usbProductId || usbSerial || usbDevicePath || usbDeviceName;
  const hasCardReader = cardReaderVendor || cardReaderModel || cardReaderSerial;
  const hasMedia = mediaType || mediaSerial || mediaManufacturer || mediaCapacity;
  const hasCamera = cameraBodySerial || cameraInternalName || phoneDeviceId || tetheredConnection;

  if (!hasUsb && !hasCardReader && !hasMedia && !hasCamera) {
    return undefined;
  }

  return {
    usb: hasUsb ? {
      vendorId: usbVendorId,
      productId: usbProductId,
      serial: usbSerial,
      devicePath: usbDevicePath,
      deviceName: usbDeviceName,
      busLocation: usbBusLocation,
    } : undefined,
    cardReader: hasCardReader ? {
      vendor: cardReaderVendor,
      model: cardReaderModel,
      serial: cardReaderSerial,
      port: cardReaderPort,
    } : undefined,
    media: hasMedia ? {
      type: mediaType,
      serial: mediaSerial,
      manufacturer: mediaManufacturer,
      capacity: mediaCapacity ? parseInt(mediaCapacity, 10) : undefined,
      firmware: mediaFirmware,
    } : undefined,
    cameraBodySerial,
    cameraInternalName,
    phoneDeviceId,
    tetheredConnection,
  };
}

/**
 * Parse photo metadata from XMP content
 */
function parsePhotoMetadata(content: string): PhotoMetadata | undefined {
  const creationDevice = extractValue(content, 'CreationDevice');
  const creationSoftware = extractValue(content, 'CreationSoftware');
  const captureDate = extractValue(content, 'CaptureDate');
  const gpsLatitude = extractValue(content, 'GPSLatitude');
  const gpsLongitude = extractValue(content, 'GPSLongitude');
  const gpsAltitude = extractValue(content, 'GPSAltitude');
  const lensModel = extractValue(content, 'LensModel');
  const focalLength = extractValue(content, 'FocalLength');
  const aperture = extractValue(content, 'Aperture');
  const shutterSpeed = extractValue(content, 'ShutterSpeed');
  const iso = extractValue(content, 'ISO');
  const colorSpace = extractValue(content, 'ColorSpace');
  const bitDepth = extractValue(content, 'BitDepth');
  const iccProfile = extractValue(content, 'ICCProfile');

  const hasData = creationDevice || creationSoftware || captureDate ||
    gpsLatitude || gpsLongitude || lensModel || focalLength ||
    aperture || shutterSpeed || iso;

  if (!hasData) return undefined;

  return {
    creationDevice,
    creationSoftware,
    captureDate,
    gpsLatitude: gpsLatitude ? parseFloat(gpsLatitude) : undefined,
    gpsLongitude: gpsLongitude ? parseFloat(gpsLongitude) : undefined,
    gpsAltitude: gpsAltitude ? parseFloat(gpsAltitude) : undefined,
    lensModel,
    focalLength,
    aperture,
    shutterSpeed,
    iso: iso ? parseInt(iso, 10) : undefined,
    colorSpace,
    bitDepth: bitDepth ? parseInt(bitDepth, 10) : undefined,
    iccProfile,
  };
}

/**
 * Parse video metadata from XMP content
 */
function parseVideoMetadata(content: string): VideoMetadata | undefined {
  const container = extractValue(content, 'VideoContainer');
  const codec = extractValue(content, 'VideoCodec');
  const resolution = extractValue(content, 'VideoResolution');
  const width = extractValue(content, 'VideoWidth');
  const height = extractValue(content, 'VideoHeight');
  const frameRate = extractValue(content, 'VideoFrameRate');
  const frameRateMode = extractValue(content, 'VideoFrameRateMode') as 'constant' | 'variable' | undefined;
  const bitRate = extractValue(content, 'VideoBitRate');
  const duration = extractValue(content, 'VideoDuration');
  const frameCount = extractValue(content, 'VideoFrameCount');
  const colorSpace = extractValue(content, 'VideoColorSpace');
  const hdr = extractValue(content, 'VideoHDR');
  const scanType = extractValue(content, 'VideoScanType') as 'progressive' | 'interlaced' | undefined;
  const audioCodec = extractValue(content, 'AudioCodec');
  const audioChannels = extractValue(content, 'AudioChannels');
  const audioSampleRate = extractValue(content, 'AudioSampleRate');
  const audioBitRate = extractValue(content, 'AudioBitRate');
  const audioBitDepth = extractValue(content, 'AudioBitDepth');
  const timecodeStart = extractValue(content, 'TimecodeStart');
  const chapterCount = extractValue(content, 'ChapterCount');

  const hasData = container || codec || resolution || frameRate || duration || audioCodec;

  if (!hasData) return undefined;

  return {
    container,
    codec,
    resolution,
    width: width ? parseInt(width, 10) : undefined,
    height: height ? parseInt(height, 10) : undefined,
    frameRate: frameRate ? parseFloat(frameRate) : undefined,
    frameRateMode,
    bitRate: bitRate ? parseInt(bitRate, 10) : undefined,
    duration: duration ? parseFloat(duration) : undefined,
    frameCount: frameCount ? parseInt(frameCount, 10) : undefined,
    colorSpace,
    hdr,
    scanType,
    audioCodec,
    audioChannels: audioChannels ? parseInt(audioChannels, 10) : undefined,
    audioSampleRate: audioSampleRate ? parseInt(audioSampleRate, 10) : undefined,
    audioBitRate: audioBitRate ? parseInt(audioBitRate, 10) : undefined,
    audioBitDepth: audioBitDepth ? parseInt(audioBitDepth, 10) : undefined,
    timecodeStart,
    chapterCount: chapterCount ? parseInt(chapterCount, 10) : undefined,
  };
}

/**
 * Parse audio metadata from XMP content
 */
function parseAudioMetadata(content: string): AudioMetadata | undefined {
  const album = extractValue(content, 'AudioAlbum');
  const artist = extractValue(content, 'AudioArtist');
  const title = extractValue(content, 'AudioTitle');
  const track = extractValue(content, 'AudioTrack');
  const disc = extractValue(content, 'AudioDisc');
  const year = extractValue(content, 'AudioYear');
  const genre = extractValue(content, 'AudioGenre');
  const duration = extractValue(content, 'AudioDuration');
  const format = extractValue(content, 'AudioFormat');
  const hasArt = extractValue(content, 'AudioHasArt');
  const replayGain = extractValue(content, 'AudioReplayGain');
  const bpm = extractValue(content, 'AudioBPM');
  const comment = extractValue(content, 'AudioComment');

  const hasData = album || artist || title || track || year || genre || duration;

  if (!hasData) return undefined;

  return {
    album,
    artist,
    title,
    track,
    disc,
    year: year ? parseInt(year, 10) : undefined,
    genre,
    duration: duration ? parseFloat(duration) : undefined,
    format,
    hasArt: hasArt === 'true',
    replayGain: replayGain ? parseFloat(replayGain) : undefined,
    bpm: bpm ? parseInt(bpm, 10) : undefined,
    comment,
  };
}

/**
 * Parse document metadata from XMP content
 */
function parseDocumentMetadata(content: string): DocumentMetadata | undefined {
  const title = extractValue(content, 'DocumentTitle');
  const author = extractValue(content, 'DocumentAuthor');
  const subject = extractValue(content, 'DocumentSubject');
  const created = extractValue(content, 'DocumentCreated');
  const modified = extractValue(content, 'DocumentModified');
  const pageCount = extractValue(content, 'DocumentPageCount');
  const wordCount = extractValue(content, 'DocumentWordCount');
  const language = extractValue(content, 'DocumentLanguage');
  const pdfVersion = extractValue(content, 'PDFVersion');
  const pdfProducer = extractValue(content, 'PDFProducer');
  const pdfEncrypted = extractValue(content, 'PDFEncrypted');
  const pdfHasForm = extractValue(content, 'PDFHasForm');
  const pdfHasSignature = extractValue(content, 'PDFHasSignature');
  const officeApplication = extractValue(content, 'OfficeApplication');
  const officeTemplate = extractValue(content, 'OfficeTemplate');

  const hasData = title || author || pageCount || pdfVersion;

  if (!hasData) return undefined;

  return {
    title,
    author,
    subject,
    created,
    modified,
    pageCount: pageCount ? parseInt(pageCount, 10) : undefined,
    wordCount: wordCount ? parseInt(wordCount, 10) : undefined,
    language,
    pdfVersion,
    pdfProducer,
    pdfEncrypted: pdfEncrypted === 'true',
    pdfHasForm: pdfHasForm === 'true',
    pdfHasSignature: pdfHasSignature === 'true',
    officeApplication,
    officeTemplate,
  };
}

/**
 * Parse custody chain events from XMP content
 */
function parseCustodyChain(content: string): CustodyEvent[] {
  const events: CustodyEvent[] = [];

  // Match all rdf:li elements within CustodyChain
  const chainMatch = content.match(/<wnb:CustodyChain>[\s\S]*?<rdf:Seq>([\s\S]*?)<\/rdf:Seq>/);
  if (!chainMatch) return events;

  const itemsContent = chainMatch[1];
  const itemRegex = /<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/g;
  let match;

  while ((match = itemRegex.exec(itemsContent)) !== null) {
    const itemContent = match[1];

    const eventId = extractValueFromContent(itemContent, 'EventID') || '';
    const eventTimestamp = extractValueFromContent(itemContent, 'EventTimestamp') || '';
    const eventAction = (extractValueFromContent(itemContent, 'EventAction') || 'modification') as CustodyEventAction;
    const eventOutcome = (extractValueFromContent(itemContent, 'EventOutcome') || 'success') as 'success' | 'failure' | 'partial';

    const event: CustodyEvent = {
      eventId,
      eventTimestamp,
      eventAction,
      eventOutcome,
      eventLocation: extractValueFromContent(itemContent, 'EventLocation'),
      eventHost: extractValueFromContent(itemContent, 'EventHost'),
      eventUser: extractValueFromContent(itemContent, 'EventUser'),
      eventTool: extractValueFromContent(itemContent, 'EventTool'),
      eventHash: extractValueFromContent(itemContent, 'EventHash'),
      eventHashAlgorithm: extractValueFromContent(itemContent, 'EventHashAlgorithm'),
      eventNotes: extractValueFromContent(itemContent, 'EventNotes'),
      eventDetails: extractValueFromContent(itemContent, 'EventDetails'),
    };

    events.push(event);
  }

  return events;
}

/**
 * Extract value from a content fragment
 */
function extractValueFromContent(content: string, tagName: string): string | undefined {
  const regex = new RegExp(`<wnb:${tagName}>([^<]*)</wnb:${tagName}>`);
  const match = content.match(regex);
  return match ? unescapeXml(match[1]) : undefined;
}

/**
 * Parse string array from XMP bag
 */
function parseStringArray(content: string, tagName: string): string[] {
  const bagMatch = content.match(new RegExp(`<wnb:${tagName}>[\\s\\S]*?<rdf:Bag>([\\s\\S]*?)</rdf:Bag>`));
  if (!bagMatch) return [];

  const items: string[] = [];
  const itemRegex = /<rdf:li>([^<]*)<\/rdf:li>/g;
  let match;

  while ((match = itemRegex.exec(bagMatch[1])) !== null) {
    items.push(unescapeXml(match[1]));
  }

  return items;
}

/**
 * Unescape XML entities
 */
function unescapeXml(str: string): string {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/**
 * Check if sidecar exists for a file
 */
export async function sidecarExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(`${filePath}.xmp`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify sidecar integrity
 */
export async function verifySidecar(sidecarPath: string): Promise<{
  valid: boolean;
  hashMatch: boolean;
  errors: string[];
}> {
  const result = await readSidecar(sidecarPath);
  return {
    valid: result.isValid,
    hashMatch: result.hashMatch,
    errors: result.errors,
  };
}
