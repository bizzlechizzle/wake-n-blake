/**
 * XMP Sidecar Writer
 *
 * Generates XMP sidecar files from sidecar data.
 */

import * as fs from 'node:fs/promises';
import { createHash as createBlake3Hash } from 'blake3';
import { XMP_NAMESPACES, SCHEMA_VERSION, type XmpSidecarData } from './schema.js';

/**
 * Generate XMP sidecar content
 */
export function generateXmpContent(data: XmpSidecarData): string {
  const lines: string[] = [];

  // XML declaration
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // XMP meta wrapper
  lines.push(`<x:xmpmeta xmlns:x="${XMP_NAMESPACES.x}">`);

  // RDF root with namespaces
  lines.push('  <rdf:RDF');
  lines.push(`    xmlns:rdf="${XMP_NAMESPACES.rdf}"`);
  lines.push(`    xmlns:dc="${XMP_NAMESPACES.dc}"`);
  lines.push(`    xmlns:xmp="${XMP_NAMESPACES.xmp}"`);
  lines.push(`    xmlns:wnb="${XMP_NAMESPACES.wnb}">`);

  // Main description
  lines.push('    <rdf:Description rdf:about="">');

  // Sidecar self-integrity
  lines.push('');
  lines.push('      <!-- Sidecar Self-Integrity -->');
  lines.push(`      <wnb:SchemaVersion>${SCHEMA_VERSION}</wnb:SchemaVersion>`);
  lines.push(`      <wnb:SidecarCreated>${escapeXml(data.sidecarCreated)}</wnb:SidecarCreated>`);
  lines.push(`      <wnb:SidecarUpdated>${escapeXml(data.sidecarUpdated)}</wnb:SidecarUpdated>`);

  // Core identity
  lines.push('');
  lines.push('      <!-- Core Identity -->');
  lines.push(`      <wnb:ContentHash>${escapeXml(data.contentHash)}</wnb:ContentHash>`);
  lines.push(`      <wnb:HashAlgorithm>${data.hashAlgorithm}</wnb:HashAlgorithm>`);
  lines.push(`      <wnb:FileSize>${data.fileSize}</wnb:FileSize>`);
  lines.push(`      <wnb:Verified>${data.verified}</wnb:Verified>`);

  // File classification
  lines.push('');
  lines.push('      <!-- File Classification -->');
  lines.push(`      <wnb:FileCategory>${escapeXml(data.fileCategory)}</wnb:FileCategory>`);
  if (data.fileSubcategory) {
    lines.push(`      <wnb:FileSubcategory>${escapeXml(data.fileSubcategory)}</wnb:FileSubcategory>`);
  }
  lines.push(`      <wnb:DetectedMimeType>${escapeXml(data.detectedMimeType)}</wnb:DetectedMimeType>`);
  lines.push(`      <wnb:DeclaredExtension>${escapeXml(data.declaredExtension)}</wnb:DeclaredExtension>`);
  if (data.extensionMismatch !== undefined) {
    lines.push(`      <wnb:ExtensionMismatch>${data.extensionMismatch}</wnb:ExtensionMismatch>`);
  }

  // Source provenance
  lines.push('');
  lines.push('      <!-- Source Provenance -->');
  lines.push(`      <wnb:SourcePath>${escapeXml(data.sourcePath)}</wnb:SourcePath>`);
  lines.push(`      <wnb:SourceFilename>${escapeXml(data.sourceFilename)}</wnb:SourceFilename>`);
  lines.push(`      <wnb:SourceHost>${escapeXml(data.sourceHost)}</wnb:SourceHost>`);
  if (data.sourceVolume) {
    lines.push(`      <wnb:SourceVolume>${escapeXml(data.sourceVolume)}</wnb:SourceVolume>`);
  }
  if (data.sourceVolumeSerial) {
    lines.push(`      <wnb:SourceVolumeSerial>${escapeXml(data.sourceVolumeSerial)}</wnb:SourceVolumeSerial>`);
  }
  lines.push(`      <wnb:SourceType>${escapeXml(data.sourceType)}</wnb:SourceType>`);

  // Import source device
  if (data.sourceDevice) {
    lines.push('');
    lines.push('      <!-- Import Source Device -->');
    const dev = data.sourceDevice;
    if (dev.usb?.vendorId) lines.push(`      <wnb:USBVendorID>${escapeXml(dev.usb.vendorId)}</wnb:USBVendorID>`);
    if (dev.usb?.productId) lines.push(`      <wnb:USBProductID>${escapeXml(dev.usb.productId)}</wnb:USBProductID>`);
    if (dev.usb?.serial) lines.push(`      <wnb:USBSerial>${escapeXml(dev.usb.serial)}</wnb:USBSerial>`);
    if (dev.usb?.devicePath) lines.push(`      <wnb:USBDevicePath>${escapeXml(dev.usb.devicePath)}</wnb:USBDevicePath>`);
    if (dev.usb?.deviceName) lines.push(`      <wnb:USBDeviceName>${escapeXml(dev.usb.deviceName)}</wnb:USBDeviceName>`);
    if (dev.cardReader?.vendor) lines.push(`      <wnb:CardReaderVendor>${escapeXml(dev.cardReader.vendor)}</wnb:CardReaderVendor>`);
    if (dev.cardReader?.model) lines.push(`      <wnb:CardReaderModel>${escapeXml(dev.cardReader.model)}</wnb:CardReaderModel>`);
    if (dev.cardReader?.serial) lines.push(`      <wnb:CardReaderSerial>${escapeXml(dev.cardReader.serial)}</wnb:CardReaderSerial>`);
    if (dev.media?.type) lines.push(`      <wnb:MediaType>${escapeXml(dev.media.type)}</wnb:MediaType>`);
    if (dev.media?.serial) lines.push(`      <wnb:MediaSerial>${escapeXml(dev.media.serial)}</wnb:MediaSerial>`);
    if (dev.media?.manufacturer) lines.push(`      <wnb:MediaManufacturer>${escapeXml(dev.media.manufacturer)}</wnb:MediaManufacturer>`);
    if (dev.media?.capacity) lines.push(`      <wnb:MediaCapacity>${dev.media.capacity}</wnb:MediaCapacity>`);
    if (dev.cameraBodySerial) lines.push(`      <wnb:CameraBodySerial>${escapeXml(dev.cameraBodySerial)}</wnb:CameraBodySerial>`);
  }

  // Timestamps
  lines.push('');
  lines.push('      <!-- Timestamps -->');
  lines.push(`      <wnb:OriginalMtime>${escapeXml(data.originalMtime)}</wnb:OriginalMtime>`);
  if (data.originalCtime) lines.push(`      <wnb:OriginalCtime>${escapeXml(data.originalCtime)}</wnb:OriginalCtime>`);
  if (data.originalBtime) lines.push(`      <wnb:OriginalBtime>${escapeXml(data.originalBtime)}</wnb:OriginalBtime>`);
  if (data.sourceTimezone) lines.push(`      <wnb:SourceTimezone>${escapeXml(data.sourceTimezone)}</wnb:SourceTimezone>`);
  if (data.importTimezone) lines.push(`      <wnb:ImportTimezone>${escapeXml(data.importTimezone)}</wnb:ImportTimezone>`);

  // Import context
  lines.push('');
  lines.push('      <!-- Import Context -->');
  lines.push(`      <wnb:ImportTimestamp>${escapeXml(data.importTimestamp)}</wnb:ImportTimestamp>`);
  lines.push(`      <wnb:SessionID>${escapeXml(data.sessionId)}</wnb:SessionID>`);
  lines.push(`      <wnb:ToolVersion>${escapeXml(data.toolVersion)}</wnb:ToolVersion>`);
  lines.push(`      <wnb:ImportUser>${escapeXml(data.importUser)}</wnb:ImportUser>`);
  lines.push(`      <wnb:ImportHost>${escapeXml(data.importHost)}</wnb:ImportHost>`);
  lines.push(`      <wnb:ImportPlatform>${data.importPlatform}</wnb:ImportPlatform>`);
  if (data.importOSVersion) lines.push(`      <wnb:ImportOSVersion>${escapeXml(data.importOSVersion)}</wnb:ImportOSVersion>`);
  if (data.importMethod) lines.push(`      <wnb:ImportMethod>${data.importMethod}</wnb:ImportMethod>`);

  // Batch context
  if (data.batchId || data.batchName) {
    lines.push('');
    lines.push('      <!-- Batch Context -->');
    if (data.batchId) lines.push(`      <wnb:BatchID>${escapeXml(data.batchId)}</wnb:BatchID>`);
    if (data.batchName) lines.push(`      <wnb:BatchName>${escapeXml(data.batchName)}</wnb:BatchName>`);
    if (data.batchFileCount) lines.push(`      <wnb:BatchFileCount>${data.batchFileCount}</wnb:BatchFileCount>`);
    if (data.batchSequence) lines.push(`      <wnb:BatchSequence>${data.batchSequence}</wnb:BatchSequence>`);
  }

  // Deduplication
  if (data.dedupStatus) {
    lines.push('');
    lines.push('      <!-- Deduplication -->');
    lines.push(`      <wnb:DedupStatus>${data.dedupStatus}</wnb:DedupStatus>`);
    if (data.duplicateOf) lines.push(`      <wnb:DuplicateOf>${escapeXml(data.duplicateOf)}</wnb:DuplicateOf>`);
  }

  // File renaming
  if (data.wasRenamed) {
    lines.push('');
    lines.push('      <!-- File Renaming -->');
    lines.push(`      <wnb:WasRenamed>${data.wasRenamed}</wnb:WasRenamed>`);
    if (data.destFilename) lines.push(`      <wnb:DestFilename>${escapeXml(data.destFilename)}</wnb:DestFilename>`);
    if (data.renameReason) lines.push(`      <wnb:RenameReason>${data.renameReason}</wnb:RenameReason>`);
  }

  // Related files
  if (data.relatedFiles?.length || data.isLivePhoto) {
    lines.push('');
    lines.push('      <!-- Related Files -->');
    if (data.isLivePhoto !== undefined) lines.push(`      <wnb:IsLivePhoto>${data.isLivePhoto}</wnb:IsLivePhoto>`);
    if (data.livePhotoRole) lines.push(`      <wnb:LivePhotoRole>${data.livePhotoRole}</wnb:LivePhotoRole>`);
    if (data.livePhotoPairHash) lines.push(`      <wnb:LivePhotoPairHash>${escapeXml(data.livePhotoPairHash)}</wnb:LivePhotoPairHash>`);
    if (data.relationType) lines.push(`      <wnb:RelationType>${data.relationType}</wnb:RelationType>`);
    if (data.isPrimaryFile !== undefined) lines.push(`      <wnb:IsPrimaryFile>${data.isPrimaryFile}</wnb:IsPrimaryFile>`);
  }

  // Photo metadata
  if (data.photo) {
    lines.push('');
    lines.push('      <!-- Photo Metadata -->');
    const p = data.photo;
    if (p.creationDevice) lines.push(`      <wnb:CreationDevice>${escapeXml(p.creationDevice)}</wnb:CreationDevice>`);
    if (p.creationSoftware) lines.push(`      <wnb:CreationSoftware>${escapeXml(p.creationSoftware)}</wnb:CreationSoftware>`);
    if (p.captureDate) lines.push(`      <wnb:CaptureDate>${escapeXml(p.captureDate)}</wnb:CaptureDate>`);
    if (p.gpsLatitude !== undefined) lines.push(`      <wnb:GPSLatitude>${p.gpsLatitude}</wnb:GPSLatitude>`);
    if (p.gpsLongitude !== undefined) lines.push(`      <wnb:GPSLongitude>${p.gpsLongitude}</wnb:GPSLongitude>`);
    if (p.gpsAltitude !== undefined) lines.push(`      <wnb:GPSAltitude>${p.gpsAltitude}</wnb:GPSAltitude>`);
    if (p.lensModel) lines.push(`      <wnb:LensModel>${escapeXml(p.lensModel)}</wnb:LensModel>`);
    if (p.focalLength) lines.push(`      <wnb:FocalLength>${escapeXml(p.focalLength)}</wnb:FocalLength>`);
    if (p.aperture) lines.push(`      <wnb:Aperture>${escapeXml(p.aperture)}</wnb:Aperture>`);
    if (p.shutterSpeed) lines.push(`      <wnb:ShutterSpeed>${escapeXml(p.shutterSpeed)}</wnb:ShutterSpeed>`);
    if (p.iso !== undefined) lines.push(`      <wnb:ISO>${p.iso}</wnb:ISO>`);
  }

  // Video metadata
  if (data.video) {
    lines.push('');
    lines.push('      <!-- Video Metadata -->');
    const v = data.video;
    if (v.container) lines.push(`      <wnb:VideoContainer>${escapeXml(v.container)}</wnb:VideoContainer>`);
    if (v.codec) lines.push(`      <wnb:VideoCodec>${escapeXml(v.codec)}</wnb:VideoCodec>`);
    if (v.resolution) lines.push(`      <wnb:VideoResolution>${escapeXml(v.resolution)}</wnb:VideoResolution>`);
    if (v.frameRate !== undefined) lines.push(`      <wnb:VideoFrameRate>${v.frameRate}</wnb:VideoFrameRate>`);
    if (v.duration !== undefined) lines.push(`      <wnb:VideoDuration>${v.duration}</wnb:VideoDuration>`);
    if (v.bitRate !== undefined) lines.push(`      <wnb:VideoBitRate>${v.bitRate}</wnb:VideoBitRate>`);
    if (v.audioCodec) lines.push(`      <wnb:AudioCodec>${escapeXml(v.audioCodec)}</wnb:AudioCodec>`);
    if (v.audioChannels !== undefined) lines.push(`      <wnb:AudioChannels>${v.audioChannels}</wnb:AudioChannels>`);
  }

  // Audio metadata
  if (data.audio) {
    lines.push('');
    lines.push('      <!-- Audio Metadata -->');
    const a = data.audio;
    if (a.title) lines.push(`      <wnb:AudioTitle>${escapeXml(a.title)}</wnb:AudioTitle>`);
    if (a.artist) lines.push(`      <wnb:AudioArtist>${escapeXml(a.artist)}</wnb:AudioArtist>`);
    if (a.album) lines.push(`      <wnb:AudioAlbum>${escapeXml(a.album)}</wnb:AudioAlbum>`);
    if (a.track) lines.push(`      <wnb:AudioTrack>${escapeXml(a.track)}</wnb:AudioTrack>`);
    if (a.year !== undefined) lines.push(`      <wnb:AudioYear>${a.year}</wnb:AudioYear>`);
    if (a.genre) lines.push(`      <wnb:AudioGenre>${escapeXml(a.genre)}</wnb:AudioGenre>`);
    if (a.duration !== undefined) lines.push(`      <wnb:AudioDuration>${a.duration}</wnb:AudioDuration>`);
  }

  // Document metadata
  if (data.document) {
    lines.push('');
    lines.push('      <!-- Document Metadata -->');
    const d = data.document;
    if (d.title) lines.push(`      <wnb:DocumentTitle>${escapeXml(d.title)}</wnb:DocumentTitle>`);
    if (d.author) lines.push(`      <wnb:DocumentAuthor>${escapeXml(d.author)}</wnb:DocumentAuthor>`);
    if (d.pageCount !== undefined) lines.push(`      <wnb:DocumentPageCount>${d.pageCount}</wnb:DocumentPageCount>`);
    if (d.pdfVersion) lines.push(`      <wnb:PDFVersion>${escapeXml(d.pdfVersion)}</wnb:PDFVersion>`);
  }

  // Chain of custody
  lines.push('');
  lines.push('      <!-- Chain of Custody -->');
  lines.push(`      <wnb:FirstSeen>${escapeXml(data.firstSeen)}</wnb:FirstSeen>`);
  lines.push(`      <wnb:EventCount>${data.eventCount}</wnb:EventCount>`);
  lines.push('      <wnb:CustodyChain>');
  lines.push('        <rdf:Seq>');

  for (const event of data.custodyChain) {
    lines.push('          <rdf:li rdf:parseType="Resource">');
    lines.push(`            <wnb:EventID>${escapeXml(event.eventId)}</wnb:EventID>`);
    lines.push(`            <wnb:EventTimestamp>${escapeXml(event.eventTimestamp)}</wnb:EventTimestamp>`);
    lines.push(`            <wnb:EventAction>${event.eventAction}</wnb:EventAction>`);
    lines.push(`            <wnb:EventOutcome>${event.eventOutcome}</wnb:EventOutcome>`);
    if (event.eventLocation) lines.push(`            <wnb:EventLocation>${escapeXml(event.eventLocation)}</wnb:EventLocation>`);
    if (event.eventHost) lines.push(`            <wnb:EventHost>${escapeXml(event.eventHost)}</wnb:EventHost>`);
    if (event.eventUser) lines.push(`            <wnb:EventUser>${escapeXml(event.eventUser)}</wnb:EventUser>`);
    if (event.eventTool) lines.push(`            <wnb:EventTool>${escapeXml(event.eventTool)}</wnb:EventTool>`);
    if (event.eventHash) lines.push(`            <wnb:EventHash>${escapeXml(event.eventHash)}</wnb:EventHash>`);
    if (event.eventHashAlgorithm) lines.push(`            <wnb:EventHashAlgorithm>${event.eventHashAlgorithm}</wnb:EventHashAlgorithm>`);
    if (event.eventNotes) lines.push(`            <wnb:EventNotes>${escapeXml(event.eventNotes)}</wnb:EventNotes>`);
    lines.push('          </rdf:li>');
  }

  lines.push('        </rdf:Seq>');
  lines.push('      </wnb:CustodyChain>');

  // Close description and RDF
  lines.push('');
  lines.push('    </rdf:Description>');
  lines.push('  </rdf:RDF>');
  lines.push('</x:xmpmeta>');

  return lines.join('\n');
}

/**
 * Calculate sidecar hash (hash of content excluding the hash field itself)
 */
export function calculateSidecarHash(content: string): string {
  // Remove existing SidecarHash line for calculation
  const withoutHash = content.replace(/<wnb:SidecarHash>.*<\/wnb:SidecarHash>\n?/g, '');
  const hasher = createBlake3Hash();
  hasher.update(withoutHash);
  return hasher.digest('hex');
}

/**
 * Generate and write XMP sidecar file
 */
export async function writeSidecar(
  filePath: string,
  data: XmpSidecarData
): Promise<string> {
  // Generate content
  let content = generateXmpContent(data);

  // Calculate and insert sidecar hash
  const hash = calculateSidecarHash(content);
  content = content.replace(
    '</wnb:SidecarCreated>',
    `</wnb:SidecarCreated>\n      <wnb:SidecarHash>${hash}</wnb:SidecarHash>`
  );

  // Write file
  const sidecarPath = `${filePath}.xmp`;
  await fs.writeFile(sidecarPath, content, 'utf-8');

  return sidecarPath;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
