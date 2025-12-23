/**
 * MediaInfo Wrapper
 *
 * Uses MediaInfo CLI for detailed video analysis.
 * Provides more accurate codec detection than ffprobe for some formats.
 * Falls back gracefully if MediaInfo is not installed.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { VideoMetadata, AudioMetadata } from '../../xmp/schema.js';

const execAsync = promisify(exec);

/**
 * MediaInfo track information
 */
interface MediaInfoTrack {
  '@type': 'General' | 'Video' | 'Audio' | 'Text' | 'Menu' | 'Image';
  Format?: string;
  Format_Profile?: string;
  Format_Level?: string;
  Format_Commercial_IfAny?: string;
  CodecID?: string;
  Duration?: string;
  BitRate?: string;
  BitRate_Mode?: string;
  Width?: string;
  Height?: string;
  FrameRate?: string;
  FrameRate_Mode?: string;
  FrameCount?: string;
  ColorSpace?: string;
  ChromaSubsampling?: string;
  BitDepth?: string;
  ScanType?: string;
  HDR_Format?: string;
  HDR_Format_Compatibility?: string;
  transfer_characteristics?: string;
  colour_primaries?: string;
  matrix_coefficients?: string;
  Channels?: string;
  ChannelLayout?: string;
  SamplingRate?: string;
  Title?: string;
  Album?: string;
  Performer?: string;
  Track?: string;
  Genre?: string;
  Recorded_Date?: string;
  TimeCode_FirstFrame?: string;
  FileSize?: string;
  OverallBitRate?: string;
  [key: string]: string | undefined;
}

/**
 * MediaInfo output structure
 */
interface MediaInfoOutput {
  media: {
    track: MediaInfoTrack[];
  };
}

/**
 * Check if MediaInfo is available
 */
let mediainfoAvailable: boolean | undefined;

export async function isMediaInfoAvailable(): Promise<boolean> {
  if (mediainfoAvailable !== undefined) return mediainfoAvailable;

  try {
    await execAsync('mediainfo --version');
    mediainfoAvailable = true;
  } catch {
    mediainfoAvailable = false;
  }

  return mediainfoAvailable;
}

/**
 * Run MediaInfo on a file
 */
