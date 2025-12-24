/**
 * Subtitle Parser Wrapper
 *
 * Pure TypeScript parser for subtitle files (SRT, VTT, ASS/SSA).
 * Extracts text content for search indexing and metadata.
 *
 * No external dependencies required.
 *
 * @module services/metadata/wrappers/subtitle
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Subtitle extraction result
 */
export interface SubtitleResult {
  /** Subtitle format detected */
  format: 'srt' | 'vtt' | 'ass' | 'ssa' | 'sbv' | 'unknown';
  /** Number of subtitle cues/entries */
  cueCount: number;
  /** Total duration in seconds (based on last cue end time) */
  totalDuration: number;
  /** Concatenated text content for search indexing */
  textContent: string;
  /** Word count in text content */
  wordCount: number;
  /** Character count in text content */
  charCount: number;
  /** Whether file contains style/formatting info */
  hasStyles: boolean;
  /** Detected language (if metadata present) */
  language?: string;
}

/**
 * Individual subtitle cue
 */
interface SubtitleCue {
  index?: number;
  startTime: number;  // seconds
  endTime: number;    // seconds
  text: string;
}

/**
 * Check if subtitle extraction is available (always true - pure TS)
 */
export function isSubtitleAvailable(): boolean {
  return true;
}

/**
 * Parse SRT timestamp to seconds
 * Format: HH:MM:SS,mmm or HH:MM:SS.mmm
 */
function parseSrtTimestamp(timestamp: string): number {
  const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;

  const [, hours, minutes, seconds, ms] = match;
  return (
    parseInt(hours, 10) * 3600 +
    parseInt(minutes, 10) * 60 +
    parseInt(seconds, 10) +
    parseInt(ms, 10) / 1000
  );
}

/**
 * Parse VTT timestamp to seconds
 * Format: MM:SS.mmm or HH:MM:SS.mmm
 */
function parseVttTimestamp(timestamp: string): number {
  const parts = timestamp.split(':');
  if (parts.length === 2) {
    // MM:SS.mmm
    const [minutes, rest] = parts;
    const [seconds, ms] = rest.split('.');
    return (
      parseInt(minutes, 10) * 60 +
      parseInt(seconds, 10) +
      (ms ? parseInt(ms, 10) / 1000 : 0)
    );
  } else if (parts.length === 3) {
    // HH:MM:SS.mmm
    const [hours, minutes, rest] = parts;
    const [seconds, ms] = rest.split('.');
    return (
      parseInt(hours, 10) * 3600 +
      parseInt(minutes, 10) * 60 +
      parseInt(seconds, 10) +
      (ms ? parseInt(ms, 10) / 1000 : 0)
    );
  }
  return 0;
}

/**
 * Parse ASS/SSA timestamp to seconds
 * Format: H:MM:SS.cc (centiseconds)
 */
function parseAssTimestamp(timestamp: string): number {
  const match = timestamp.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
  if (!match) return 0;

  const [, hours, minutes, seconds, cs] = match;
  return (
    parseInt(hours, 10) * 3600 +
    parseInt(minutes, 10) * 60 +
    parseInt(seconds, 10) +
    parseInt(cs, 10) / 100
  );
}

/**
 * Strip HTML/formatting tags from text
 */
function stripTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')     // HTML tags
    .replace(/\{[^}]+\}/g, '')   // ASS style overrides
    .replace(/\\N/g, '\n')       // ASS line breaks
    .replace(/\\n/g, '\n')
    .trim();
}

/**
 * Parse SRT format
 */
function parseSrt(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = content.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Find timestamp line (may have optional index before it)
    let timestampLineIdx = 0;
    if (lines[0].match(/^\d+$/)) {
      timestampLineIdx = 1;
    }

    const timestampLine = lines[timestampLineIdx];
    const timestampMatch = timestampLine.match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );

    if (!timestampMatch) continue;

    const startTime = parseSrtTimestamp(timestampMatch[1]);
    const endTime = parseSrtTimestamp(timestampMatch[2]);
    const textLines = lines.slice(timestampLineIdx + 1);
    const text = stripTags(textLines.join('\n'));

    if (text) {
      cues.push({ startTime, endTime, text });
    }
  }

  return cues;
}

