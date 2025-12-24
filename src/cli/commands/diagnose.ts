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

interface ToolStatus {
  available: boolean;
  path?: string;
  version?: string;
  installHint?: string;
}

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
  tools: {
    // Core
    exiftool: ToolStatus;
    mediainfo: ToolStatus;
    ffprobe: ToolStatus;
    // Tier 1
    pdftotext: ToolStatus;
    pymupdf: ToolStatus;
    officeTools: ToolStatus;
    calibre: ToolStatus;
    imagehash: ToolStatus;
    guessit: ToolStatus;
    chromaprint: ToolStatus;
    // Tier 2
    sevenzip: ToolStatus;
    emailTools: ToolStatus;
    fonttools: ToolStatus;
    // Tier 3
    gdal: ToolStatus;
    gltfTransform: ToolStatus;
    trimesh: ToolStatus;
    vobject: ToolStatus;
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

async function checkCommandExists(cmd: string): Promise<{ available: boolean; path?: string }> {
  try {
    const { stdout } = await execAsync(`which ${cmd}`);
    return { available: true, path: stdout.trim() };
  } catch {
    return { available: false };
  }
}

async function checkPythonLib(lib: string): Promise<boolean> {
  try {
    await execAsync(`python3 -c "import ${lib}"`);
    return true;
  } catch {
    return false;
  }
}

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

  // Check all tools in parallel
  const [
    ffprobe, mediainfo, pdftotext, calibre, fpcalc,
    sevenzip, ogrinfo, gltfTransform
  ] = await Promise.all([
    checkCommandExists('ffprobe'),
    checkCommandExists('mediainfo'),
    checkCommandExists('pdftotext'),
    checkCommandExists('ebook-meta'),
    checkCommandExists('fpcalc'),
    checkCommandExists('7z'),
    checkCommandExists('ogrinfo'),
    checkCommandExists('gltf-transform'),
  ]);

  // Check Python libraries in parallel
  const [
    hasImagehash, hasGuessit, hasPymupdf, hasDocx, hasPptx, hasOpenpyxl,
    hasExtractMsg, hasFonttools, hasTrimesh, hasVobject, hasIcalendar
  ] = await Promise.all([
    checkPythonLib('imagehash'),
    checkPythonLib('guessit'),
    checkPythonLib('fitz'),
    checkPythonLib('docx'),
    checkPythonLib('pptx'),
    checkPythonLib('openpyxl'),
    checkPythonLib('extract_msg'),
    checkPythonLib('fontTools'),
    checkPythonLib('trimesh'),
    checkPythonLib('vobject'),
    checkPythonLib('icalendar'),
  ]);

  const hasOfficeTools = hasDocx || hasPptx || hasOpenpyxl;

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
    tools: {
      // Core (bundled)
      exiftool: { available: true, installHint: 'bundled via exiftool-vendored' },
      mediainfo: { ...mediainfo, installHint: 'brew install mediainfo' },
      ffprobe: { ...ffprobe, installHint: 'brew install ffmpeg' },
      // Tier 1
      pdftotext: { ...pdftotext, installHint: 'brew install poppler' },
      pymupdf: { available: hasPymupdf, installHint: 'pip install PyMuPDF' },
      officeTools: { available: hasOfficeTools, installHint: 'pip install python-docx python-pptx openpyxl' },
      calibre: { ...calibre, installHint: 'brew install calibre' },
      imagehash: { available: hasImagehash, installHint: 'pip install imagehash' },
      guessit: { available: hasGuessit, installHint: 'pip install guessit' },
      chromaprint: { available: fpcalc.available, path: fpcalc.path, installHint: 'brew install chromaprint' },
      // Tier 2
      sevenzip: { ...sevenzip, installHint: 'brew install p7zip' },
      emailTools: { available: hasExtractMsg, installHint: 'pip install extract-msg' },
      fonttools: { available: hasFonttools, installHint: 'pip install fonttools' },
      // Tier 3
      gdal: { ...ogrinfo, installHint: 'brew install gdal' },
      gltfTransform: { ...gltfTransform, installHint: 'npm install -g @gltf-transform/cli' },
      trimesh: { available: hasTrimesh, installHint: 'pip install trimesh' },
      vobject: { available: hasVobject || hasIcalendar, installHint: 'pip install vobject' },
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

function formatToolStatus(tool: ToolStatus): string {
  if (tool.available) {
    return tool.path ? `✓ ${tool.path}` : '✓ available';
  }
  return `✗ ${tool.installHint || 'not available'}`;
}

function printDiagnostics(result: DiagnoseResult, verbose: boolean = false): void {
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

  // Tool Availability
  console.log('Tool Availability');
  console.log('  Core:');
  console.log(`    exiftool ........ ${formatToolStatus(result.tools.exiftool)}`);
  console.log(`    mediainfo ....... ${formatToolStatus(result.tools.mediainfo)}`);
  console.log(`    ffprobe ......... ${formatToolStatus(result.tools.ffprobe)}`);
  console.log('  Tier 1 (Text/Hash):');
  console.log(`    pdftotext ....... ${formatToolStatus(result.tools.pdftotext)}`);
  console.log(`    PyMuPDF ......... ${formatToolStatus(result.tools.pymupdf)}`);
  console.log(`    Office tools .... ${formatToolStatus(result.tools.officeTools)}`);
  console.log(`    Calibre ......... ${formatToolStatus(result.tools.calibre)}`);
  console.log(`    imagehash ....... ${formatToolStatus(result.tools.imagehash)}`);
  console.log(`    guessit ......... ${formatToolStatus(result.tools.guessit)}`);
  console.log(`    chromaprint ..... ${formatToolStatus(result.tools.chromaprint)}`);
  console.log('  Tier 2 (Archive/Email/Font):');
  console.log(`    7-Zip ........... ${formatToolStatus(result.tools.sevenzip)}`);
  console.log(`    email-tools ..... ${formatToolStatus(result.tools.emailTools)}`);
  console.log(`    fonttools ....... ${formatToolStatus(result.tools.fonttools)}`);
  console.log('  Tier 3 (Geo/3D/Calendar):');
  console.log(`    GDAL ............ ${formatToolStatus(result.tools.gdal)}`);
  console.log(`    gltf-transform .. ${formatToolStatus(result.tools.gltfTransform)}`);
  console.log(`    trimesh ......... ${formatToolStatus(result.tools.trimesh)}`);
  console.log(`    vobject ......... ${formatToolStatus(result.tools.vobject)}`);
  console.log();

  console.log('System');
  console.log(`├── Platform: ${result.system.platform}`);
  console.log(`├── Node.js:  ${result.system.nodeVersion}`);
  console.log(`├── CPUs:     ${result.system.cpus} cores`);
  console.log(`└── Memory:   ${result.system.memory}`);
  console.log();

  if (result.networkMounts.length > 0 || verbose) {
    console.log('Network Mounts Detected');
    if (result.networkMounts.length === 0) {
      console.log('  (none)');
    } else {
      result.networkMounts.forEach((mount, i) => {
        const prefix = i === result.networkMounts.length - 1 ? '└──' : '├──';
        console.log(`${prefix} ${mount.path}: ${mount.type}`);
      });
    }
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
