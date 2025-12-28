# Universal Progress Protocol Specification

Version: 1.0.0
Last Updated: 2024-12-24

## Overview

All child repositories report progress via Unix domain sockets, enabling:
- Real-time progress updates to orchestrators
- Bidirectional control (pause, resume, cancel)
- Language-agnostic communication (JSON over Unix socket)
- Consistent ETA calculation using EWMA smoothing

## Connection Model

```
+------------------+                    +------------------+
|   Orchestrator   |  Unix Socket       |   Child App      |
|   (caller)       | <----------------> |   (worker)       |
+------------------+                    +------------------+
        |                                       |
        |  Creates socket                       |
        |  Sets PROGRESS_SOCKET env             |
        |  Spawns child process                 |
        |                                       |
        |          <-- progress updates ---     |
        |          --- control commands -->     |
        |                                       |
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PROGRESS_SOCKET` | Yes | Path to Unix socket (e.g., `/tmp/progress-12345.sock`) |
| `PROGRESS_SESSION_ID` | No | Session identifier for multi-task orchestration |

## Message Format

All messages are JSON objects terminated by newline (`\n`).

### Progress Update (Worker → Orchestrator)

```json
{
  "type": "progress",
  "timestamp": "2024-12-24T12:00:00.000Z",
  "session_id": "abc123",
  "app": "wake-n-blake",
  "app_version": "0.1.5",
  "stage": {
    "name": "hashing",
    "number": 3,
    "total_stages": 9,
    "display_name": "Computing hashes",
    "weight": 25
  },
  "items": {
    "total": 1000,
    "completed": 234,
    "failed": 2,
    "skipped": 5
  },
  "bytes": {
    "total": 50000000000,
    "completed": 12500000000
  },
  "current": {
    "item": "/path/to/current/file.jpg",
    "item_short": "file.jpg",
    "stage_percent": 45.2
  },
  "timing": {
    "started_at": "2024-12-24T11:55:00.000Z",
    "elapsed_ms": 300000,
    "eta_ms": 450000
  },
  "throughput": {
    "items_per_sec": 0.78,
    "bytes_per_sec": 41666667
  },
  "percent_complete": 23.4
}
```

### Stage Started (Worker → Orchestrator)

```json
{
  "type": "stage_started",
  "timestamp": "2024-12-24T12:00:00.000Z",
  "session_id": "abc123",
  "app": "wake-n-blake",
  "stage": {
    "name": "hashing",
    "number": 3,
    "total_stages": 9,
    "display_name": "Computing hashes"
  }
}
```

### Stage Completed (Worker → Orchestrator)

```json
{
  "type": "stage_completed",
  "timestamp": "2024-12-24T12:05:00.000Z",
  "session_id": "abc123",
  "app": "wake-n-blake",
  "stage": {
    "name": "hashing",
    "number": 3
  },
  "duration_ms": 300000,
  "items_processed": 234
}
```

### Item Completed (Worker → Orchestrator)

Optional fine-grained updates per item:

```json
{
  "type": "item_completed",
  "timestamp": "2024-12-24T12:00:01.000Z",
  "session_id": "abc123",
  "app": "wake-n-blake",
  "item": "/path/to/file.jpg",
  "status": "success",
  "duration_ms": 125,
  "bytes_processed": 12500000
}
```

Status values: `success`, `failed`, `skipped`, `duplicate`

### Error (Worker → Orchestrator)

```json
{
  "type": "error",
  "timestamp": "2024-12-24T12:00:00.000Z",
  "session_id": "abc123",
  "app": "wake-n-blake",
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "Source file does not exist",
    "item": "/path/to/missing.jpg",
    "fatal": false
  }
}
```

### Complete (Worker → Orchestrator)

Sent when processing finishes:

```json
{
  "type": "complete",
  "timestamp": "2024-12-24T12:30:00.000Z",
  "session_id": "abc123",
  "app": "wake-n-blake",
  "summary": {
    "total_items": 1000,
    "successful": 993,
    "failed": 2,
    "skipped": 5,
    "duration_ms": 1800000,
    "bytes_processed": 50000000000
  },
  "exit_code": 0
}
```

## Control Commands (Orchestrator → Worker)

### Pause

```json
{
  "type": "control",
  "command": "pause"
}
```