/**
 * Parse VTT format
 */
function parseVtt(content: string): { cues: SubtitleCue[]; hasStyles: boolean; language?: string } {
  const cues: SubtitleCue[] = [];
  let hasStyles = false;
  let language: string | undefined;

  // Check for WEBVTT header
  if (!content.trim().startsWith('WEBVTT')) {
    return { cues, hasStyles };
  }

  // Parse header for metadata
  const headerEnd = content.indexOf('\n\n');
  const header = headerEnd > 0 ? content.substring(0, headerEnd) : content.substring(0, 100);

  // Check for language header
  const langMatch = header.match(/Language:\s*(\S+)/i);
  if (langMatch) {
    language = langMatch[1];
  }

  // Check for STYLE blocks
  if (content.includes('::cue')) {
    hasStyles = true;
  }

  // Split into blocks
  const blocks = content.substring(headerEnd > 0 ? headerEnd : 0).trim().split(/\n\s*\n/);

  for (const block of blocks) {
    if (block.trim().startsWith('STYLE') || block.trim().startsWith('NOTE')) {
      continue;
    }

    const lines = block.trim().split('\n');
    if (lines.length < 1) continue;

    // Find timestamp line
    let timestampLineIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timestampLineIdx = i;
        break;
      }
    }

    const timestampLine = lines[timestampLineIdx];
    const timestampMatch = timestampLine.match(
      /(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/
    );

    if (!timestampMatch) continue;

    const startTime = parseVttTimestamp(timestampMatch[1]);
    const endTime = parseVttTimestamp(timestampMatch[2]);
    const textLines = lines.slice(timestampLineIdx + 1);
    const text = stripTags(textLines.join('\n'));

    if (text) {
      cues.push({ startTime, endTime, text });
    }
  }

  return { cues, hasStyles, language };
}

/**
 * Parse ASS/SSA format
 */
