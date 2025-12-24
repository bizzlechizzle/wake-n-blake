/**
 * Progress Tracker with EWMA-based ETA Calculation
 *
 * Provides weighted progress tracking and smooth ETA estimates
 * for multi-step pipelines like the import process.
 *
 * Based on SME: /sme/cli-progress-tracking.md
 *
 * @module core/progress-tracker
 */

import { STEP_WEIGHTS, STEP_NAMES, type ImportStatus } from '../services/importer.js';

/**
 * EWMA (Exponential Weighted Moving Average) configuration
 * Alpha = 2 / (N + 1) where N is sample window size
 * Lower alpha = smoother but slower to adapt
 * Higher alpha = more responsive but more jittery
 */
const EWMA_ALPHA = 0.15; // ~12 sample window, good balance

/**
 * Minimum samples before showing ETA (prevents wild initial estimates)
 */
const MIN_SAMPLES_FOR_ETA = 3;

/**
 * Step order for progress calculation
 */
const STEP_ORDER: ImportStatus[] = [
  'scanning',
  'detecting-device',
  'detecting-related',
  'hashing',
  'copying',
  'validating',
  'extracting-metadata',
  'generating-sidecars',
  'generating-manifest',
];

/**
 * Calculate cumulative weight for a step (start of step as percentage)
 */
function getStepStartPercent(step: ImportStatus): number {
  let cumulative = 0;
  for (const s of STEP_ORDER) {
    if (s === step) return cumulative;
    cumulative += STEP_WEIGHTS[s as keyof typeof STEP_WEIGHTS] ?? 0;
  }
  return 100; // completed/failed/etc
}

/**
 * Progress sample for EWMA calculation
 */
interface ProgressSample {
  timestamp: number;
  bytesProcessed: number;
  filesProcessed: number;
}

/**
 * Progress tracker state
 */
export interface ProgressState {
  /** Current step */
  step: ImportStatus;
  /** Step number (1-9 for active steps) */
  stepNumber: number;
  /** Human-readable step name */
  stepName: string;
  /** Percent within current step (0-100) */
  stepPercent: number;
  /** Weighted overall percent (0-100) */
  overallPercent: number;
  /** ETA in milliseconds (undefined if not enough samples) */
  estimatedRemainingMs?: number;
  /** Current file being processed */
  currentFile?: string;
  /** Throughput in bytes/sec (EWMA smoothed) */
  throughputBytesPerSec?: number;
  /** Throughput in files/sec (EWMA smoothed) */
  throughputFilesPerSec?: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
}

/**
 * Progress Tracker
 *
 * Tracks multi-step pipeline progress with weighted steps and EWMA-based ETA.
 *
 * @example
 * ```ts
 * const tracker = new ProgressTracker(totalFiles, totalBytes);
 * tracker.setStep('scanning');
 * tracker.update(filesProcessed, bytesProcessed, 'current-file.jpg');
 * const state = tracker.getState();
 * console.log(`ETA: ${formatDuration(state.estimatedRemainingMs)}`);
 * ```
 */
export class ProgressTracker {
  private startTime: number;
  private currentStep: ImportStatus = 'pending';
  private stepPercent = 0;
  private currentFile?: string;

  // EWMA state
  private samples: ProgressSample[] = [];
  private ewmaBytesThroughput = 0;
  private ewmaFilesThroughput = 0;
  private lastSampleTime = 0;

  // Totals
  private totalFiles: number;
  private totalBytes: number;
  private filesProcessed = 0;
  private bytesProcessed = 0;

  constructor(totalFiles: number, totalBytes: number) {
    this.startTime = Date.now();
    this.totalFiles = totalFiles;
    this.totalBytes = totalBytes;
  }

  /**
   * Set the current pipeline step
   */
  setStep(step: ImportStatus): void {
    this.currentStep = step;
    this.stepPercent = 0;
  }

