/**
 * Audio Quality Analysis Wrapper
 *
 * Analyzes audio files for quality classification, transcode detection,
 * and technical properties using ffprobe.
 *
 * Ported from barbossa/core/music.py
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const execAsync = promisify(exec);

/**
 * Audio quality classification
 */
export type AudioQualityClass =
  | 'lossless'
  | 'lossy'
  | 'transcode_suspected'
  | 'unknown';

/**
 * Lossless audio formats (safe to convert to FLAC)
 */
const LOSSLESS_FORMATS = new Set([
  '.flac', '.aiff', '.aif', '.wav', '.wave',
  '.alac', '.ape', '.wv', '.tta', '.tak', '.dsd', '.dsf'
]);

/**
 * Lossy audio formats (NEVER convert to lossless)
 */
const LOSSY_FORMATS = new Set([
  '.mp3', '.m4a', '.aac', '.ogg', '.opus',
  '.wma', '.mpc', '.mp2'
]);

/**
 * Lossless codec names from ffprobe
 */
const LOSSLESS_CODECS = new Set([
  'flac', 'alac', 'wavpack', 'ape', 'tta', 'tak',
  'pcm_s16le', 'pcm_s16be', 'pcm_s24le', 'pcm_s24be',
  'pcm_s32le', 'pcm_s32be', 'pcm_f32le', 'pcm_f32be',
  'pcm_s16le_planar', 'pcm_s24le_planar', 'pcm_s32le_planar',
  'dsd_lsbf', 'dsd_msbf', 'dsd_lsbf_planar', 'dsd_msbf_planar'
]);

/**
 * Lossy codec names from ffprobe
 */
const LOSSY_CODECS = new Set([
  'mp3', 'aac', 'vorbis', 'opus', 'wma', 'wmav1', 'wmav2',
  'mp2', 'mp1', 'ac3', 'eac3', 'dts', 'truehd'
]);

/**
 * Minimum frequency cutoff for lossless audio (Hz)
 * Below this threshold suggests lossy source (transcode detection)
 */
const LOSSLESS_FREQ_THRESHOLD = 20000;

/**
 * Audio quality analysis result
 */
export interface AudioQualityInfo {
  /** Quality classification */
  classification: AudioQualityClass;
  /** Audio codec (e.g., 'flac', 'mp3', 'aac') */
  codec: string;
  /** Codec long name (e.g., 'FLAC (Free Lossless Audio Codec)') */
  codecLongName?: string;
  /** Sample rate in Hz (e.g., 44100, 96000) */
  sampleRate?: number;
  /** Bit depth (e.g., 16, 24, 32) */
  bitDepth?: number;
  /** Number of channels (e.g., 2 for stereo) */
  channels: number;
  /** Channel layout (e.g., 'stereo', '5.1') */
  channelLayout?: string;
  /** Bitrate in bits per second */
  bitrate?: number;
  /** Duration in seconds */
  duration?: number;
  /** File format/container (e.g., 'flac', 'mp3') */
  format: string;
  /** Detected frequency cutoff in Hz (for transcode detection) */
  frequencyCutoff?: number;
  /** Whether this is likely a transcode (lossy → lossless) */
  isTranscode: boolean;
  /** Human-readable quality description */
  qualityDescription: string;
}

/**
 * ffprobe stream interface (audio-specific)
 */
interface FFProbeAudioStream {
  codec_type: 'audio';
  codec_name: string;
  codec_long_name?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  bits_per_sample?: number;
  bits_per_raw_sample?: string;
  bit_rate?: string;
  duration?: string;
}

/**
 * ffprobe format interface
 */
interface FFProbeFormat {
  format_name: string;
  format_long_name?: string;
  duration?: string;
  bit_rate?: string;
  tags?: Record<string, string>;
}

/**
 * ffprobe output interface
 */