function parseAss(content: string): { cues: SubtitleCue[]; hasStyles: boolean } {
  const cues: SubtitleCue[] = [];
  let hasStyles = false;

  // Check for [V4+ Styles] or [V4 Styles] section
  if (content.includes('[V4+ Styles]') || content.includes('[V4 Styles]')) {
    hasStyles = true;
  }

  // Find [Events] section
  const eventsMatch = content.match(/\[Events\][^[]*Format:[^\n]*\n([\s\S]*?)(?=[[]|$)/i);
  if (!eventsMatch) return { cues, hasStyles };

  const eventsSection = eventsMatch[1];
  const lines = eventsSection.split('\n');

  for (const line of lines) {
    // Dialogue lines: Dialogue: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
    if (!line.trim().startsWith('Dialogue:')) continue;

    const parts = line.substring(10).split(',');
    if (parts.length < 10) continue;

    const startTime = parseAssTimestamp(parts[1].trim());
    const endTime = parseAssTimestamp(parts[2].trim());

    // Text is everything after the 9th comma (may contain commas)
    const text = stripTags(parts.slice(9).join(','));

    if (text) {
      cues.push({ startTime, endTime, text });
    }
  }

  return { cues, hasStyles };
}

/**
 * Parse SBV format (YouTube)
 * Format:
 * H:MM:SS.mmm,H:MM:SS.mmm
 * Text line
 */
function parseSbv(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = content.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const timestampMatch = lines[0].match(
      /(\d+:\d{2}:\d{2}\.\d{3}),(\d+:\d{2}:\d{2}\.\d{3})/
    );

    if (!timestampMatch) continue;

    const startTime = parseVttTimestamp(timestampMatch[1]);
    const endTime = parseVttTimestamp(timestampMatch[2]);
    const text = stripTags(lines.slice(1).join('\n'));

    if (text) {
      cues.push({ startTime, endTime, text });
    }
  }

  return cues;
}

/**
 * Detect subtitle format from content
 */
function detectFormat(content: string, ext: string): 'srt' | 'vtt' | 'ass' | 'ssa' | 'sbv' | 'unknown' {
  const trimmed = content.trim();

  // WEBVTT header
  if (trimmed.startsWith('WEBVTT')) {
    return 'vtt';
  }

  // ASS/SSA header
  if (trimmed.startsWith('[Script Info]')) {
    return ext === '.ssa' ? 'ssa' : 'ass';
  }

  // SBV format (YouTube)
  if (/^\d+:\d{2}:\d{2}\.\d{3},\d+:\d{2}:\d{2}\.\d{3}/.test(trimmed)) {
    return 'sbv';
  }

  // SRT format (numbered entries with timestamps)
  if (/^\d+\s*\n\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/m.test(trimmed)) {
    return 'srt';
  }

  // Fallback to extension
  switch (ext.toLowerCase()) {
    case '.srt': return 'srt';
    case '.vtt': return 'vtt';
    case '.ass': return 'ass';
    case '.ssa': return 'ssa';
    case '.sbv': return 'sbv';
    default: return 'unknown';
  }
}

/**
 * Parse subtitle file and extract metadata
 *
 * @param filePath - Path to subtitle file
 * @returns Extraction result or undefined if parsing failed
 */
export async function extract(filePath: string): Promise<SubtitleResult | undefined> {
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    const format = detectFormat(content, ext);

    let cues: SubtitleCue[] = [];
    let hasStyles = false;
    let language: string | undefined;

    switch (format) {
      case 'srt':
        cues = parseSrt(content);
        break;
      case 'vtt': {
        const vttResult = parseVtt(content);
        cues = vttResult.cues;
        hasStyles = vttResult.hasStyles;
        language = vttResult.language;
        break;
      }
      case 'ass':
      case 'ssa': {
        const assResult = parseAss(content);
        cues = assResult.cues;
        hasStyles = assResult.hasStyles;
        break;
      }
      case 'sbv':
        cues = parseSbv(content);
        break;
      default:
        return undefined;
    }

    // Calculate stats
    const textContent = cues.map(c => c.text).join('\n');
    const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
    const charCount = textContent.length;
    const totalDuration = cues.length > 0
      ? Math.max(...cues.map(c => c.endTime))
      : 0;

    return {
      format,
      cueCount: cues.length,
      totalDuration,
      textContent,
      wordCount,
      charCount,
      hasStyles,
      language,
    };
  } catch {
    return undefined;
  }
}

/**
 * Convert result to XMP rawMetadata format with Subtitle_ prefix
 */
export function toRawMetadata(result: SubtitleResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'Subtitle_Format': result.format.toUpperCase(),
    'Subtitle_CueCount': result.cueCount,
    'Subtitle_Duration': result.totalDuration,
    'Subtitle_WordCount': result.wordCount,
    'Subtitle_CharCount': result.charCount,
    'Subtitle_HasStyles': result.hasStyles,
  };

  if (result.language) {
    metadata['Subtitle_Language'] = result.language;
  }

  // Store text content (truncated if too long)
  if (result.textContent) {
    const maxLength = 100000; // ~100KB limit for XMP
    if (result.textContent.length > maxLength) {
      metadata['Subtitle_TextContent'] = result.textContent.substring(0, maxLength);
      metadata['Subtitle_Truncated'] = true;
    } else {
      metadata['Subtitle_TextContent'] = result.textContent;
      metadata['Subtitle_Truncated'] = false;
    }
  }

  return metadata;
}

/**
 * Format duration in HH:MM:SS format
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
