/**
 * Device Detection Service
 *
 * Platform-agnostic interface for detecting source devices
 * during file import for chain of custody tracking.
 */

import type { PlatformDeviceDetector, DeviceDetectionResult, MountedVolume, DeviceChain } from './types.js';
import type { ImportSourceDevice, SourceType } from '../xmp/schema.js';

// Re-export types
export * from './types.js';

/**
 * Get platform-specific detector
 */
async function getPlatformDetector(): Promise<PlatformDeviceDetector> {
  switch (process.platform) {
    case 'darwin': {
      const { createMacOSDetector } = await import('./macos.js');
      return createMacOSDetector();
    }
    case 'linux': {
      const { createLinuxDetector } = await import('./linux.js');
      return createLinuxDetector();
    }
    case 'win32': {
      const { createWindowsDetector } = await import('./windows.js');
      return createWindowsDetector();
    }
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

// Singleton detector instance
let detectorInstance: PlatformDeviceDetector | undefined;

/**
 * Get or create detector instance
 */
async function getDetector(): Promise<PlatformDeviceDetector> {
  if (!detectorInstance) {
    detectorInstance = await getPlatformDetector();
  }
  return detectorInstance;
}

/**
 * Detect source device for a file path
 */
export async function detectSourceDevice(filePath: string): Promise<DeviceDetectionResult> {
  const detector = await getDetector();
  return detector.detectSourceDevice(filePath);
}

/**
 * Get all mounted removable volumes
 */
export async function getRemovableVolumes(): Promise<MountedVolume[]> {
  const detector = await getDetector();
  return detector.getRemovableVolumes();
}

/**
 * Get device chain for a volume path
 */
export async function getDeviceChain(volumePath: string): Promise<DeviceChain | undefined> {
  const detector = await getDetector();
  return detector.getDeviceChain(volumePath);
}

/**
 * Check if a path is on removable media
 */
export async function isRemovableMedia(filePath: string): Promise<boolean> {
  const detector = await getDetector();
  return detector.isRemovableMedia(filePath);
}

/**
 * Determine source type from device chain
 */
export function getSourceType(chain: DeviceChain | undefined): SourceType {
  if (!chain) return 'unknown';

  if (chain.volume.isNetwork) return 'network_share';

  if (chain.isCameraDirect) return 'camera_direct';
  if (chain.isPhoneDirect) return 'phone_direct';
  if (chain.isMemoryCard) return 'memory_card';

  if (chain.volume.isRemovable || chain.volume.isExternal) {
    // Check for cloud sync folders
    const mountLC = chain.volume.mountPoint.toLowerCase();
    if (mountLC.includes('dropbox') || mountLC.includes('google drive') ||
        mountLC.includes('onedrive') || mountLC.includes('icloud')) {
      return 'cloud_sync';
    }
    return 'local_disk';
  }

  return 'local_disk';
}

/**
 * Get volume serial for a path
 */
export async function getVolumeSerial(filePath: string): Promise<string | undefined> {
  const detector = await getDetector();
  const chain = await detector.getDeviceChain(filePath);
  return chain?.media?.serial || chain?.volume.volumeUUID;
}

/**
 * Format device info for display
 */
export function formatDeviceInfo(device: ImportSourceDevice): string {
  const parts: string[] = [];

  if (device.cardReader) {
    parts.push(`Card Reader: ${device.cardReader.vendor} ${device.cardReader.model}`);
    if (device.cardReader.serial) {
      parts.push(`  Serial: ${device.cardReader.serial}`);
    }
  }

  if (device.usb) {
    parts.push(`USB: ${device.usb.deviceName}`);
    parts.push(`  VID:PID: ${device.usb.vendorId}:${device.usb.productId}`);
    if (device.usb.serial) {
      parts.push(`  Serial: ${device.usb.serial}`);
    }
  }

  if (device.media) {
    parts.push(`Media: ${(device.media.type || 'unknown').toUpperCase()}`);
    if (device.media.manufacturer) {
      parts.push(`  Manufacturer: ${device.media.manufacturer}`);
    }
    if (device.media.serial) {
      parts.push(`  Serial: ${device.media.serial}`);
    }
    if (device.media.capacity) {
      const gb = device.media.capacity / (1024 * 1024 * 1024);
      parts.push(`  Capacity: ${gb.toFixed(1)} GB`);
    }
  }

  if (device.cameraBodySerial) {
    parts.push(`Camera Body: ${device.cameraBodySerial}`);
  }

  if (device.tetheredConnection) {
    parts.push(`Connection: ${device.tetheredConnection}`);
  }

  return parts.join('\n');
}

/**
 * Create device fingerprint string for matching
 */
export function createDeviceFingerprint(device: ImportSourceDevice): string {
  const parts: string[] = [];

  if (device.usb?.vendorId && device.usb?.productId) {
    parts.push(`usb:${device.usb.vendorId}:${device.usb.productId}`);
  }

  if (device.usb?.serial) {
    parts.push(`usb-sn:${device.usb.serial}`);
  }

  if (device.cardReader?.serial) {
    parts.push(`reader-sn:${device.cardReader.serial}`);
  }

  if (device.media?.serial) {
    parts.push(`media-sn:${device.media.serial}`);
  }

  if (device.cameraBodySerial) {
    parts.push(`camera:${device.cameraBodySerial}`);
  }

  return parts.join('|') || 'unknown';
}