Worker MUST:
1. Finish current item (don't interrupt mid-file)
2. Send acknowledgment
3. Wait for resume

### Resume

```json
{
  "type": "control",
  "command": "resume"
}
```

### Cancel

```json
{
  "type": "control",
  "command": "cancel",
  "reason": "User requested cancellation"
}
```

Worker MUST:
1. Stop processing after current item
2. Send `complete` message with partial results
3. Exit cleanly

### Acknowledgment (Worker → Orchestrator)

```json
{
  "type": "ack",
  "timestamp": "2024-12-24T12:00:00.000Z",
  "command": "pause",
  "status": "accepted"
}
```

Status values: `accepted`, `rejected`, `ignored`

## EWMA Throughput Calculation

All apps MUST use EWMA (Exponential Weighted Moving Average) for throughput:

```
alpha = 0.15  # Smoothing factor (~12 sample window)

ewma_throughput = alpha * instant_throughput + (1 - alpha) * ewma_throughput
```

ETA calculation:
```
remaining_items = total_items - completed_items
eta_seconds = remaining_items / ewma_items_per_second
```

**Rules:**
- Minimum 3 samples before reporting ETA
- ETA sanity check: must be < 10x elapsed time
- Report `null` for ETA if insufficient data

## Stage Definitions

### wake-n-blake (9 stages)

| # | Name | Weight | Display Name |
|---|------|--------|--------------|
| 1 | scanning | 5 | Scanning files |
| 2 | detecting-device | 2 | Detecting source device |
| 3 | detecting-related | 3 | Finding related files |
| 4 | hashing | 25 | Computing hashes |
| 5 | copying | 35 | Copying files |
| 6 | validating | 10 | Validating copies |
| 7 | extracting-metadata | 10 | Extracting metadata |
| 8 | generating-sidecars | 8 | Generating sidecars |
| 9 | generating-manifest | 2 | Writing manifest |

### shoemaker (4 stages)

| # | Name | Weight | Display Name |
|---|------|--------|--------------|
| 1 | scanning | 5 | Scanning files |
| 2 | analyzing | 10 | Analyzing files |
| 3 | generating | 80 | Generating thumbnails |
| 4 | writing-xmp | 5 | Writing XMP |

### visual-buffet (3 stages)

| # | Name | Weight | Display Name |
|---|------|--------|--------------|
| 1 | loading | 5 | Loading plugins |
| 2 | tagging | 90 | Running inference |
| 3 | writing | 5 | Writing results |

### national-treasure (10 stages)

| # | Name | Weight | Display Name |
|---|------|--------|--------------|
| 1 | initializing | 2 | Browser startup |
| 2 | navigating | 25 | Loading page |
| 3 | waiting | 15 | Network idle |
| 4 | behaviors | 20 | Expanding content |
| 5 | validating | 3 | Checking response |
| 6 | screenshot | 10 | Taking screenshot |
| 7 | pdf | 10 | Generating PDF |
| 8 | html | 5 | Saving HTML |
| 9 | warc | 8 | Writing archive |
| 10 | learning | 2 | Updating model |

## Implementation Guide

### TypeScript (wake-n-blake, shoemaker)

```typescript
import { createConnection } from 'net';
import { createInterface } from 'readline';

class ProgressReporter {
  private socket: Socket | null = null;
  private rl: Interface | null = null;

  async connect(): Promise<void> {
    const socketPath = process.env.PROGRESS_SOCKET;
    if (!socketPath) return; // Standalone mode

    this.socket = createConnection(socketPath);

    // Listen for control commands
    this.rl = createInterface({ input: this.socket });
    this.rl.on('line', (line) => {
      const msg = JSON.parse(line);
      if (msg.type === 'control') {
        this.handleControl(msg);
      }
    });
  }

  send(message: ProgressMessage): void {
    if (this.socket) {
      this.socket.write(JSON.stringify(message) + '\n');
    }
  }

  private handleControl(msg: ControlMessage): void {
    switch (msg.command) {
      case 'pause':
        this.paused = true;
        this.sendAck('pause', 'accepted');
        break;
      case 'resume':
        this.paused = false;
        this.sendAck('resume', 'accepted');
        break;
      case 'cancel':
        this.cancelled = true;
        this.sendAck('cancel', 'accepted');
        break;
    }
  }
}
```

### Python (visual-buffet, national-treasure)

```python
import socket
import json
import os
from pathlib import Path
from threading import Thread

class ProgressReporter:
    def __init__(self):
        self.socket = None
        self.paused = False
        self.cancelled = False

    def connect(self) -> None:
        socket_path = os.environ.get('PROGRESS_SOCKET')
        if not socket_path:
            return  # Standalone mode

        self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.socket.connect(socket_path)

        # Start listener thread for control commands
        Thread(target=self._listen, daemon=True).start()

    def send(self, message: dict) -> None:
        if self.socket:
            self.socket.sendall((json.dumps(message) + '\n').encode())

    def _listen(self) -> None:
        buffer = ''
        while True:
            data = self.socket.recv(4096).decode()
            if not data:
                break
            buffer += data
            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                msg = json.loads(line)
                if msg.get('type') == 'control':
                    self._handle_control(msg)

    def _handle_control(self, msg: dict) -> None:
        cmd = msg.get('command')
        if cmd == 'pause':
            self.paused = True
            self._send_ack('pause', 'accepted')
        elif cmd == 'resume':
            self.paused = False
            self._send_ack('resume', 'accepted')
        elif cmd == 'cancel':
            self.cancelled = True
            self._send_ack('cancel', 'accepted')
```

## Standalone Mode

When `PROGRESS_SOCKET` is not set, apps run in standalone mode:
- Progress goes to stderr (human-readable format)
- No control commands available
- Exit code indicates success/failure

## Formatting Utilities

All apps SHOULD implement these formatters consistently:

### Duration

```
< 1 second    → "< 1s"
1-59 seconds  → "45s"
1-59 minutes  → "2m30s"
1+ hours      → "2h15m" (hide seconds)
```

### Throughput

```
Fast (> 1/s)  → "2.5 files/s"
Slow (< 1/s)  → "2.5s/file" or "1.5m/file"
```

### Bytes

```
< 1 KB    → "512 B"
< 1 MB    → "512 KB"
< 1 GB    → "512 MB"
≥ 1 GB    → "1.5 GB"
```

### ETA

```
No data       → "calculating..."
< 5 seconds   → "finishing..."
> 24 hours    → "unknown"
Otherwise     → formatted duration
```

## Error Codes

| Code | Severity | Description |
|------|----------|-------------|
| `FILE_NOT_FOUND` | warning | Source file missing |
| `PERMISSION_DENIED` | warning | Access denied |
| `CORRUPT_FILE` | warning | File corrupted |
| `HASH_MISMATCH` | error | Verification failed |
| `DISK_FULL` | fatal | No space left |
| `OUT_OF_MEMORY` | fatal | Memory exhausted |
| `NETWORK_ERROR` | warning | Network operation failed |
| `CANCELLED` | info | User cancelled |

Severity:
- `info`: Informational, no action needed
- `warning`: Item failed, continue processing
- `error`: Serious issue, may need attention
- `fatal`: Cannot continue, abort processing
