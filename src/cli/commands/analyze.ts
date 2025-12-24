/**
 * wnb analyze command
 * Unified single-file analysis with all available extractors
 */

import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { detectFileType, type FileTypeResult } from '../../services/file-type/detector.js';
import {
  extractMetadata,
  getAvailableTools,
  exiftool,
  pdfText,
  officeText,
  ebook,
  subtitle,
  perceptualHash,
  archive,
  email,
  font,
  geospatial,
  model3d,
  calendar,
  guessit,
  audioQuality,
  chromaprint,
  cleanup as cleanupMetadata,
} from '../../services/metadata/index.js';
import { formatSize, formatError } from '../output.js';

interface AnalysisResult {
  file: string;
  category: string;
  mimeType: string;
  size: number;
  extractors: string[];
  metadata: Record<string, unknown>;
  errors: string[];
}

export const analyzeCommand = new Command('analyze')
  .description('Analyze a file and extract all available metadata')
  .argument('<file>', 'File to analyze')
  .option('--tools', 'Show which tools were used')
  .option('--available', 'Show all available extraction tools')
  .option('--raw', 'Include raw exiftool output')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .action(async (file: string, options) => {
    try {
      // Handle --available flag
      if (options.available) {
        const tools = await getAvailableTools();
        if (options.format === 'json') {
          console.log(JSON.stringify(tools, null, 2));
        } else {
          console.log('\nAvailable Extraction Tools:');
          console.log('===========================\n');

          console.log('Core Tools:');
          console.log(`  exiftool ........ ${tools.exiftool ? '\u2713' : '\u2717'}`);
          console.log(`  mediainfo ....... ${tools.mediainfo ? '\u2713' : '\u2717'}`);
          console.log(`  ffprobe ......... ${tools.ffprobe ? '\u2713' : '\u2717'}`);
          console.log(`  guessit ......... ${tools.guessit ? '\u2713' : '\u2717'}`);
          console.log(`  chromaprint ..... ${tools.chromaprint ? '\u2713' : '\u2717'}`);

          console.log('\nTier 1 (Text/Media):');
          console.log(`  pdftotext ....... ${tools.pdftotext ? '\u2713' : '\u2717'}`);
          console.log(`  pymupdf ......... ${tools.pymupdf ? '\u2713' : '\u2717'}`);
          console.log(`  office-tools .... ${tools.officeTools ? '\u2713' : '\u2717'}`);
          console.log(`  calibre ......... ${tools.calibre ? '\u2713' : '\u2717'}`);
          console.log(`  imagehash ....... ${tools.imagehash ? '\u2713' : '\u2717'}`);

          console.log('\nTier 2 (Archives/Email/Fonts):');
          console.log(`  7-zip ........... ${tools.sevenzip ? '\u2713' : '\u2717'}`);
          console.log(`  email-tools ..... ${tools.emailTools ? '\u2713' : '\u2717'}`);
          console.log(`  fonttools ....... ${tools.fonttools ? '\u2713' : '\u2717'}`);

          console.log('\nTier 3 (Specialized):');
          console.log(`  gdal ............ ${tools.gdal ? '\u2713' : '\u2717'}`);
          console.log(`  gltf-transform .. ${tools.gltfTransform ? '\u2713' : '\u2717'}`);
          console.log(`  trimesh ......... ${tools.trimesh ? '\u2713' : '\u2717'}`);
          console.log(`  vobject ......... ${tools.vobject ? '\u2713' : '\u2717'}`);
        }
        return;
      }

      // Resolve file path
      const filePath = path.resolve(file);

      // Check file exists
      try {
        await fs.access(filePath);
      } catch {
        console.error(formatError(`File not found: ${file}`));
        process.exit(1);
      }

      // Get file stats
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        console.error(formatError('Cannot analyze directories'));
        process.exit(1);
      }

      // Detect file type
      let typeResult: FileTypeResult;
      try {
        typeResult = await detectFileType(filePath);
      } catch (err) {
        console.error(formatError(`File type detection failed: ${err}`));
        process.exit(1);
      }

      const result: AnalysisResult = {
        file: filePath,
        category: typeResult.category,
        mimeType: typeResult.mimeType,
        size: stats.size,
        extractors: [],
        metadata: {},
        errors: [],
      };

      const ext = path.extname(filePath).toLowerCase();
      const category = typeResult.category;

      // Run applicable extractors based on file type
      try {
        // Core metadata extraction (ExifTool-based)
        const coreMeta = await extractMetadata(filePath);
        if (coreMeta.sources.length > 0) {
          result.extractors.push(...coreMeta.sources);
          if (coreMeta.photo) result.metadata.photo = coreMeta.photo;
          if (coreMeta.video) result.metadata.video = coreMeta.video;
          if (coreMeta.audio) result.metadata.audio = coreMeta.audio;
          if (coreMeta.document) result.metadata.document = coreMeta.document;
          if (coreMeta.cameraSerial) result.metadata.cameraSerial = coreMeta.cameraSerial;
          if (coreMeta.lensSerial) result.metadata.lensSerial = coreMeta.lensSerial;
        }
        result.errors.push(...coreMeta.errors);

        // Raw exiftool metadata
        if (options.raw && ['image', 'photo', 'video', 'audio'].includes(category)) {
          try {
            const rawMeta = await exiftool.extractAllMetadata(filePath);
            result.metadata.raw = rawMeta;
          } catch (err) {
            result.errors.push(`Raw exiftool: ${err}`);
          }
        }

        // PDF text extraction
        if (category === 'document' && ext === '.pdf') {
          try {
            const pdfResult = await pdfText.extract(filePath);
            if (pdfResult) {
              result.extractors.push('pdfText');
              result.metadata.pdfText = pdfText.toRawMetadata(pdfResult);
            }
          } catch (err) {
            result.errors.push(`PDF text: ${err}`);
          }
        }

        // Office document extraction
        if (category === 'document' && ['.docx', '.pptx', '.xlsx'].includes(ext)) {
          try {
            const officeResult = await officeText.extract(filePath);
            if (officeResult) {
              result.extractors.push('officeText');
              result.metadata.officeText = officeText.toRawMetadata(officeResult);
            }
          } catch (err) {
            result.errors.push(`Office text: ${err}`);
          }
        }

        // Ebook extraction
        if (category === 'ebook') {
          try {
            const ebookResult = await ebook.extract(filePath);
            if (ebookResult) {
              result.extractors.push('ebook');
              result.metadata.ebook = ebook.toRawMetadata(ebookResult);
            }
          } catch (err) {
            result.errors.push(`Ebook: ${err}`);
          }
        }

        // Subtitle parsing
        if (category === 'subtitle') {
          try {
            const subtitleResult = await subtitle.extract(filePath);
            if (subtitleResult) {
              result.extractors.push('subtitle');
              result.metadata.subtitle = subtitle.toRawMetadata(subtitleResult);
            }
          } catch (err) {
            result.errors.push(`Subtitle: ${err}`);
          }
        }

        // Perceptual hashing for images
        if (category === 'image') {
          try {
            const phashResult = await perceptualHash.compute(filePath);
            if (phashResult) {
              result.extractors.push('perceptualHash');
              result.metadata.perceptualHash = perceptualHash.toRawMetadata(phashResult);
            }
          } catch (err) {
            result.errors.push(`Perceptual hash: ${err}`);
          }
        }

        // Archive analysis
        if (category === 'archive') {
          try {
            const archiveResult = await archive.analyze(filePath);
            if (archiveResult) {
              result.extractors.push('archive');
              result.metadata.archive = archive.toRawMetadata(archiveResult);
            }
          } catch (err) {
            result.errors.push(`Archive: ${err}`);
          }
        }

        // Email extraction
        if (category === 'email') {
          try {
            const emailResult = await email.extract(filePath);
            if (emailResult) {
              result.extractors.push('email');
              result.metadata.email = email.toRawMetadata(emailResult);
            }
          } catch (err) {
            result.errors.push(`Email: ${err}`);
          }
        }

        // Font extraction
        if (category === 'font') {
          try {
            const fontResult = await font.extract(filePath);
            if (fontResult) {
              result.extractors.push('font');
              result.metadata.font = font.toRawMetadata(fontResult);
            }
          } catch (err) {
            result.errors.push(`Font: ${err}`);
          }
        }

        // Geospatial extraction
        if (category === 'geospatial') {
          try {
            const geoResult = await geospatial.extract(filePath);
            if (geoResult) {
              result.extractors.push('geospatial');
              result.metadata.geospatial = geospatial.toRawMetadata(geoResult);
            }
          } catch (err) {
            result.errors.push(`Geospatial: ${err}`);
          }
        }

        // 3D model analysis
        if (category === 'model3d') {
          try {
            const model3dResult = await model3d.analyze(filePath);
            if (model3dResult) {
              result.extractors.push('model3d');
              result.metadata.model3d = model3d.toRawMetadata(model3dResult);
            }
          } catch (err) {
            result.errors.push(`3D model: ${err}`);
          }
        }

        // Calendar/Contact extraction
        if (category === 'calendar' || category === 'contact') {
          try {
            const calResult = await calendar.extract(filePath);
            if (calResult) {
              result.extractors.push('calendar');
              result.metadata.calendar = calendar.toRawMetadata(calResult);
            }
          } catch (err) {
            result.errors.push(`Calendar/Contact: ${err}`);
          }
        }

        // Video-specific: guessit parsing
        if (category === 'video') {
          try {
            const guessitResult = await guessit.guess(filePath);
            if (guessitResult) {
              result.extractors.push('guessit');
              result.metadata.guessit = guessit.toRawMetadata(guessitResult);
            }
          } catch (err) {
            result.errors.push(`Guessit: ${err}`);
          }
        }

        // Audio-specific: quality analysis and fingerprinting
        if (category === 'audio') {
          try {
            const qualityResult = await audioQuality.analyzeAudioQuality(filePath);
            if (qualityResult) {
              result.extractors.push('audioQuality');
              result.metadata.audioQuality = audioQuality.toRawMetadata(qualityResult);
            }
          } catch (err) {
            result.errors.push(`Audio quality: ${err}`);
          }

          try {
            const fingerprintResult = await chromaprint.fingerprint(filePath);
            if (fingerprintResult) {
              result.extractors.push('chromaprint');
              result.metadata.chromaprint = chromaprint.toRawMetadata(fingerprintResult);
            }
          } catch (err) {
            result.errors.push(`Chromaprint: ${err}`);
          }
        }

      } finally {
        await cleanupMetadata();
      }

      // Output results
      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\nFile: ${path.basename(filePath)}`);
        console.log(`Path: ${filePath}`);
        console.log(`Size: ${formatSize(result.size)}`);
        console.log(`Category: ${result.category}`);
        console.log(`MIME Type: ${result.mimeType}`);

        if (options.tools) {
          console.log(`\nExtractors Used: ${result.extractors.length > 0 ? result.extractors.join(', ') : 'none'}`);
        }

        if (Object.keys(result.metadata).length > 0) {
          console.log('\nMetadata:');
          console.log('---------');

          for (const [section, data] of Object.entries(result.metadata)) {
            if (section === 'raw' && !options.raw) continue;

            console.log(`\n[${section}]`);
            if (typeof data === 'object' && data !== null) {
              for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
                const displayValue = typeof value === 'string' && value.length > 100
                  ? value.substring(0, 100) + '...'
                  : value;
                console.log(`  ${key}: ${displayValue}`);
              }
            }
          }
        }

        if (result.errors.length > 0) {
          console.log('\nErrors:');
          for (const err of result.errors) {
            console.log(`  - ${err}`);
          }
        }
      }

    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });
