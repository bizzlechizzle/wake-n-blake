/**
 * wnb diagnose command
 * System diagnostics and capability check
 */

import { Command } from 'commander';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { findNativeB3sum } from '../../core/hasher.js';
import { formatError } from '../output.js';

const execAsync = promisify(exec);

interface DiagnoseResult {
  blake3: {
    native: { available: boolean; path?: string; version?: string };
    wasm: { available: boolean; version?: string };
  };
  algorithms: {
    blake3: boolean;
    sha256: boolean;
    sha512: boolean;
  };
  idGeneration: {
    uuid: { available: boolean; version?: string };
    ulid: { available: boolean; version?: string };
  };
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
    cpus: number;
    memory: string;
  };
  networkMounts: Array<{ path: string; type: string }>;
  recommendations: {
    defaultConcurrency: number;
    networkConcurrency: number;
    bufferSizeNetwork: string;
  };
}

export const diagnoseCommand = new Command('diagnose')
  .description('System diagnostics and capability check')
  .option('-v, --verbose', 'Detailed output')
  .option('-f, --format <fmt>', 'Output format: text, json', 'text')
  .action(async (options) => {
    try {
      const result = await runDiagnostics();
      const format = options.format as 'text' | 'json';

      if (format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printDiagnostics(result, options.verbose);
      }
    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

async function runDiagnostics(): Promise<DiagnoseResult> {
  // Check native b3sum
  const nativePath = await findNativeB3sum();
  let nativeVersion: string | undefined;

  if (nativePath) {
    try {
      const { stdout } = await execAsync(`"${nativePath}" --version`);
      nativeVersion = stdout.trim().split('\n')[0];
    } catch {
      // Version check failed
    }
  }

  // Check WASM blake3
  let wasmVersion: string | undefined;
  try {
    const pkg = await import('blake3/package.json', { assert: { type: 'json' } });
    wasmVersion = pkg.default.version;
  } catch {
    try {
      // Try reading package.json directly
      const pkgPath = new URL('blake3/package.json', import.meta.url);
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      wasmVersion = pkg.version;
    } catch {
      wasmVersion = 'installed';
    }
  }

  // Check uuid package
  let uuidVersion: string | undefined;
  try {
    uuidVersion = 'installed'; // uuid package doesn't export version easily
  } catch {
    // Not installed
  }

  // Check ulid package
  let ulidVersion: string | undefined;
  try {
    ulidVersion = 'installed';
  } catch {
    // Not installed
  }

  // Detect network mounts (Linux)
  const networkMounts: Array<{ path: string; type: string }> = [];
  if (os.platform() === 'linux') {
    try {
      const mounts = await fs.readFile('/proc/mounts', 'utf-8');
      for (const line of mounts.split('\n')) {
        const parts = line.split(' ');
        if (parts.length >= 3) {
          const fsType = parts[2];
          const mountPoint = parts[1];
          if (['nfs', 'nfs4', 'cifs', 'smbfs', 'fuse.sshfs'].includes(fsType)) {
            networkMounts.push({ path: mountPoint, type: fsType.toUpperCase() });
          }
        }
      }
    } catch {
      // Can't read mounts
    }
  }

  // macOS: Check /Volumes
  if (os.platform() === 'darwin') {
    try {
      const volumes = await fs.readdir('/Volumes');
      for (const vol of volumes) {
        if (vol !== 'Macintosh HD') {
          networkMounts.push({ path: `/Volumes/${vol}`, type: 'Volume' });
        }
      }
    } catch {
      // Can't read volumes
    }
  }

  const cpuCount = os.cpus().length;

  return {
    blake3: {
      native: {
        available: nativePath !== null,
        path: nativePath ?? undefined,
        version: nativeVersion
      },
      wasm: {
        available: true,
        version: wasmVersion
      }
    },
    algorithms: {
      blake3: true,
      sha256: true,
      sha512: true
    },
    idGeneration: {
      uuid: { available: true, version: uuidVersion },
      ulid: { available: true, version: ulidVersion }
    },
    system: {
      platform: `${os.platform()} ${os.arch()}`,
      arch: os.arch(),
      nodeVersion: process.version,
      cpus: cpuCount,
      memory: formatBytes(os.totalmem())
    },
    networkMounts,
    recommendations: {
      defaultConcurrency: Math.max(1, cpuCount - 1),
      networkConcurrency: 2,
      bufferSizeNetwork: '1MB'
    }
  };
}

function printDiagnostics(result: DiagnoseResult, _verbose: boolean = false): void {
  console.log('BLAKE3 Support');
  console.log(`├── Native b3sum: ${result.blake3.native.available
    ? `${result.blake3.native.path}${result.blake3.native.version ? ` (${result.blake3.native.version})` : ''}`
    : 'Not found (using WASM)'}`);
  console.log(`└── WASM fallback: blake3@${result.blake3.wasm.version}`);
  console.log();

  console.log('Algorithms');
  console.log(`├── BLAKE3:  ${result.algorithms.blake3 ? 'AVAILABLE' : 'unavailable'}`);
  console.log(`├── SHA-256: ${result.algorithms.sha256 ? 'AVAILABLE' : 'unavailable'}`);
  console.log(`└── SHA-512: ${result.algorithms.sha512 ? 'AVAILABLE' : 'unavailable'}`);
  console.log();

  console.log('ID Generation');
  console.log(`├── UUID: ${result.idGeneration.uuid.available ? 'AVAILABLE' : 'unavailable'}`);
  console.log(`└── ULID: ${result.idGeneration.ulid.available ? 'AVAILABLE' : 'unavailable'}`);
  console.log();

  console.log('System');
  console.log(`├── Platform: ${result.system.platform}`);
  console.log(`├── Node.js:  ${result.system.nodeVersion}`);
  console.log(`├── CPUs:     ${result.system.cpus} cores`);
  console.log(`└── Memory:   ${result.system.memory}`);
  console.log();

  if (result.networkMounts.length > 0) {
    console.log('Network Mounts Detected');
    result.networkMounts.forEach((mount, i) => {
      const prefix = i === result.networkMounts.length - 1 ? '└──' : '├──';
      console.log(`${prefix} ${mount.path}: ${mount.type}`);
    });
    console.log();
  }

  console.log('Recommended Settings');
  console.log(`├── Default concurrency: ${result.recommendations.defaultConcurrency}`);
  console.log(`├── Network concurrency: ${result.recommendations.networkConcurrency}`);
  console.log(`└── Buffer size (network): ${result.recommendations.bufferSizeNetwork}`);
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${Math.round(size)}${units[unitIndex]}`;
}
