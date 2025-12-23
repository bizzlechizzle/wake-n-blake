/**
 * Shared Device Registry
 *
 * Cross-application registry for:
 * - Camera signatures (9,766+ cameras)
 * - File extension types
 * - USB device patterns
 * - SD card folder structures
 *
 * Location: ~/.config/blake/ (shared across all blake apps)
 *
 * Data sources:
 * 1. Canonical database (bundled, read-only)
 * 2. User additions (~/.config/blake/user-*.json)
 * 3. Community sync (optional GitHub repo)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// =============================================================================
// PATHS
// =============================================================================

/** Get the shared config directory */
export function getSharedConfigDir(): string {
  const home = os.homedir();

  // Platform-specific locations
  switch (process.platform) {
    case 'darwin':
      return path.join(home, '.config', 'blake');
    case 'win32':
      return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'blake');
    default:
      return path.join(home, '.config', 'blake');
  }
}

/** Ensure config directory exists */
export function ensureConfigDir(): string {
  const dir = getSharedConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// =============================================================================
// REGISTRY PATHS
// =============================================================================

export const REGISTRY_PATHS = {
  // Camera signatures
  canonicalCameras: () => path.join(getSharedConfigDir(), 'camera-signatures', 'canonical.json'),
  userCameras: () => path.join(getSharedConfigDir(), 'camera-signatures', 'user-cameras.json'),
  communityCameras: () => path.join(getSharedConfigDir(), 'camera-signatures', 'community-cameras.json'),

  // File types
  extensionTypes: () => path.join(getSharedConfigDir(), 'extension-types.json'),

  // Device patterns
  deviceProfiles: () => path.join(getSharedConfigDir(), 'device-profiles.json'),
  usbPatterns: () => path.join(getSharedConfigDir(), 'usb-patterns.json'),

  // Sync state
  syncState: () => path.join(getSharedConfigDir(), 'sync-state.json'),
};

// =============================================================================
// REGISTRY VERSION
// =============================================================================

export interface RegistryVersion {
  canonical: string;      // e.g., "1.0.0"
  user: number;           // Timestamp of last user edit
  community?: string;     // Git commit hash
  lastSync?: string;      // ISO timestamp
}

/** Get current registry version */
export function getRegistryVersion(): RegistryVersion {
  const syncPath = REGISTRY_PATHS.syncState();
  try {
    if (fs.existsSync(syncPath)) {
      return JSON.parse(fs.readFileSync(syncPath, 'utf8'));
    }
  } catch {
    // Ignore
  }

  return {
    canonical: '0.0.0',
    user: 0,
  };
}

// =============================================================================
// GITHUB SYNC (OPTIONAL)
// =============================================================================

export interface GitHubSyncConfig {
  enabled: boolean;
  repo: string;           // e.g., "username/camera-signatures"
  branch: string;         // e.g., "main"
  autoSync: boolean;      // Sync on app launch
  syncInterval?: number;  // Hours between syncs
}

const DEFAULT_SYNC_CONFIG: GitHubSyncConfig = {
  enabled: false,
  repo: '',
  branch: 'main',
  autoSync: false,
};

/** Get GitHub sync configuration */
export function getSyncConfig(): GitHubSyncConfig {
  const configPath = path.join(getSharedConfigDir(), 'sync-config.json');
  try {
    if (fs.existsSync(configPath)) {
      return { ...DEFAULT_SYNC_CONFIG, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    }
  } catch {
    // Ignore
  }
  return DEFAULT_SYNC_CONFIG;
}

/** Save GitHub sync configuration */
export function saveSyncConfig(config: Partial<GitHubSyncConfig>): void {
  const configPath = path.join(getSharedConfigDir(), 'sync-config.json');
  const current = getSyncConfig();
  const updated = { ...current, ...config };

  ensureConfigDir();
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
}

// =============================================================================
// DATA LOADERS
// =============================================================================

export interface LoadResult<T> {
  data: T[];
  source: 'canonical' | 'user' | 'community' | 'bundled';
  count: number;
  loadedAt: string;
}

/** Load camera signatures from all sources */
export async function loadAllCameras(): Promise<{
  canonical: LoadResult<unknown>;
  user: LoadResult<unknown>;
  community: LoadResult<unknown> | null;
  total: number;
}> {
  const results = {
    canonical: await loadJson(REGISTRY_PATHS.canonicalCameras(), 'canonical'),
    user: await loadJson(REGISTRY_PATHS.userCameras(), 'user'),
    community: null as LoadResult<unknown> | null,
    total: 0,
  };

  // Try community if enabled
  const syncConfig = getSyncConfig();
  if (syncConfig.enabled) {
    results.community = await loadJson(REGISTRY_PATHS.communityCameras(), 'community');
  }

  results.total =
    results.canonical.count +
    results.user.count +
    (results.community?.count || 0);

  return results;
}

async function loadJson(filePath: string, source: LoadResult<unknown>['source']): Promise<LoadResult<unknown>> {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);

      // Handle both array format and {cameras: [...]} format
      const data = Array.isArray(parsed)
        ? parsed
        : parsed.cameras || [];

      return {
        data,
        source,
        count: data.length,
        loadedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn(`Failed to load ${source} data from ${filePath}:`, err);
  }

  return {
    data: [],
    source,
    count: 0,
    loadedAt: new Date().toISOString(),
  };
}

// =============================================================================
// BUNDLED DATA INSTALLATION
// =============================================================================

/**
 * Install bundled canonical data to shared config
 * Call this from app installation/first-run
 */
export async function installBundledData(bundledPath: string): Promise<void> {
  const configDir = ensureConfigDir();
  const camerasDir = path.join(configDir, 'camera-signatures');

  if (!fs.existsSync(camerasDir)) {
    fs.mkdirSync(camerasDir, { recursive: true });
  }

  const targetPath = REGISTRY_PATHS.canonicalCameras();

  // Only install if not exists or bundled is newer
  if (!fs.existsSync(targetPath)) {
    if (fs.existsSync(bundledPath)) {
      fs.copyFileSync(bundledPath, targetPath);
      console.log(`Installed bundled camera signatures to ${targetPath}`);
    }
  }
}

// =============================================================================
// USER DATA MANAGEMENT
// =============================================================================

/** Add a user-defined camera */
export function addUserCamera(camera: unknown): void {
  const userPath = REGISTRY_PATHS.userCameras();
  const dir = path.dirname(userPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let cameras: unknown[] = [];
  try {
    if (fs.existsSync(userPath)) {
      cameras = JSON.parse(fs.readFileSync(userPath, 'utf8'));
    }
  } catch {
    cameras = [];
  }

  cameras.push(camera);
  fs.writeFileSync(userPath, JSON.stringify(cameras, null, 2));

  // Update sync state
  updateSyncState({ user: Date.now() });
}

/** Remove a user-defined camera by ID */
export function removeUserCamera(id: string): boolean {
  const userPath = REGISTRY_PATHS.userCameras();

  try {
    if (fs.existsSync(userPath)) {
      const cameras = JSON.parse(fs.readFileSync(userPath, 'utf8')) as Array<{ id?: string }>;
      const filtered = cameras.filter(c => c.id !== id);

      if (filtered.length !== cameras.length) {
        fs.writeFileSync(userPath, JSON.stringify(filtered, null, 2));
        updateSyncState({ user: Date.now() });
        return true;
      }
    }
  } catch (err) {
    console.error('Failed to remove user camera:', err);
  }

  return false;
}

function updateSyncState(update: Partial<RegistryVersion>): void {
  const syncPath = REGISTRY_PATHS.syncState();
  const current = getRegistryVersion();
  const updated = { ...current, ...update };

  ensureConfigDir();
  fs.writeFileSync(syncPath, JSON.stringify(updated, null, 2));
}

// =============================================================================
// EXPORT FOR CLI
// =============================================================================

/** Export user cameras for sharing */
export function exportUserCameras(): string {
  const userPath = REGISTRY_PATHS.userCameras();

  if (fs.existsSync(userPath)) {
    return fs.readFileSync(userPath, 'utf8');
  }

  return '[]';
}

/** Import cameras from external source */
export function importCameras(json: string, merge = true): number {
  const userPath = REGISTRY_PATHS.userCameras();
  const dir = path.dirname(userPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const incoming = JSON.parse(json) as unknown[];

  if (merge) {
    let existing: unknown[] = [];
    try {
      if (fs.existsSync(userPath)) {
        existing = JSON.parse(fs.readFileSync(userPath, 'utf8'));
      }
    } catch {
      existing = [];
    }

    // Dedupe by ID
    const existingIds = new Set((existing as Array<{ id?: string }>).map(c => c.id));
    const newCameras = (incoming as Array<{ id?: string }>).filter(c => !existingIds.has(c.id));

    const merged = [...existing, ...newCameras];
    fs.writeFileSync(userPath, JSON.stringify(merged, null, 2));
    updateSyncState({ user: Date.now() });

    return newCameras.length;
  } else {
    fs.writeFileSync(userPath, JSON.stringify(incoming, null, 2));
    updateSyncState({ user: Date.now() });
    return incoming.length;
  }
}

// =============================================================================
// INFO
// =============================================================================

/** Get registry info for display */
export function getRegistryInfo(): {
  configDir: string;
  version: RegistryVersion;
  syncConfig: GitHubSyncConfig;
  paths: Record<string, string>;
  sizes: Record<string, number>;
} {
  const configDir = getSharedConfigDir();
  const paths = {
    canonical: REGISTRY_PATHS.canonicalCameras(),
    user: REGISTRY_PATHS.userCameras(),
    community: REGISTRY_PATHS.communityCameras(),
    extensions: REGISTRY_PATHS.extensionTypes(),
  };

  const sizes: Record<string, number> = {};
  for (const [key, p] of Object.entries(paths)) {
    try {
      if (fs.existsSync(p)) {
        sizes[key] = fs.statSync(p).size;
      } else {
        sizes[key] = 0;
      }
    } catch {
      sizes[key] = 0;
    }
  }

  return {
    configDir,
    version: getRegistryVersion(),
    syncConfig: getSyncConfig(),
    paths,
    sizes,
  };
}
