# CLI Progress Tracking and ETA Estimation Best Practices

> **Generated**: 2024-12-24
> **Sources current as of**: December 2024
> **Scope**: Comprehensive
> **Version**: 1.0
> **Audit-Ready**: Yes

---

## Executive Summary / TLDR

Progress indicators are critical for CLI tools processing files, as users abandon unresponsive tools after just 3 seconds without feedback. This document covers:

1. **Three display patterns**: Spinners (<4s), X of Y (step processes), Progress bars (parallel/long tasks)
2. **ETA calculation**: Use Exponential Weighted Moving Average (EWMA) with alpha ~0.1-0.2 for stable estimates
3. **Step weighting**: Weight progress by task difficulty, not just file count (e.g., copying is 45%, scanning is 5%)
4. **UX principles**: Never stop the bar, approximate is better than precise-but-wrong, start slower/accelerate to end
5. **Human-readable time**: Use largest units, handle edge cases ("now", "< 1s", "calculating...")

**Key recommendation**: Implement weighted progress with EWMA-smoothed ETA, displaying both file count and estimated time remaining.

---

## Background & Context

Command-line tools that process files (media importers, build tools, package managers) must provide progress feedback to:

- Prevent user perception of frozen/broken state
- Allow users to estimate when they can proceed with dependent tasks
- Build trust and professionalism in the tool

Research shows users become impatient after 3 seconds without feedback [1]. Progress indicators reassure users the platform is working correctly.

### Key Terms

- **Determinate progress**: Known total, can calculate percentage (e.g., 45 of 100 files)
- **Indeterminate progress**: Unknown total, spinner only (e.g., network discovery)
- **EWMA**: Exponential Weighted Moving Average - smoothing algorithm for throughput
- **Step weighting**: Assigning different "costs" to pipeline stages
- **Sandbagging**: Intentionally padding estimates to over-deliver

---

## 1. Progress Display Patterns

### 1.1 Pattern Selection Guidelines [1][HIGH]

| Pattern | When to Use | Example |
|---------|-------------|---------|
| **Spinner** | Task < 4 seconds, or unmeasurable progress | Connecting to server... |
| **X of Y** | Step-by-step processes with measurable steps | Processing file 23 of 100 |
| **Progress Bar** | Parallel processes or single tasks > 4 seconds | [████████░░░░░░░░] 50% |

**Decision tree:**
```
Is total work knowable?
├─ No  → Use spinner with status text
└─ Yes → Is duration > 4 seconds?
         ├─ No  → Use spinner (avoid progress bar flash)
         └─ Yes → Is it parallel processes?
                  ├─ Yes → Single aggregate progress bar
                  └─ No  → X of Y or progress bar
```

### 1.2 Progress Bar Design [2][HIGH]

**Required elements:**
- Visual bar showing percentage complete
- Numeric percentage OR fraction (45/100)
- Current item name (for context)
- ETA or elapsed time

**Example format:**
```
[████████████░░░░░░░░] 60% | 234/390 files | ETA: 2m 15s | photo_001.jpg
```

**Best practices:**
- Clear completed progress bars after success (show checkmark + summary)
- Use green/checkmark for success, red/X for errors
- Never let bar go backwards (confuses users)
- Single aggregate bar for multiple parallel operations [1]

### 1.3 Thread Safety [3][HIGH]

For multi-threaded applications, the progress API must be:
- Thread-safe
- Lock-free (avoid contention)
- Minimal memory loads/stores
- Non-heap-allocating (use static pre-allocation)

Zig's approach: Pre-allocate 83 nodes statically (fits in 4KB page), making API infallible [3].

---

## 2. ETA Calculation Algorithms

### 2.1 Exponential Weighted Moving Average (EWMA) [4][HIGH]

The standard algorithm for smoothing throughput measurements:

```typescript
// Core EWMA formula
ewma[n] = alpha * sample + (1 - alpha) * ewma[n-1]

// Where:
// - sample = current throughput (bytes/sec or files/sec)
// - alpha = smoothing factor (0 < alpha < 1)
// - Higher alpha = more weight on recent samples
```

**Choosing alpha:**
- `alpha = 2 / (N + 1)` where N = equivalent sample window
- For 10-sample equivalent: alpha = 0.18
- For 20-sample equivalent: alpha = 0.095
- **Recommended: alpha = 0.1 to 0.2** for file processing [4]