  /**
   * Update progress within current step
   *
   * @param filesProcessed - Total files processed so far (not delta)
   * @param bytesProcessed - Total bytes processed so far (not delta)
   * @param currentFile - Optional current file path
   * @param stepPercent - Optional step-specific percent (0-100)
   */
  update(
    filesProcessed: number,
    bytesProcessed: number,
    currentFile?: string,
    stepPercent?: number
  ): void {
    const now = Date.now();

    // Calculate deltas
    const deltaBytes = bytesProcessed - this.bytesProcessed;
    const deltaFiles = filesProcessed - this.filesProcessed;
    const deltaTime = now - (this.lastSampleTime || this.startTime);

    // Update state
    this.filesProcessed = filesProcessed;
    this.bytesProcessed = bytesProcessed;
    this.currentFile = currentFile;

    // Update step percent
    if (stepPercent !== undefined) {
      this.stepPercent = Math.min(100, Math.max(0, stepPercent));
    } else if (this.totalBytes > 0) {
      // Auto-calculate based on bytes
      this.stepPercent = (bytesProcessed / this.totalBytes) * 100;
    } else if (this.totalFiles > 0) {
      // Fallback to file count
      this.stepPercent = (filesProcessed / this.totalFiles) * 100;
    }

    // EWMA update (only if enough time has passed to avoid noise)
    if (deltaTime >= 100) { // At least 100ms between samples
      const bytesThroughput = deltaTime > 0 ? (deltaBytes / deltaTime) * 1000 : 0;
      const filesThroughput = deltaTime > 0 ? (deltaFiles / deltaTime) * 1000 : 0;

      if (this.samples.length === 0) {
        // First sample - initialize EWMA
        this.ewmaBytesThroughput = bytesThroughput;
        this.ewmaFilesThroughput = filesThroughput;
      } else {
        // EWMA update: srtt[n] = alpha * sample + (1 - alpha) * srtt[n-1]
        this.ewmaBytesThroughput =
          EWMA_ALPHA * bytesThroughput + (1 - EWMA_ALPHA) * this.ewmaBytesThroughput;
        this.ewmaFilesThroughput =
          EWMA_ALPHA * filesThroughput + (1 - EWMA_ALPHA) * this.ewmaFilesThroughput;
      }

      // Store sample for ETA calculation
      this.samples.push({
        timestamp: now,
        bytesProcessed,
        filesProcessed,
      });

      // Keep only recent samples (last 30 seconds)
      const cutoff = now - 30000;
      this.samples = this.samples.filter(s => s.timestamp > cutoff);

      this.lastSampleTime = now;
    }
  }

  /**
   * Get current progress state
   */
  getState(): ProgressState {
    const now = Date.now();
    const elapsedMs = now - this.startTime;

    // Calculate step number (1-indexed)
    const stepIndex = STEP_ORDER.indexOf(this.currentStep);
    const stepNumber = stepIndex >= 0 ? stepIndex + 1 : 0;

    // Calculate weighted overall percent
    const stepStartPercent = getStepStartPercent(this.currentStep);
    const stepWeight = STEP_WEIGHTS[this.currentStep as keyof typeof STEP_WEIGHTS] ?? 0;
    const overallPercent = stepStartPercent + (this.stepPercent / 100) * stepWeight;

    // Calculate ETA
    let estimatedRemainingMs: number | undefined;
    if (this.samples.length >= MIN_SAMPLES_FOR_ETA) {
      const remainingBytes = this.totalBytes - this.bytesProcessed;
      const remainingFiles = this.totalFiles - this.filesProcessed;

      // Use bytes-based ETA if we have throughput, otherwise files
      if (this.ewmaBytesThroughput > 0 && remainingBytes > 0) {
        estimatedRemainingMs = (remainingBytes / this.ewmaBytesThroughput) * 1000;
      } else if (this.ewmaFilesThroughput > 0 && remainingFiles > 0) {
        estimatedRemainingMs = (remainingFiles / this.ewmaFilesThroughput) * 1000;
      }

      // Sanity check: ETA shouldn't be more than 10x elapsed time
      // (prevents wild estimates early in process)
      if (estimatedRemainingMs && estimatedRemainingMs > elapsedMs * 10) {
        estimatedRemainingMs = undefined;
      }
    }

    return {
      step: this.currentStep,
      stepNumber,
      stepName: STEP_NAMES[this.currentStep] ?? this.currentStep,
      stepPercent: Math.round(this.stepPercent * 10) / 10,
      overallPercent: Math.round(overallPercent * 10) / 10,
      estimatedRemainingMs,
      currentFile: this.currentFile,
      throughputBytesPerSec: Math.round(this.ewmaBytesThroughput),
      throughputFilesPerSec: Math.round(this.ewmaFilesThroughput * 100) / 100,
      elapsedMs,
    };
  }