export async function analyze(filePath: string): Promise<MediaInfoOutput | undefined> {
  if (!(await isMediaInfoAvailable())) {
    return undefined;
  }

  try {
    const { stdout } = await execAsync(
      `mediainfo --Output=JSON "${filePath}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

/**
 * Extract video metadata using MediaInfo
 */
export async function extractVideoMetadata(filePath: string): Promise<VideoMetadata | undefined> {
  const data = await analyze(filePath);
  if (!data?.media?.track) return undefined;

  const tracks = data.media.track;
  const general = tracks.find(t => t['@type'] === 'General');
  const video = tracks.find(t => t['@type'] === 'Video');
  const audio = tracks.find(t => t['@type'] === 'Audio');

  if (!video && !general) return undefined;

  // Parse frame rate
  let frameRate: number | undefined;
  if (video?.FrameRate) {
    frameRate = parseFloat(video.FrameRate);
  }

  // Determine frame rate mode
  let frameRateMode: 'constant' | 'variable' | undefined;
  if (video?.FrameRate_Mode) {
    frameRateMode = video.FrameRate_Mode.toLowerCase() === 'constant' ? 'constant' : 'variable';
  }

  // Determine HDR format
  let hdr: string | undefined;
  if (video?.HDR_Format) {
    hdr = video.HDR_Format;
  } else if (video?.HDR_Format_Compatibility) {
    hdr = video.HDR_Format_Compatibility;
  } else if (video?.transfer_characteristics === 'PQ' ||
             video?.transfer_characteristics === 'SMPTE ST 2084') {
    hdr = 'HDR10';
  } else if (video?.transfer_characteristics === 'HLG' ||
             video?.transfer_characteristics === 'ARIB STD-B67') {
    hdr = 'HLG';
  }

  // Determine scan type
  let scanType: 'progressive' | 'interlaced' | undefined;
  if (video?.ScanType) {
    const st = video.ScanType.toLowerCase();
    scanType = st.includes('interlace') ? 'interlaced' : 'progressive';
  }

  return {
    container: general?.Format,
    codec: video?.Format || video?.CodecID,
    resolution: video?.Width && video?.Height ? `${video.Width}x${video.Height}` : undefined,
    width: video?.Width ? parseInt(video.Width, 10) : undefined,
    height: video?.Height ? parseInt(video.Height, 10) : undefined,
    frameRate: frameRate && !isNaN(frameRate) ? frameRate : undefined,
    frameRateMode,
    bitRate: general?.OverallBitRate ? parseInt(general.OverallBitRate, 10) : undefined,
    duration: general?.Duration ? parseDuration(general.Duration) : undefined,
    frameCount: video?.FrameCount ? parseInt(video.FrameCount, 10) : undefined,
    colorSpace: video?.ColorSpace,
    hdr,
    scanType,
    audioCodec: audio?.Format,
    audioChannels: audio?.Channels ? parseInt(audio.Channels, 10) : undefined,
    audioSampleRate: audio?.SamplingRate ? parseInt(audio.SamplingRate, 10) : undefined,
    audioBitRate: audio?.BitRate ? parseInt(audio.BitRate, 10) : undefined,
    audioBitDepth: audio?.BitDepth ? parseInt(audio.BitDepth, 10) : undefined,
    timecodeStart: general?.TimeCode_FirstFrame,
  };
}

/**
 * Extract audio metadata using MediaInfo
 */
export async function extractAudioMetadata(filePath: string): Promise<AudioMetadata | undefined> {
  const data = await analyze(filePath);
  if (!data?.media?.track) return undefined;

  const tracks = data.media.track;
  const general = tracks.find(t => t['@type'] === 'General');
  const audio = tracks.find(t => t['@type'] === 'Audio');

  if (!general && !audio) return undefined;

  // Parse year from date
  let year: number | undefined;
  if (general?.Recorded_Date) {
    const match = general.Recorded_Date.match(/\d{4}/);
    if (match) year = parseInt(match[0], 10);
  }

  return {
    album: general?.Album,
    artist: general?.Performer,
    title: general?.Title,
    track: general?.Track,
    year,
    genre: general?.Genre,
    duration: general?.Duration ? parseDuration(general.Duration) : undefined,
    format: audio?.Format,
  };
}

/**
 * Get detailed codec information
 */
export async function getCodecDetails(filePath: string): Promise<{
  video?: { format: string; profile?: string; level?: string };
  audio?: { format: string; profile?: string };
} | undefined> {
  const data = await analyze(filePath);
  if (!data?.media?.track) return undefined;

  const tracks = data.media.track;
  const video = tracks.find(t => t['@type'] === 'Video');
  const audio = tracks.find(t => t['@type'] === 'Audio');

  return {
    video: video?.Format ? {
      format: video.Format,
      profile: video.Format_Profile,
      level: video.Format_Level,
    } : undefined,
    audio: audio?.Format ? {
      format: audio.Format,
      profile: audio.Format_Profile,
    } : undefined,
  };
}

/**
 * Check if video is HDR
 */
export async function isHDR(filePath: string): Promise<boolean> {
  const data = await analyze(filePath);
  if (!data?.media?.track) return false;

  const video = data.media.track.find(t => t['@type'] === 'Video');
  if (!video) return false;

  return !!(
    video.HDR_Format ||
    video.HDR_Format_Compatibility ||
    video.transfer_characteristics === 'PQ' ||
    video.transfer_characteristics === 'SMPTE ST 2084' ||
    video.transfer_characteristics === 'HLG' ||
    video.transfer_characteristics === 'ARIB STD-B67'
  );
}

/**
 * Parse duration string to seconds
 */
function parseDuration(duration: string): number | undefined {
  if (!duration) return undefined;

  // MediaInfo returns duration in milliseconds as a number string
  const ms = parseFloat(duration);
  if (!isNaN(ms)) {
    return ms / 1000;
  }

  return undefined;
}
