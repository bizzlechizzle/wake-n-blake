/**
 * Network path detection and utilities
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

// Network path patterns for auto-detection
const NETWORK_PATTERNS = [
  /^\/Volumes\//,             // macOS mounted volumes
  /^\/mnt\//,                 // Linux mounts
  /^\/media\//,               // Linux automounts
  /^\/run\/user\/.*\/gvfs/,   // GNOME virtual filesystem
  /^\/net\//,                 // BSD-style automounts
  /^\\\\/,                    // Windows UNC paths
  /^\/\/[^/]+\//              // SMB-style paths
];

/**
 * Check if a path is on a network mount
 */
export function isNetworkPath(filePath: string): boolean {
  const normalized = path.resolve(filePath);
  return NETWORK_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Get optimal buffer size based on path location
 */
export function getBufferSize(filePath: string): number {
  const LOCAL_BUFFER = 64 * 1024;      // 64KB
  const NETWORK_BUFFER = 1024 * 1024;  // 1MB

  return isNetworkPath(filePath) ? NETWORK_BUFFER : LOCAL_BUFFER;
}

/**
 * Get optimal concurrency based on path location
 */
export function getConcurrency(filePath: string): number {
  const cpuCount = os.cpus().length;
  const LOCAL_CONCURRENCY = Math.max(1, cpuCount - 1);
  const NETWORK_CONCURRENCY = 2;

  return isNetworkPath(filePath) ? NETWORK_CONCURRENCY : LOCAL_CONCURRENCY;
}

/**
 * Detect mount type for a path (Linux)
 */
export async function detectMountType(filePath: string): Promise<string | null> {
  if (os.platform() !== 'linux') return null;

  try {
    const mounts = await fs.readFile('/proc/mounts', 'utf-8');
    const normalized = path.resolve(filePath);

    // Find the mount point that best matches our path
    let bestMatch = { mountPoint: '', fsType: '' };

    for (const line of mounts.split('\n')) {
      const parts = line.split(' ');
      if (parts.length >= 3) {
        const mountPoint = parts[1];
        const fsType = parts[2];

        if (normalized.startsWith(mountPoint) && mountPoint.length > bestMatch.mountPoint.length) {
          bestMatch = { mountPoint, fsType };
        }
      }
    }

    return bestMatch.fsType || null;
  } catch {
    return null;
  }
}

/**
 * Check if path is on SMB/CIFS mount
 */
export async function isSmbPath(filePath: string): Promise<boolean> {
  const fsType = await detectMountType(filePath);
  return fsType === 'cifs' || fsType === 'smb' || fsType === 'smbfs';
}

/**
 * Check if path is on NFS mount
 */
export async function isNfsPath(filePath: string): Promise<boolean> {
  const fsType = await detectMountType(filePath);
  return fsType === 'nfs' || fsType === 'nfs4';
}

/**
 * Get network-aware I/O options for a path
 */
export function getIoOptions(filePath: string): {
  bufferSize: number;
  concurrency: number;
  isNetwork: boolean;
  retryEnabled: boolean;
  delayMs: number;
} {
  const isNetwork = isNetworkPath(filePath);

  return {
    bufferSize: isNetwork ? 1024 * 1024 : 64 * 1024,
    concurrency: isNetwork ? 2 : Math.max(1, os.cpus().length - 1),
    isNetwork,
    retryEnabled: isNetwork,
    delayMs: isNetwork ? 50 : 0
  };
}