  /**
   * Reset tracker (for reuse)
   */
  reset(totalFiles: number, totalBytes: number): void {
    this.startTime = Date.now();
    this.currentStep = 'pending';
    this.stepPercent = 0;
    this.currentFile = undefined;
    this.samples = [];
    this.ewmaBytesThroughput = 0;
    this.ewmaFilesThroughput = 0;
    this.lastSampleTime = 0;
    this.totalFiles = totalFiles;
    this.totalBytes = totalBytes;
    this.filesProcessed = 0;
    this.bytesProcessed = 0;
  }

  /**
   * Update totals (if discovered after start)
   */
  setTotals(totalFiles: number, totalBytes: number): void {
    this.totalFiles = totalFiles;
    this.totalBytes = totalBytes;
  }
}

/**
 * Format duration in human-readable form
 *
 * @param ms - Duration in milliseconds
 * @param format - 'short' for CLI (3h15m), 'long' for logs (3 hours, 15 minutes)
 * @returns Formatted duration string
 *
 * @example
 * formatDuration(7500000) // '2h5m' or '2 hours, 5 minutes'
 * formatDuration(45000)   // '45s' or '45 seconds'
 * formatDuration(500)     // '< 1s' or 'less than a second'
 */
export function formatDuration(
  ms: number | undefined,
  format: 'short' | 'long' = 'short'
): string {
  if (ms === undefined || ms < 0) {
    return format === 'short' ? '--' : 'calculating...';
  }

  if (ms < 1000) {
    return format === 'short' ? '< 1s' : 'less than a second';
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const s = seconds % 60;
  const m = minutes % 60;
  const h = hours % 24;

  if (format === 'short') {
    if (days > 0) return `${days}d${h}h${m}m`;
    if (hours > 0) return `${h}h${m}m${s}s`;
    if (minutes > 0) return `${m}m${s}s`;
    return `${s}s`;
  }

  // Long format
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (h > 0) parts.push(`${h} hour${h !== 1 ? 's' : ''}`);
  if (m > 0) parts.push(`${m} minute${m !== 1 ? 's' : ''}`);
  if (s > 0 && days === 0) parts.push(`${s} second${s !== 1 ? 's' : ''}`);

  return parts.length > 0 ? parts.join(', ') : 'less than a second';
}

/**
 * Format bytes in human-readable form
 *
 * @param bytes - Size in bytes
 * @param decimals - Decimal places (default: 1)
 * @returns Formatted size string (e.g., "1.5 GB")
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '-' + formatBytes(-bytes, decimals);

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Format throughput in human-readable form
 *
 * @param bytesPerSec - Throughput in bytes/second
 * @returns Formatted throughput string (e.g., "125.5 MB/s")
 */
export function formatThroughput(bytesPerSec: number | undefined): string {
  if (bytesPerSec === undefined || bytesPerSec <= 0) {
    return '--';
  }
  return `${formatBytes(bytesPerSec)}/s`;
}

/**
 * Format ETA for display
 *
 * @param estimatedRemainingMs - Remaining time in milliseconds
 * @returns User-friendly ETA string
 */
export function formatETA(estimatedRemainingMs: number | undefined): string {
  if (estimatedRemainingMs === undefined) {
    return 'calculating...';
  }
  if (estimatedRemainingMs < 1000) {
    return 'almost done';
  }
  return formatDuration(estimatedRemainingMs, 'short');
}

/**
 * Create a simple progress bar string
 *
 * @param percent - Progress percentage (0-100)
 * @param width - Bar width in characters (default: 20)
 * @returns Progress bar string (e.g., "[████████░░░░░░░░░░░░] 40%")
 */
export function progressBar(percent: number, width = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${Math.round(percent)}%`;
}
