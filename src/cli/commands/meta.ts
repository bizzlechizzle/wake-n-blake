/**
 * wnb meta command
 * Metadata extraction and display
 */

import { Command } from 'commander';
import * as path from 'node:path';
import { formatError } from '../output.js';
import { detectFileType } from '../../services/file-type/detector.js';
import {
  extractMetadata,
  getAvailableTools,
  cleanup,
  type MetadataResult,
} from '../../services/metadata/index.js';

export const metaCommand = new Command('meta')
  .description('Extract and display file metadata')
  .argument('<files...>', 'Files to extract metadata from')
  .option('-o, --output <format>', 'Output format: text, json', 'text')
  .option('-q, --quick', 'Quick mode - skip slow extractors')
  .option('-a, --all', 'Show all metadata (verbose)')
  .option('-d, --device', 'Include device info (camera/lens serials)')
  .option('-t, --tools', 'Show available extraction tools')
  .action(async (files: string[], options) => {
    try {
      // If tools flag, just show available tools
      if (options.tools) {
        const tools = await getAvailableTools();
        if (options.output === 'json') {
          console.log(JSON.stringify(tools, null, 2));
        } else {
          console.log('Available Extraction Tools');
          console.log('==========================');
          console.log(`ExifTool:  ${tools.exiftool ? 'AVAILABLE (bundled)' : 'NOT AVAILABLE'}`);
          console.log(`MediaInfo: ${tools.mediainfo ? 'AVAILABLE' : 'NOT INSTALLED'}`);
          console.log(`ffprobe:   ${tools.ffprobe ? 'AVAILABLE' : 'NOT INSTALLED'}`);
        }
        return;
      }

      const results: Array<{
        file: string;
        type: { category: string; mimeType: string };
        metadata: MetadataResult;
      }> = [];

      for (const file of files) {
        const absPath = path.resolve(file);

        try {
          // Detect file type
          const typeResult = await detectFileType(absPath);

          // Extract metadata
          const metadata = await extractMetadata(absPath, {
            quick: options.quick,
            includeDeviceInfo: options.device,
          });

          results.push({
            file: absPath,
            type: {
              category: typeResult.category,
              mimeType: typeResult.mimeType,
            },
            metadata,
          });
        } catch (err) {
          results.push({
            file: absPath,
            type: { category: 'unknown', mimeType: 'unknown' },
            metadata: {
              errors: [String(err)],
              sources: [],
            },
          });
        }
      }

      // Cleanup ExifTool
      await cleanup();

      // Output
      if (options.output === 'json') {
        console.log(JSON.stringify(results, null, 2));
      } else {
        for (const result of results) {
          printMetadata(result, options.all);
          console.log();
        }
      }

      // Check for errors
      const hasErrors = results.some(r => r.metadata.errors.length > 0);
      if (hasErrors) process.exit(1);
    } catch (err) {
      await cleanup();
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * Print metadata in text format
 */
function printMetadata(
  result: {
    file: string;
    type: { category: string; mimeType: string };
    metadata: MetadataResult;
  },
  verbose: boolean = false
): void {
  console.log(`File: ${result.file}`);
  console.log(`Type: ${result.type.category} (${result.type.mimeType})`);
  console.log(`Sources: ${result.metadata.sources.join(', ') || 'none'}`);
  console.log();

  const { metadata } = result;

  // Photo metadata
  if (metadata.photo) {
    console.log('Photo Metadata');
    console.log('--------------');
    if (metadata.photo.creationDevice) console.log(`Camera:       ${metadata.photo.creationDevice}`);
    if (metadata.photo.captureDate) console.log(`Capture Date: ${metadata.photo.captureDate}`);
    if (metadata.photo.lensModel) console.log(`Lens:         ${metadata.photo.lensModel}`);

    // Exposure info
    const exposure: string[] = [];
    if (metadata.photo.aperture) exposure.push(metadata.photo.aperture);
    if (metadata.photo.shutterSpeed) exposure.push(metadata.photo.shutterSpeed);
    if (metadata.photo.iso) exposure.push(`ISO ${metadata.photo.iso}`);
    if (exposure.length > 0) {
      console.log(`Exposure:     ${exposure.join(' | ')}`);
    }

    if (metadata.photo.focalLength) console.log(`Focal Length: ${metadata.photo.focalLength}`);

    // GPS
    if (metadata.photo.gpsLatitude !== undefined && metadata.photo.gpsLongitude !== undefined) {
      console.log(`GPS:          ${metadata.photo.gpsLatitude.toFixed(6)}, ${metadata.photo.gpsLongitude.toFixed(6)}`);
      if (metadata.photo.gpsAltitude !== undefined) {
        console.log(`Altitude:     ${metadata.photo.gpsAltitude.toFixed(1)}m`);
      }
    }

    if (verbose) {
      if (metadata.photo.creationSoftware) console.log(`Software:     ${metadata.photo.creationSoftware}`);
      if (metadata.photo.colorSpace) console.log(`Color Space:  ${metadata.photo.colorSpace}`);
      if (metadata.photo.bitDepth) console.log(`Bit Depth:    ${metadata.photo.bitDepth}`);
      if (metadata.photo.iccProfile) console.log(`ICC Profile:  ${metadata.photo.iccProfile}`);
    }

    console.log();
  }

  // Video metadata
  if (metadata.video) {
    console.log('Video Metadata');
    console.log('--------------');
    if (metadata.video.resolution) console.log(`Resolution:   ${metadata.video.resolution}`);
    if (metadata.video.codec) console.log(`Codec:        ${metadata.video.codec}`);
    if (metadata.video.container) console.log(`Container:    ${metadata.video.container}`);
    if (metadata.video.frameRate) {
      console.log(`Frame Rate:   ${metadata.video.frameRate.toFixed(3)} fps${metadata.video.frameRateMode ? ` (${metadata.video.frameRateMode})` : ''}`);
    }
    if (metadata.video.duration) console.log(`Duration:     ${formatDuration(metadata.video.duration)}`);
    if (metadata.video.bitRate) console.log(`Bit Rate:     ${formatBitRate(metadata.video.bitRate)}`);
    if (metadata.video.hdr) console.log(`HDR:          ${metadata.video.hdr}`);
    if (metadata.video.colorSpace) console.log(`Color Space:  ${metadata.video.colorSpace}`);

    // Audio stream
    if (metadata.video.audioCodec) {
      console.log();
      console.log('Audio Stream');
      console.log(`  Codec:       ${metadata.video.audioCodec}`);
      if (metadata.video.audioChannels) console.log(`  Channels:    ${metadata.video.audioChannels}`);
      if (metadata.video.audioSampleRate) console.log(`  Sample Rate: ${metadata.video.audioSampleRate} Hz`);
      if (metadata.video.audioBitDepth) console.log(`  Bit Depth:   ${metadata.video.audioBitDepth}`);
    }

    if (verbose) {
      if (metadata.video.frameCount) console.log(`Frame Count:  ${metadata.video.frameCount}`);
      if (metadata.video.scanType) console.log(`Scan Type:    ${metadata.video.scanType}`);
      if (metadata.video.timecodeStart) console.log(`Timecode:     ${metadata.video.timecodeStart}`);
      if (metadata.video.chapterCount) console.log(`Chapters:     ${metadata.video.chapterCount}`);
    }

    console.log();
  }

  // Audio metadata
  if (metadata.audio) {
    console.log('Audio Metadata');
    console.log('--------------');
    if (metadata.audio.title) console.log(`Title:    ${metadata.audio.title}`);
    if (metadata.audio.artist) console.log(`Artist:   ${metadata.audio.artist}`);
    if (metadata.audio.album) console.log(`Album:    ${metadata.audio.album}`);
    if (metadata.audio.track) console.log(`Track:    ${metadata.audio.track}`);
    if (metadata.audio.year) console.log(`Year:     ${metadata.audio.year}`);
    if (metadata.audio.genre) console.log(`Genre:    ${metadata.audio.genre}`);
    if (metadata.audio.duration) console.log(`Duration: ${formatDuration(metadata.audio.duration)}`);
    if (metadata.audio.format) console.log(`Format:   ${metadata.audio.format}`);

    if (verbose) {
      if (metadata.audio.disc) console.log(`Disc:     ${metadata.audio.disc}`);
      if (metadata.audio.bpm) console.log(`BPM:      ${metadata.audio.bpm}`);
      if (metadata.audio.hasArt) console.log(`Artwork:  Yes`);
      if (metadata.audio.comment) console.log(`Comment:  ${metadata.audio.comment}`);
    }

    console.log();
  }

  // Document metadata
  if (metadata.document) {
    console.log('Document Metadata');
    console.log('-----------------');
    if (metadata.document.title) console.log(`Title:    ${metadata.document.title}`);
    if (metadata.document.author) console.log(`Author:   ${metadata.document.author}`);
    if (metadata.document.subject) console.log(`Subject:  ${metadata.document.subject}`);
    if (metadata.document.pageCount) console.log(`Pages:    ${metadata.document.pageCount}`);
    if (metadata.document.created) console.log(`Created:  ${metadata.document.created}`);
    if (metadata.document.modified) console.log(`Modified: ${metadata.document.modified}`);

    if (metadata.document.pdfVersion) {
      console.log(`PDF:      v${metadata.document.pdfVersion}`);
      if (metadata.document.pdfEncrypted) console.log(`          Encrypted`);
    }

    if (verbose) {
      if (metadata.document.wordCount) console.log(`Words:    ${metadata.document.wordCount}`);
      if (metadata.document.language) console.log(`Language: ${metadata.document.language}`);
      if (metadata.document.pdfProducer) console.log(`Producer: ${metadata.document.pdfProducer}`);
      if (metadata.document.keywords?.length) {
        console.log(`Keywords: ${metadata.document.keywords.join(', ')}`);
      }
    }

    console.log();
  }

  // Device info
  if (metadata.cameraSerial || metadata.lensSerial) {
    console.log('Device Information');
    console.log('------------------');
    if (metadata.cameraSerial) console.log(`Camera Serial: ${metadata.cameraSerial}`);
    if (metadata.lensSerial) console.log(`Lens Serial:   ${metadata.lensSerial}`);
    console.log();
  }

  // Errors
  if (metadata.errors.length > 0) {
    console.log('Extraction Errors');
    console.log('-----------------');
    for (const err of metadata.errors) {
      console.error(formatError(err));
    }
  }
}

/**
 * Format duration in seconds to HH:MM:SS
 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  if (m > 0) {
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  if (ms > 0) {
    return `${s}.${ms.toString().padStart(3, '0')}s`;
  }
  return `${s}s`;
}

/**
 * Format bit rate
 */
function formatBitRate(bps: number): string {
  if (bps >= 1000000) {
    return `${(bps / 1000000).toFixed(1)} Mbps`;
  }
  if (bps >= 1000) {
    return `${(bps / 1000).toFixed(0)} kbps`;
  }
  return `${bps} bps`;
}
