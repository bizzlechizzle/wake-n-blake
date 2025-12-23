/**
 * ffprobe Wrapper
 *
 * Uses ffprobe for detailed video and audio stream analysis.
 * Falls back gracefully if ffprobe is not installed.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { VideoMetadata, AudioMetadata } from '../../xmp/schema.js';

const execAsync = promisify(exec);

/**
 * ffprobe stream information
 */
interface FFProbeStream {
  index: number;
  codec_name?: string;
  codec_long_name?: string;
  codec_type: 'video' | 'audio' | 'subtitle' | 'data';
  width?: number;
  height?: number;
  coded_width?: number;
  coded_height?: number;
  display_aspect_ratio?: string;
  pix_fmt?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  time_base?: string;
  duration?: string;
  bit_rate?: string;
  nb_frames?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  bits_per_raw_sample?: string;
  tags?: Record<string, string>;
}

/**
 * ffprobe format information
 */
interface FFProbeFormat {
  filename: string;
  nb_streams: number;
  nb_programs: number;
  format_name: string;
  format_long_name: string;
  start_time?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
  probe_score?: number;
  tags?: Record<string, string>;
}

/**
 * ffprobe output
 */
interface FFProbeOutput {
  streams: FFProbeStream[];
  format: FFProbeFormat;
  chapters?: Array<{
    id: number;
    time_base: string;
    start: number;
    end: number;
    tags?: Record<string, string>;
  }>;
}

/**
 * Check if ffprobe is available
 */
let ffprobeAvailable: boolean | undefined;

export async function isFFProbeAvailable(): Promise<boolean> {
  if (ffprobeAvailable !== undefined) return ffprobeAvailable;

  try {
    await execAsync('ffprobe -version');
    ffprobeAvailable = true;
  } catch {
    ffprobeAvailable = false;
  }

  return ffprobeAvailable;
}

/**
 * Run ffprobe on a file
 */
export async function probe(filePath: string): Promise<FFProbeOutput | undefined> {
  if (!(await isFFProbeAvailable())) {
    return undefined;
  }

  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams -show_chapters "${filePath}"`,
      { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large metadata
    );

    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

/**
 * Extract video metadata using ffprobe
 */
export async function extractVideoMetadata(filePath: string): Promise<VideoMetadata | undefined> {
  const data = await probe(filePath);
  if (!data) return undefined;

  // Find video stream
  const videoStream = data.streams.find(s => s.codec_type === 'video');

  // Find audio stream
  const audioStream = data.streams.find(s => s.codec_type === 'audio');

  // Parse frame rate
  let frameRate: number | undefined;
  let frameRateMode: 'constant' | 'variable' | undefined;

  if (videoStream?.r_frame_rate) {
    const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
    if (den && den !== 0) {
      frameRate = num / den;
    }
  }

  // Determine frame rate mode by comparing r_frame_rate and avg_frame_rate
  if (videoStream?.r_frame_rate && videoStream?.avg_frame_rate) {
    const rFps = parseFrameRate(videoStream.r_frame_rate);
    const avgFps = parseFrameRate(videoStream.avg_frame_rate);
    if (rFps && avgFps) {
      frameRateMode = Math.abs(rFps - avgFps) < 0.5 ? 'constant' : 'variable';
    }
  }

  // Determine HDR
  let hdr: string | undefined;
  if (videoStream) {
    if (videoStream.color_transfer === 'smpte2084' ||
        videoStream.color_transfer === 'arib-std-b67') {
      if (videoStream.color_primaries === 'bt2020') {
        hdr = videoStream.color_transfer === 'arib-std-b67' ? 'HLG' : 'HDR10';
      }
    }
    // Check for Dolby Vision
    const dvProfile = data.streams.find(s =>
      s.codec_name?.toLowerCase().includes('dolby') ||
      s.tags?.['encoder']?.toLowerCase().includes('dolby')
    );
    if (dvProfile) {
      hdr = 'Dolby Vision';
    }
  }

  return {
    container: data.format.format_name,
    codec: videoStream?.codec_name,
    resolution: videoStream?.width && videoStream?.height
      ? `${videoStream.width}x${videoStream.height}`
      : undefined,
    width: videoStream?.width,
    height: videoStream?.height,
    frameRate: frameRate ? Math.round(frameRate * 1000) / 1000 : undefined,
    frameRateMode,
    bitRate: data.format.bit_rate ? parseInt(data.format.bit_rate, 10) : undefined,
    duration: data.format.duration ? parseFloat(data.format.duration) : undefined,
    frameCount: videoStream?.nb_frames ? parseInt(videoStream.nb_frames, 10) : undefined,
    colorSpace: videoStream?.color_space,
    hdr,
    scanType: undefined, // ffprobe doesn't reliably detect this
    audioCodec: audioStream?.codec_name,
    audioChannels: audioStream?.channels,
    audioSampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined,
    audioBitRate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate, 10) : undefined,
    audioBitDepth: audioStream?.bits_per_raw_sample
      ? parseInt(audioStream.bits_per_raw_sample, 10)
      : undefined,
    timecodeStart: data.format.tags?.['timecode'],
    chapterCount: data.chapters?.length,
  };
}

/**
 * Extract audio metadata using ffprobe
 */
export async function extractAudioMetadata(filePath: string): Promise<AudioMetadata | undefined> {
  const data = await probe(filePath);
  if (!data) return undefined;

  const audioStream = data.streams.find(s => s.codec_type === 'audio');
  const tags = data.format.tags || {};

  return {
    album: tags['album'],
    artist: tags['artist'] || tags['album_artist'],
    title: tags['title'],
    track: tags['track'],
    disc: tags['disc'],
    year: tags['date'] ? parseInt(tags['date'].substring(0, 4), 10) : undefined,
    genre: tags['genre'],
    duration: data.format.duration ? parseFloat(data.format.duration) : undefined,
    format: audioStream?.codec_name,
    comment: tags['comment'],
  };
}

/**
 * Get video stream count
 */
export async function getStreamCounts(filePath: string): Promise<{
  video: number;
  audio: number;
  subtitle: number;
} | undefined> {
  const data = await probe(filePath);
  if (!data) return undefined;

  return {
    video: data.streams.filter(s => s.codec_type === 'video').length,
    audio: data.streams.filter(s => s.codec_type === 'audio').length,
    subtitle: data.streams.filter(s => s.codec_type === 'subtitle').length,
  };
}

/**
 * Get chapter list
 */
export async function getChapters(filePath: string): Promise<Array<{
  title: string;
  start: number;
  end: number;
}> | undefined> {
  const data = await probe(filePath);
  if (!data?.chapters) return undefined;

  return data.chapters.map(ch => ({
    title: ch.tags?.['title'] || `Chapter ${ch.id}`,
    start: ch.start,
    end: ch.end,
  }));
}

/**
 * Parse frame rate string (e.g., "24000/1001" -> 23.976)
 */
function parseFrameRate(rate: string): number | undefined {
  const [num, den] = rate.split('/').map(Number);
  if (!den || den === 0) return num || undefined;
  return num / den;
}