### 2.2 ETA Calculation [4][MEDIUM]

```typescript
function calculateETA(
  remainingWork: number,     // bytes or files remaining
  ewmaThroughput: number,    // smoothed throughput
  minETA: number = 1000      // minimum 1 second to avoid jitter
): number {
  if (ewmaThroughput <= 0) return Infinity;

  const rawETA = remainingWork / ewmaThroughput;
  return Math.max(rawETA, minETA);
}
```

### 2.3 Deviation Tracking [4][MEDIUM]

TCP's approach for confidence bounds:

```typescript
// Track deviation for confidence intervals
dev_sample = |sample - ewma|
ewmaDev[n] = beta * dev_sample + (1 - beta) * ewmaDev[n-1]

// Timeout/upper bound (k=4 covers 93.75% of samples)
upperBound = ewma + k * ewmaDev
```

### 2.4 Handling Edge Cases [MEDIUM]

| Scenario | Solution |
|----------|----------|
| First sample | Use sample directly, no averaging |
| Zero throughput | Display "Calculating..." or "Stalled" |
| Negative time | Clamp to 0 or show "Almost done..." |
| Very long ETA | Round to nearest hour/day, show "> 1 hour" |
| Throughput spike | EWMA naturally smooths these |
| Throughput drop | EWMA adapts over several samples |

---

## 3. Step Weighting for Multi-Stage Pipelines

### 3.1 Problem with Raw Progress [HIGH]

If a pipeline has 8 stages and you show `stage 2 of 8 = 25%`, users perceive:
- "Stuck at 25%" when stage 2 takes 10x longer than stage 1
- Progress that jumps (5% → 25% → 30% → 95%) feels broken

### 3.2 Weighted Progress Solution [HIGH]

Assign weights based on actual time each stage takes:

```typescript
const STEP_WEIGHTS: Record<string, number> = {
  'scanning':           5,   // 0-5%: Fast directory enumeration
  'detecting-device':   2,   // 5-7%: USB/device detection
  'detecting-related':  3,   // 7-10%: Finding Live Photos, RAW+JPEG pairs
  'hashing':           25,   // 10-35%: CPU-bound BLAKE3 hashing
  'copying':           35,   // 35-70%: I/O-bound, network-variable
  'validating':        10,   // 70-80%: Re-read for verification
  'extracting-metadata': 10, // 80-90%: ExifTool, ffprobe, etc.
  'generating-sidecars': 8,  // 90-98%: XMP file writes
  'generating-manifest': 2,  // 98-100%: Final JSON write
};

function calculateWeightedProgress(
  currentStep: string,
  stepProgress: number,      // 0-100 within this step
  completedSteps: string[]
): number {
  const totalWeight = Object.values(STEP_WEIGHTS).reduce((a, b) => a + b, 0);

  // Sum weights of completed steps
  const completedWeight = completedSteps.reduce(
    (sum, step) => sum + (STEP_WEIGHTS[step] || 0),
    0
  );

  // Add partial progress of current step
  const currentWeight = STEP_WEIGHTS[currentStep] || 0;
  const partialWeight = currentWeight * (stepProgress / 100);

  return ((completedWeight + partialWeight) / totalWeight) * 100;
}
```

### 3.3 Calibrating Weights [MEDIUM]

To determine weights empirically:
1. Run pipeline on representative dataset
2. Log timestamp at each stage transition
3. Calculate percentage of total time per stage
4. Round to nice numbers that sum to 100

---

## 4. Human-Readable Time Formatting

### 4.1 Format Specifications [HIGH]

**Short format** (for CLI inline display):
```
3h15m23s
45m12s
2m30s
45s
< 1s
```

**Long format** (for logs, completion messages):
```
3 hours, 15 minutes and 23 seconds
45 minutes and 12 seconds
2 minutes and 30 seconds
45 seconds
less than 1 second
```

### 4.2 Implementation [HIGH]

```typescript
interface TimeFormatOptions {
  style: 'short' | 'long';
  maxUnits?: number;        // Limit displayed units (default: 3)
  showSeconds?: boolean;    // Hide seconds for long durations
}

function formatDuration(
  ms: number,
  options: TimeFormatOptions = { style: 'short' }
): string {
  if (ms < 1000) return options.style === 'short' ? '< 1s' : 'less than 1 second';
  if (ms < 0) return options.style === 'short' ? 'now' : 'now';

  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000) % 24;
  const days = Math.floor(ms / 86400000);

  if (options.style === 'short') {
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 && hours === 0) parts.push(`${seconds}s`);  // Hide seconds for long durations
    return parts.join('') || '< 1s';
  }

  // Long format with proper grammar
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  if (seconds > 0 && hours === 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);

  if (parts.length === 0) return 'less than 1 second';
  if (parts.length === 1) return parts[0];

  const last = parts.pop();
  return `${parts.join(', ')} and ${last}`;
}
```

