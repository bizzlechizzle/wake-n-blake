/**
 * Device Detection Types
 *
 * Common types for source device identification across platforms.
 */

import type { ImportSourceDevice, MediaType } from '../xmp/schema.js';

/**
 * USB device information (from system)
 */
export interface DetectedUSBDevice {
  vendorId: string;
  productId: string;
  serial?: string;
  devicePath: string;
  deviceName: string;
  busLocation?: string;
  manufacturer?: string;
  speed?: string;
}

/**
 * Card reader information
 */
export interface DetectedCardReader {
  vendor: string;
  model: string;
  serial?: string;
  port: string;
  protocol?: string;
  slots?: number;
}

/**
 * Physical media information
 */
export interface DetectedMedia {
  type: MediaType;
  serial?: string;
  manufacturer?: string;
  model?: string;
  capacity: number;
  firmware?: string;
  volumeName?: string;
  volumeUUID?: string;
  filesystemType?: string;
}

/**
 * Volume mount information
 */
export interface MountedVolume {
  path: string;
  device: string;
  volumeName: string;
  volumeUUID?: string;
  filesystemType: string;
  mountPoint: string;
  isRemovable: boolean;
  isExternal: boolean;
  isNetwork: boolean;
  totalSize: number;
  freeSpace: number;
}

/**
 * Complete device chain for a mounted volume
 */
export interface DeviceChain {
  volume: MountedVolume;
  usb?: DetectedUSBDevice;
  cardReader?: DetectedCardReader;
  media?: DetectedMedia;
  isMemoryCard: boolean;
  isCameraDirect: boolean;
  isPhoneDirect: boolean;
  connectionType?: 'usb' | 'thunderbolt' | 'firewire' | 'pcie' | 'sata' | 'network';
}

/**
 * Detection result
 */
export interface DeviceDetectionResult {
  found: boolean;
  device?: ImportSourceDevice;
  chain?: DeviceChain;
  errors: string[];
  warnings: string[];
}

/**
 * Platform-specific detector interface
 */
export interface PlatformDeviceDetector {
  /**
   * Get all mounted removable volumes
   */
  getRemovableVolumes(): Promise<MountedVolume[]>;

  /**
   * Get device chain for a specific path
   */
  getDeviceChain(volumePath: string): Promise<DeviceChain | undefined>;

  /**
   * Detect source device for a file path
   */
  detectSourceDevice(filePath: string): Promise<DeviceDetectionResult>;

  /**
   * Get all connected USB devices
   */
  getUSBDevices(): Promise<DetectedUSBDevice[]>;

  /**
   * Check if path is on removable media
   */
  isRemovableMedia(path: string): Promise<boolean>;
}

/**
 * Known card reader vendors (for identification)
 */
export const CARD_READER_VENDORS = new Set([
  'SanDisk',
  'Kingston',
  'Lexar',
  'Transcend',
  'Sony',
  'ProGrade',
  'Delkin',
  'Sabrent',
  'Anker',
  'UGREEN',
  'Cable Matters',
  'Unitek',
  'Verbatim',
  'Hama',
  'Hoodman',
  'Blackmagic',
  'Atomos',
]);

/**
 * Known camera manufacturers (for tethered detection)
 */
export const CAMERA_MANUFACTURERS = new Set([
  'Canon',
  'Nikon',
  'Sony',
  'Fujifilm',
  'Panasonic',
  'Olympus',
  'Pentax',
  'Leica',
  'Hasselblad',
  'Phase One',
  'GoPro',
  'DJI',
  'Blackmagic',
  'RED',
  'ARRI',
]);

/**
 * Known phone manufacturers
 */
export const PHONE_MANUFACTURERS = new Set([
  'Apple',
  'Samsung',
  'Google',
  'OnePlus',
  'Xiaomi',
  'Huawei',
  'OPPO',
  'Vivo',
  'Motorola',
  'LG',
  'Sony',
  'Nokia',
  'Pixel',
]);

/**
 * Determine media type from capacity and other factors
 */
export function inferMediaType(
  capacity: number,
  deviceName?: string,
  manufacturer?: string
): MediaType {
  const nameLC = (deviceName || '').toLowerCase();
  const mfrLC = (manufacturer || '').toLowerCase();

  // Check for NVMe/SSD indicators
  if (nameLC.includes('nvme') || nameLC.includes('pcie')) return 'nvme';
  if (nameLC.includes('ssd') || nameLC.includes('solid state')) return 'ssd';
  if (nameLC.includes('hdd') || nameLC.includes('hard drive')) return 'hdd';

  // Check for CFexpress (typically 128GB+, specific manufacturers)
  if (nameLC.includes('cfexpress') || nameLC.includes('cfx')) return 'cfexpress';

  // Check for CF
  if (nameLC.includes('compactflash') || nameLC.includes(' cf ')) return 'cf';

  // Infer from capacity (rough heuristics)
  const gb = capacity / (1024 * 1024 * 1024);

  // Very small = likely SD
  if (gb <= 512) return 'sd';

  // Medium = could be SSD
  if (gb <= 4096) return 'ssd';

  // Large = HDD
  return 'hdd';
}

/**
 * Clean up device serial for display
 */
export function normalizeSerial(serial: string | undefined): string | undefined {
  if (!serial) return undefined;
  // Remove common placeholder values
  if (['0', '000000000000', 'na', 'n/a', 'none', 'unknown'].includes(serial.toLowerCase())) {
    return undefined;
  }
  return serial.trim();
}