interface FFProbeOutput {
  streams: Array<FFProbeAudioStream | { codec_type: string }>;
  format: FFProbeFormat;
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
 * Run ffprobe to get audio stream info
 */
async function probeAudio(filePath: string): Promise<FFProbeOutput | undefined> {
  if (!(await isFFProbeAvailable())) {
    return undefined;
  }

  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams -select_streams a:0 "${filePath}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

/**
 * Classify audio quality based on format, codec, and properties
 */
function classifyQuality(
  ext: string,
  codec: string,
  bitDepth: number | undefined,
  bitrate: number | undefined,
  sampleRate: number | undefined,
  frequencyCutoff: number | undefined
): { classification: AudioQualityClass; description: string; isTranscode: boolean } {
  const extLower = ext.toLowerCase();

  // Check for transcode (lossy source in lossless container)
  if (LOSSLESS_FORMATS.has(extLower) || LOSSLESS_CODECS.has(codec)) {
    // If we have frequency cutoff data showing low cutoff, it's likely a transcode
    if (frequencyCutoff && frequencyCutoff < LOSSLESS_FREQ_THRESHOLD) {
      return {
        classification: 'transcode_suspected',
        description: `Suspected transcode: frequency cutoff at ${frequencyCutoff}Hz suggests lossy source`,
        isTranscode: true
      };
    }
  }

  // Known lossy formats
  if (LOSSY_FORMATS.has(extLower) || LOSSY_CODECS.has(codec)) {
    let description = `Lossy: ${codec}`;
    if (bitrate) {
      description += ` @ ${Math.round(bitrate / 1000)}kbps`;
    }
    return {
      classification: 'lossy',
      description,
      isTranscode: false
    };
  }

  // Known lossless codecs
  if (LOSSLESS_CODECS.has(codec)) {
    let description = `Lossless: ${codec}`;
    if (bitDepth && sampleRate) {
      description += ` ${bitDepth}-bit/${sampleRate / 1000}kHz`;
    }
    return {
      classification: 'lossless',
      description,
      isTranscode: false
    };
  }

  // Known lossless formats (by extension)
  if (LOSSLESS_FORMATS.has(extLower)) {
    let description = `Lossless: ${extLower}`;
    if (bitDepth && sampleRate) {
      description += ` ${bitDepth}-bit/${sampleRate / 1000}kHz`;
    }
    return {
      classification: 'lossless',
      description,
      isTranscode: false
    };
  }

  // Check bit depth - lossless typically 16/24/32 bit
  if (bitDepth && bitDepth >= 16) {
    return {
      classification: 'lossless',
      description: `Likely lossless: ${bitDepth}-bit audio`,
      isTranscode: false
    };
  }

  return {
    classification: 'unknown',
    description: `Unknown quality: ${codec} in ${extLower}`,
    isTranscode: false
  };
}

/**
 * Analyze audio file quality
 *
 * @param filePath - Path to audio file
 * @returns Audio quality analysis or undefined if analysis failed
 */
export async function analyzeAudioQuality(filePath: string): Promise<AudioQualityInfo | undefined> {
  const data = await probeAudio(filePath);
  if (!data) return undefined;

  // Find audio stream
  const audioStream = data.streams.find(
    (s): s is FFProbeAudioStream => s.codec_type === 'audio'
  );

  if (!audioStream) return undefined;

  const ext = path.extname(filePath);
  const codec = audioStream.codec_name || 'unknown';
  const sampleRate = audioStream.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined;
  const bitDepth = audioStream.bits_per_sample ||
    (audioStream.bits_per_raw_sample ? parseInt(audioStream.bits_per_raw_sample, 10) : undefined);
  const channels = audioStream.channels || 2;
  const channelLayout = audioStream.channel_layout;
  const bitrate = audioStream.bit_rate
    ? parseInt(audioStream.bit_rate, 10)
    : (data.format.bit_rate ? parseInt(data.format.bit_rate, 10) : undefined);
  const duration = data.format.duration ? parseFloat(data.format.duration) : undefined;

  // TODO: Implement frequency cutoff detection via spectral analysis
  // This would require running ffmpeg with showspectrumpic or similar
  // For now, we rely on codec/format-based detection
  const frequencyCutoff: number | undefined = undefined;

  const { classification, description, isTranscode } = classifyQuality(
    ext,
    codec,
    bitDepth,
    bitrate,
    sampleRate,
    frequencyCutoff
  );

  return {
    classification,
    codec,
    codecLongName: audioStream.codec_long_name,
    sampleRate,
    bitDepth,
    channels,
    channelLayout,
    bitrate,
    duration,
    format: ext.replace('.', ''),
    frequencyCutoff,
    isTranscode,
    qualityDescription: description
  };
}

/**
 * Check if audio file can be safely converted to FLAC
 *
 * @param info - Audio quality info from analyzeAudioQuality
 * @returns Object with canConvert flag and reason
 */
export function canConvertToFlac(info: AudioQualityInfo): { canConvert: boolean; reason: string } {
  if (info.classification === 'lossy') {
    return {
      canConvert: false,
      reason: `Source is lossy (${info.codec}) - converting to FLAC would create fake lossless`
    };
  }

  if (info.classification === 'transcode_suspected') {
    return {
      canConvert: false,
      reason: 'Source appears to be a lossy transcode - frequency cutoff detected'
    };
  }

  if (info.format === 'flac') {
    return {
      canConvert: false,
      reason: 'Already FLAC format'
    };
  }

  if (info.classification === 'lossless') {
    return {
      canConvert: true,
      reason: `Safe to convert: ${info.format} is lossless`
    };
  }

  return {
    canConvert: false,
    reason: `Unknown format quality: ${info.format}`
  };
}

/**
 * Convert audio quality info to flat key-value pairs with AudioQuality_ prefix
 * for inclusion in XMP rawMetadata
 */
export function toRawMetadata(info: AudioQualityInfo): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'AudioQuality_Classification': info.classification,
    'AudioQuality_Codec': info.codec,
    'AudioQuality_Format': info.format,
    'AudioQuality_Channels': info.channels,
    'AudioQuality_IsTranscode': info.isTranscode,
    'AudioQuality_Description': info.qualityDescription
  };

  if (info.codecLongName) {
    metadata['AudioQuality_CodecLongName'] = info.codecLongName;
  }
  if (info.sampleRate !== undefined) {
    metadata['AudioQuality_SampleRate'] = info.sampleRate;
  }
  if (info.bitDepth !== undefined) {
    metadata['AudioQuality_BitDepth'] = info.bitDepth;
  }
  if (info.channelLayout) {
    metadata['AudioQuality_ChannelLayout'] = info.channelLayout;
  }
  if (info.bitrate !== undefined) {
    metadata['AudioQuality_Bitrate'] = info.bitrate;
  }
  if (info.duration !== undefined) {
    metadata['AudioQuality_Duration'] = info.duration;
  }
  if (info.frequencyCutoff !== undefined) {
    metadata['AudioQuality_FrequencyCutoff'] = info.frequencyCutoff;
  }

  return metadata;
}