### 4.3 Edge Cases [MEDIUM]

| Scenario | Display |
|----------|---------|
| ETA not yet calculated | "Calculating..." |
| ETA is negative | "Almost done..." or "Finishing..." |
| ETA is 0 | "< 1s" or "now" |
| ETA > 24 hours | "1d 3h" (omit minutes/seconds) |
| ETA is Infinity | "Unknown" or just show file count |
| Processing stalled | "Stalled" with last activity time |

---

## 5. UX Considerations

### 5.1 Never Stop the Progress Bar [1][HIGH]

The worst possible scenario is when the progress bar stops moving unexpectedly, especially at high percentages (99% freeze). Users assume the application is broken.

**Solutions:**
- Use weighted progress to smooth jumps
- Add micro-progress within stages (file N of M within stage)
- Keep animation moving even during slow operations
- Show current activity text to indicate liveness

### 5.2 Perception Tricks [5][MEDIUM]

Research shows you can improve perceived speed by:

1. **Start slow, accelerate to end**: Progress that accelerates feels faster
2. **Front-load quick wins**: Put fast stages first
3. **Show constant activity**: Spinning indicator + progress bar
4. **Provide context**: "Copying large video file..." explains slowdown

### 5.3 Approximate is Better [5][HIGH]

Users prefer a stable approximate ETA over a precise-but-jumpy one.

**Bad**: `ETA: 2:15 → 1:45 → 3:20 → 2:05` (jumps around)
**Good**: `ETA: 2:15 → 2:10 → 2:05 → 2:00` (smooth countdown)

EWMA smoothing achieves this naturally.

### 5.4 Sandbagging Considerations [MEDIUM]

Some tools intentionally pad estimates to over-deliver (sandbagging). This is controversial:

**Pros:**
- Users pleasantly surprised when it finishes early
- Reduces complaints about missed estimates

**Cons:**
- Users learn to distrust estimates
- Makes planning difficult
- Feels dishonest

**Recommendation**: Don't sandbag. Provide honest estimates with EWMA smoothing. Users prefer accuracy.

---

## 6. Implementation Examples

### 6.1 rsync Progress [6][HIGH]

rsync's `--progress` flag shows:
```
file.jpg
     12,345,678 100%   10.50MB/s    0:01:23 (xfr#123, to-chk=456/789)
```

**Fields:**
- File size transferred
- Percentage complete (per file)
- Transfer rate
- Elapsed time
- Transfer count / remaining check count

**Limitation**: ETA per-file only, not overall transfer [6].

### 6.2 npm/proggy [7][MEDIUM]

npm's official progress library (`proggy`) provides:
- Progress bar updates "at a distance" (event-based)
- Non-blocking updates
- Configurable smoothing

### 6.3 Zig Standard Library [3][HIGH]

Zig's progress bar is notable for:
- Lock-free, thread-safe API
- Static 83-node pre-allocation (fits in 4KB)
- Child process progress via pipe + `ZIG_PROGRESS` env var
- Zero overhead when disabled (`--color off`)

---

## 7. Recommended Implementation for wake-n-blake

### 7.1 Data Structures

```typescript
interface ProgressState {
  // Pipeline state
  step: number;                    // 1-9
  stepName: ImportStatus;          // Current stage name

  // File progress
  filesProcessed: number;
  filesTotal: number;
  currentFile: string;

  // Byte progress
  bytesProcessed: number;
  bytesTotal: number;

  // Timing
  startedAt: number;               // Date.now()
  stepStartedAt: number;           // Current step start

  // Throughput (EWMA smoothed)
  throughputBytesPerSec: number;
  throughputFilesPerSec: number;

  // ETA
  estimatedRemainingMs: number;
  weightedPercent: number;         // 0-100 weighted by step
}
```

### 7.2 Progress Update Flow

