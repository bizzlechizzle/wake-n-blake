/**
 * Configuration management
 * Environment variables and config file support
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { getDefaultConcurrency, NETWORK_CONCURRENCY, LOCAL_BUFFER_SIZE, NETWORK_BUFFER_SIZE, RETRY_CONFIG } from './constants.js';

export interface WnbConfig {
  // BLAKE3 options
  nativeB3sum?: string;       // Path to native b3sum
  forceWasm?: boolean;        // Skip native detection
  forceNative?: boolean;      // Fail if native not available

  // Concurrency
  concurrency?: number;       // Default parallel workers
  networkConcurrency?: number; // Workers for network ops

  // Buffer sizes
  bufferSize?: number;        // Default buffer size
  networkBufferSize?: number; // Buffer for network I/O

  // Retry
  retryCount?: number;        // Network retry attempts
  networkDelayMs?: number;    // Delay between network ops

  // Output
  defaultFormat?: 'text' | 'json' | 'csv' | 'bsd' | 'sfv';
  defaultAlgorithm?: 'blake3' | 'blake3-full' | 'sha256' | 'sha512';
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'wnb');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Environment variable mapping
const ENV_VARS: Record<string, keyof WnbConfig> = {
  'WNB_NATIVE_B3SUM': 'nativeB3sum',
  'WNB_FORCE_WASM': 'forceWasm',
  'WNB_FORCE_NATIVE': 'forceNative',
  'WNB_CONCURRENCY': 'concurrency',
  'WNB_NETWORK_CONCURRENCY': 'networkConcurrency',
  'WNB_BUFFER_SIZE': 'bufferSize',
  'WNB_NETWORK_BUFFER_SIZE': 'networkBufferSize',
  'WNB_RETRY_COUNT': 'retryCount',
  'WNB_NETWORK_DELAY': 'networkDelayMs',
  'WNB_FORMAT': 'defaultFormat',
  'WNB_ALGORITHM': 'defaultAlgorithm',
};

// Default configuration
const DEFAULT_CONFIG: Required<WnbConfig> = {
  nativeB3sum: '',
  forceWasm: false,
  forceNative: false,
  concurrency: getDefaultConcurrency(),
  networkConcurrency: NETWORK_CONCURRENCY,
  bufferSize: LOCAL_BUFFER_SIZE,
  networkBufferSize: NETWORK_BUFFER_SIZE,
  retryCount: RETRY_CONFIG.attempts,
  networkDelayMs: RETRY_CONFIG.networkDelayMs,
  defaultFormat: 'text',
  defaultAlgorithm: 'blake3',
};

let cachedConfig: WnbConfig | null = null;

/**
 * Load configuration from file and environment
 */
export async function loadConfig(): Promise<WnbConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Start with defaults
  const config: WnbConfig = { ...DEFAULT_CONFIG };

  // Load from config file
  try {
    const fileContent = await fs.readFile(CONFIG_FILE, 'utf-8');
    const fileConfig = JSON.parse(fileContent);
    Object.assign(config, fileConfig);
  } catch {
    // No config file, that's fine
  }

  // Override with environment variables
  for (const [envVar, configKey] of Object.entries(ENV_VARS)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      // Parse based on expected type
      if (configKey === 'forceWasm' || configKey === 'forceNative') {
        config[configKey] = value === 'true' || value === '1';
      } else if (
        configKey === 'concurrency' ||
        configKey === 'networkConcurrency' ||
        configKey === 'bufferSize' ||
        configKey === 'networkBufferSize' ||
        configKey === 'retryCount' ||
        configKey === 'networkDelayMs'
      ) {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) {
          config[configKey] = parsed;
        }
      } else if (configKey === 'nativeB3sum') {
        config[configKey] = value;
      } else if (configKey === 'defaultFormat') {
        config[configKey] = value as WnbConfig['defaultFormat'];
      } else if (configKey === 'defaultAlgorithm') {
        config[configKey] = value as WnbConfig['defaultAlgorithm'];
      }
    }
  }

  cachedConfig = config;
  return config;
}

/**
 * Get a specific config value
 */
export async function getConfigValue<K extends keyof WnbConfig>(key: K): Promise<WnbConfig[K]> {
  const config = await loadConfig();
  return config[key] ?? DEFAULT_CONFIG[key];
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: Partial<WnbConfig>): Promise<void> {
  // Ensure config directory exists
  await fs.mkdir(CONFIG_DIR, { recursive: true });

  // Load existing config and merge
  let existing: WnbConfig = {};
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    existing = JSON.parse(content);
  } catch {
    // No existing config
  }

  const merged = { ...existing, ...config };
  await fs.writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2));

  // Clear cache
  cachedConfig = null;
}

/**
 * Reset config cache (for testing)
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}

/**
 * Get resolved concurrency based on config and options
 */
export async function getEffectiveConcurrency(options: {
  parallel?: number;
  hdd?: boolean;
  isNetwork?: boolean;
}): Promise<number> {
  const config = await loadConfig();

  // HDD mode = sequential
  if (options.hdd) {
    return 1;
  }

  // Explicit parallel option
  if (options.parallel !== undefined) {
    return options.parallel;
  }

  // Network paths use network concurrency
  if (options.isNetwork) {
    return config.networkConcurrency ?? NETWORK_CONCURRENCY;
  }

  // Default concurrency
  return config.concurrency ?? getDefaultConcurrency();
}

/**
 * Get buffer size based on path type
 */
export async function getEffectiveBufferSize(isNetwork: boolean): Promise<number> {
  const config = await loadConfig();

  if (isNetwork) {
    return config.networkBufferSize ?? NETWORK_BUFFER_SIZE;
  }

  return config.bufferSize ?? LOCAL_BUFFER_SIZE;
}