```typescript
function updateProgress(
  state: ProgressState,
  event: 'file-complete' | 'step-complete' | 'byte-progress',
  payload: { bytes?: number; file?: string }
): ProgressState {
  const now = Date.now();

  // Update raw counters
  if (event === 'file-complete') {
    state.filesProcessed++;
    state.currentFile = payload.file || '';
  }

  if (payload.bytes) {
    state.bytesProcessed += payload.bytes;
  }

  // Calculate instantaneous throughput
  const elapsed = now - state.stepStartedAt;
  const instantThroughput = elapsed > 0
    ? state.bytesProcessed / (elapsed / 1000)
    : 0;

  // EWMA smooth throughput (alpha = 0.15)
  const alpha = 0.15;
  state.throughputBytesPerSec = state.throughputBytesPerSec === 0
    ? instantThroughput
    : alpha * instantThroughput + (1 - alpha) * state.throughputBytesPerSec;

  // Calculate ETA
  const remainingBytes = state.bytesTotal - state.bytesProcessed;
  state.estimatedRemainingMs = state.throughputBytesPerSec > 0
    ? (remainingBytes / state.throughputBytesPerSec) * 1000
    : Infinity;

  // Calculate weighted percent
  state.weightedPercent = calculateWeightedProgress(
    state.stepName,
    (state.filesProcessed / state.filesTotal) * 100,
    getCompletedSteps(state.step)
  );

  return state;
}
```

### 7.3 CLI Display

```typescript
function formatProgressLine(state: ProgressState): string {
  const bar = formatProgressBar(state.weightedPercent, 20);
  const percent = state.weightedPercent.toFixed(0).padStart(3);
  const files = `${state.filesProcessed}/${state.filesTotal}`;
  const eta = formatDuration(state.estimatedRemainingMs, { style: 'short' });
  const speed = formatThroughput(state.throughputBytesPerSec);
  const file = truncateMiddle(state.currentFile, 30);

  return `${bar} ${percent}% | ${files} | ETA: ${eta} | ${speed} | ${file}`;
}

// Output: [████████░░░░░░░░░░░░]  45% | 234/520 | ETA: 2m30s | 45.2 MB/s | photo_001.jpg
```

---

## Limitations & Uncertainties

### What This Document Does NOT Cover

- GUI progress indicators (focus is CLI)
- Network transfer protocols (TCP/UDP specifics)
- Database query progress (different paradigm)
- Real-time streaming progress

### Source Conflicts

- Some sources recommend sandbagging; this document advises against it based on user trust research
- Alpha value recommendations range from 0.04 to 0.2; we recommend 0.1-0.2 for file processing

### Knowledge Gaps

- Optimal step weights are workload-dependent; empirical calibration recommended
- No standard for inter-process progress communication (Zig's approach is innovative but not widely adopted)

---

## Source Appendix

| # | Source | Date | Type | Used For |
|---|--------|------|------|----------|
| 1 | [Evil Martians CLI UX](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays) | 2024 | Secondary | Display patterns, spinner vs bar |
| 2 | [Carbon Design System](https://carbondesignsystem.com/components/progress-bar/usage/) | 2024 | Secondary | Progress bar design guidelines |
| 3 | [Zig Progress Bar](https://andrewkelley.me/post/zig-new-cli-progress-bar-explained.html) | 2024 | Primary | Lock-free design, IPC |
| 4 | [MIT EWMA Notes](http://web.mit.edu/6.02/www/currentsemester/handouts/L22_notes.txt) | 2024 | Primary | EWMA algorithm, TCP RTT |
| 5 | [Smashing Magazine Progress](https://www.smashingmagazine.com/2016/12/best-practices-for-animated-progress-indicators/) | 2016 | Secondary | Perception, UX |
| 6 | [rsync Progress](https://github.com/JohannesBuchner/rsync-progress) | 2024 | Secondary | Real-world implementation |
| 7 | [npm/proggy](https://github.com/npm/proggy) | 2024 | Primary | Event-based progress |
| 8 | [progress-smoother npm](https://www.npmjs.com/package/progress-smoother) | 2024 | Secondary | Smoothing algorithms |
| 9 | [Wikipedia EWMA](https://en.wikipedia.org/wiki/Moving_average) | 2024 | Tertiary | Algorithm definition |
| 10 | [Cloud Four Progress Bars](https://cloudfour.com/thinks/truth-lies-and-progress-bars/) | 2020 | Secondary | UX research, user perception |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-24 | Initial version |
