/**
 * macOS Device Detection
 *
 * Uses ioreg, diskutil, and system_profiler to detect USB devices,
 * card readers, and physical media.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type {
  PlatformDeviceDetector,
  DetectedUSBDevice,
  DetectedCardReader,
  DetectedMedia,
  MountedVolume,
  DeviceChain,
  DeviceDetectionResult,
} from './types.js';
import {
  CARD_READER_VENDORS,
  CAMERA_MANUFACTURERS,
  PHONE_MANUFACTURERS,
  inferMediaType,
  normalizeSerial,
} from './types.js';
import type { ImportSourceDevice } from '../xmp/schema.js';

const execAsync = promisify(exec);

/**
 * macOS Device Detector implementation
 */
export class MacOSDeviceDetector implements PlatformDeviceDetector {
  private volumeCache = new Map<string, DeviceChain>();
  private cacheTime = 0;
  private readonly CACHE_TTL = 5000; // 5 seconds

  /**
   * Get all mounted removable/external volumes
   */
  async getRemovableVolumes(): Promise<MountedVolume[]> {
    const volumes: MountedVolume[] = [];

    try {
      // Use diskutil list to get all disks
      const { stdout } = await execAsync('diskutil list -plist external physical');
      const disks = this.parsePlist(stdout);

      for (const diskId of disks.AllDisksAndPartitions || []) {
        if (diskId.Partitions) {
          for (const part of diskId.Partitions) {
            if (part.MountPoint) {
              const volume = await this.getVolumeInfo(part.MountPoint);
              if (volume) volumes.push(volume);
            }
          }
        }
      }
    } catch {
      // Fallback: scan /Volumes
      try {
        const entries = await fs.readdir('/Volumes');
        for (const entry of entries) {
          const mountPoint = `/Volumes/${entry}`;
          const volume = await this.getVolumeInfo(mountPoint);
          if (volume && (volume.isRemovable || volume.isExternal)) {
            volumes.push(volume);
          }
        }
      } catch {
        // No volumes accessible
      }
    }

    return volumes;
  }

  /**
   * Get volume information for a mount point
   */
  async getVolumeInfo(mountPoint: string): Promise<MountedVolume | undefined> {
    try {
      const { stdout } = await execAsync(`diskutil info -plist "${mountPoint}"`);
      const info = this.parsePlist(stdout);

      if (!info.MountPoint) return undefined;

      const isRemovable = info.RemovableMedia === true ||
        info.RemovableMediaOrExternalDevice === true;
      const isExternal = info.Internal === false;
      const isNetwork = info.Protocol === 'AFP' ||
        info.Protocol === 'SMB' ||
        info.Protocol === 'NFS';

      return {
        path: info.DeviceNode || '',
        device: info.DeviceIdentifier || '',
        volumeName: info.VolumeName || path.basename(mountPoint),
        volumeUUID: info.VolumeUUID,
        filesystemType: info.FilesystemType || 'unknown',
        mountPoint: info.MountPoint,
        isRemovable,
        isExternal,
        isNetwork,
        totalSize: info.TotalSize || 0,
        freeSpace: info.FreeSpace || 0,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Get device chain for a volume path
   */
  async getDeviceChain(volumePath: string): Promise<DeviceChain | undefined> {
    // Check cache
    const now = Date.now();
    if (now - this.cacheTime < this.CACHE_TTL && this.volumeCache.has(volumePath)) {
      return this.volumeCache.get(volumePath);
    }

    const volume = await this.getVolumeInfo(volumePath);
    if (!volume) return undefined;

    const chain: DeviceChain = {
      volume,
      isMemoryCard: false,
      isCameraDirect: false,
      isPhoneDirect: false,
    };

    // Get USB device info using ioreg
    const usbInfo = await this.getUSBDeviceForVolume(volume.device);
    if (usbInfo) {
      chain.usb = usbInfo;
      chain.connectionType = 'usb';

      // Determine device type
      const nameLC = (usbInfo.deviceName || '').toLowerCase();
      const mfrLC = (usbInfo.manufacturer || '').toLowerCase();

      // Check if it's a card reader
      const isCardReader = CARD_READER_VENDORS.has(usbInfo.manufacturer || '') ||
        nameLC.includes('card reader') ||
        nameLC.includes('sd reader') ||
        nameLC.includes('cf reader') ||
        nameLC.includes('multi-card');

      if (isCardReader) {
        chain.cardReader = {
          vendor: usbInfo.manufacturer || 'Unknown',
          model: usbInfo.deviceName,
          serial: normalizeSerial(usbInfo.serial),
          port: usbInfo.busLocation || '',
        };
        chain.isMemoryCard = true;
      }

      // Check if it's a camera
      const isCamera = CAMERA_MANUFACTURERS.has(usbInfo.manufacturer || '') &&
        (nameLC.includes('camera') ||
          nameLC.includes('dslr') ||
          nameLC.includes('ptp') ||
          nameLC.includes('mtp'));

      if (isCamera) {
        chain.isCameraDirect = true;
      }

      // Check if it's a phone
      const isPhone = PHONE_MANUFACTURERS.has(usbInfo.manufacturer || '') ||
        nameLC.includes('iphone') ||
        nameLC.includes('ipad') ||
        nameLC.includes('android') ||
        nameLC.includes('pixel');

      if (isPhone) {
        chain.isPhoneDirect = true;
      }
    }

    // Get media info
    chain.media = await this.getMediaInfo(volume);

    // Cache result
    this.volumeCache.set(volumePath, chain);
    this.cacheTime = now;

    return chain;
  }

  /**
   * Detect source device for a file path
   */
  async detectSourceDevice(filePath: string): Promise<DeviceDetectionResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get the mount point for this file
      const mountPoint = await this.getMountPoint(filePath);
      if (!mountPoint) {
        return { found: false, errors: ['Could not determine mount point'], warnings };
      }

      const chain = await this.getDeviceChain(mountPoint);
      if (!chain) {
        return { found: false, errors: ['Could not detect device chain'], warnings };
      }

      // Convert to ImportSourceDevice
      const device = this.chainToSourceDevice(chain);

      return {
        found: true,
        device,
        chain,
        errors,
        warnings,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { found: false, errors: [msg], warnings };
    }
  }

  /**
   * Get all connected USB devices
   */
  async getUSBDevices(): Promise<DetectedUSBDevice[]> {
    const devices: DetectedUSBDevice[] = [];

    try {
      const { stdout } = await execAsync('system_profiler SPUSBDataType -json');
      const data = JSON.parse(stdout);

      const extractDevices = (items: any[], parent?: any) => {
        for (const item of items || []) {
          if (item.vendor_id && item.product_id) {
            devices.push({
              vendorId: this.formatHexId(item.vendor_id),
              productId: this.formatHexId(item.product_id),
              serial: normalizeSerial(item.serial_num),
              devicePath: item._name || '',
              deviceName: item._name || 'Unknown',
              busLocation: item.location_id,
              manufacturer: item.manufacturer,
              speed: item.device_speed,
            });
          }

          // Recurse into child items
          if (item._items) {
            extractDevices(item._items, item);
          }
        }
      };

      if (data.SPUSBDataType) {
        for (const bus of data.SPUSBDataType) {
          extractDevices(bus._items);
        }
      }
    } catch {
      // Could not get USB devices
    }

    return devices;
  }

  /**
   * Check if path is on removable media
   */
  async isRemovableMedia(filePath: string): Promise<boolean> {
    const mountPoint = await this.getMountPoint(filePath);
    if (!mountPoint) return false;

    const volume = await this.getVolumeInfo(mountPoint);
    return volume?.isRemovable || volume?.isExternal || false;
  }

  /**
   * Get mount point for a file path
   */
  private async getMountPoint(filePath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync(`df "${filePath}" | tail -1 | awk '{print $NF}'`);
      const mountPoint = stdout.trim();
      return mountPoint || undefined;
    } catch {
      // Check if it starts with /Volumes
      if (filePath.startsWith('/Volumes/')) {
        const parts = filePath.split('/');
        if (parts.length >= 3) {
          return `/Volumes/${parts[2]}`;
        }
      }
      return undefined;
    }
  }

  /**
   * Get USB device info for a disk device
   */
  private async getUSBDeviceForVolume(diskDevice: string): Promise<DetectedUSBDevice | undefined> {
    try {
      // Use ioreg to trace the device tree
      const deviceId = diskDevice.replace('/dev/', '');
      const { stdout } = await execAsync(
        `ioreg -r -c IOMedia -n ${deviceId} -d 10 2>/dev/null || ioreg -r -c IOUSBHostDevice -d 5`
      );

      // Parse ioreg output to find USB parent
      const vendorId = this.extractIoregValue(stdout, 'idVendor');
      const productId = this.extractIoregValue(stdout, 'idProduct');
      const serial = this.extractIoregValue(stdout, 'USB Serial Number') ||
        this.extractIoregValue(stdout, 'kUSBSerialNumberString');
      const deviceName = this.extractIoregValue(stdout, 'USB Product Name') ||
        this.extractIoregValue(stdout, 'Product Name');
      const manufacturer = this.extractIoregValue(stdout, 'USB Vendor Name') ||
        this.extractIoregValue(stdout, 'Vendor Name');
      const locationId = this.extractIoregValue(stdout, 'locationID');

      if (!vendorId || !productId) return undefined;

      return {
        vendorId: this.formatHexId(vendorId),
        productId: this.formatHexId(productId),
        serial: normalizeSerial(serial),
        devicePath: diskDevice,
        deviceName: deviceName || 'Unknown USB Device',
        busLocation: locationId,
        manufacturer,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Get media (card) info
   */
  private async getMediaInfo(volume: MountedVolume): Promise<DetectedMedia | undefined> {
    try {
      const { stdout } = await execAsync(`diskutil info -plist "${volume.device}"`);
      const info = this.parsePlist(stdout);

      // Try to get card serial from SMART data or vendor-specific info
      let serial: string | undefined;
      try {
        const { stdout: smartOut } = await execAsync(
          `smartctl -i /dev/${volume.device} 2>/dev/null | grep -i serial`
        );
        const match = smartOut.match(/Serial Number:\s*(\S+)/i);
        if (match) serial = match[1];
      } catch {
        // SMART not available
      }

      return {
        type: inferMediaType(volume.totalSize, info.MediaName),
        serial: normalizeSerial(serial),
        manufacturer: info.MediaName?.split(' ')[0],
        model: info.MediaName,
        capacity: volume.totalSize,
        volumeName: volume.volumeName,
        volumeUUID: volume.volumeUUID,
        filesystemType: volume.filesystemType,
      };
    } catch {
      return {
        type: inferMediaType(volume.totalSize),
        capacity: volume.totalSize,
        volumeName: volume.volumeName,
        volumeUUID: volume.volumeUUID,
        filesystemType: volume.filesystemType,
      };
    }
  }

  /**
   * Convert device chain to ImportSourceDevice
   */
  private chainToSourceDevice(chain: DeviceChain): ImportSourceDevice {
    const device: ImportSourceDevice = {};

    if (chain.usb) {
      device.usb = {
        vendorId: chain.usb.vendorId,
        productId: chain.usb.productId,
        serial: chain.usb.serial,
        devicePath: chain.usb.devicePath,
        deviceName: chain.usb.deviceName,
        busLocation: chain.usb.busLocation,
      };
    }

    if (chain.cardReader) {
      device.cardReader = {
        vendor: chain.cardReader.vendor,
        model: chain.cardReader.model,
        serial: chain.cardReader.serial,
        port: chain.cardReader.port,
      };
    }

    if (chain.media) {
      device.media = {
        type: chain.media.type,
        serial: chain.media.serial,
        manufacturer: chain.media.manufacturer,
        capacity: chain.media.capacity,
        firmware: chain.media.firmware,
      };
    }

    if (chain.isCameraDirect) {
      device.tetheredConnection = 'usb';
      // Try to get camera body serial from EXIF of files on the volume
      // (This would be done separately during import)
    }

    return device;
  }

  /**
   * Parse simple plist output to object
   */
  private parsePlist(plistXml: string): Record<string, any> {
    const result: Record<string, any> = {};

    // Simple key-value extraction
    const keyValueRegex = /<key>([^<]+)<\/key>\s*<(string|integer|true|false|real|data)>?([^<]*)<?\/?/g;
    let match;

    while ((match = keyValueRegex.exec(plistXml)) !== null) {
      const key = match[1];
      const type = match[2];
      const value = match[3];

      switch (type) {
        case 'string':
          result[key] = value;
          break;
        case 'integer':
          result[key] = parseInt(value, 10);
          break;
        case 'real':
          result[key] = parseFloat(value);
          break;
        case 'true':
          result[key] = true;
          break;
        case 'false':
          result[key] = false;
          break;
        default:
          result[key] = value;
      }
    }

    // Handle array of disks
    const diskArrayMatch = plistXml.match(/<key>AllDisksAndPartitions<\/key>\s*<array>([\s\S]*?)<\/array>/);
    if (diskArrayMatch) {
      result.AllDisksAndPartitions = this.parseDisksArray(diskArrayMatch[1]);
    }

    return result;
  }

  /**
   * Parse disks array from plist
   */
  private parseDisksArray(arrayContent: string): any[] {
    const disks: any[] = [];
    const dictRegex = /<dict>([\s\S]*?)<\/dict>/g;
    let match;

    while ((match = dictRegex.exec(arrayContent)) !== null) {
      const disk = this.parsePlist(match[1]);

      // Handle partitions
      const partMatch = match[1].match(/<key>Partitions<\/key>\s*<array>([\s\S]*?)<\/array>/);
      if (partMatch) {
        disk.Partitions = [];
        const partDictRegex = /<dict>([\s\S]*?)<\/dict>/g;
        let partDictMatch;
        while ((partDictMatch = partDictRegex.exec(partMatch[1])) !== null) {
          disk.Partitions.push(this.parsePlist(partDictMatch[1]));
        }
      }

      disks.push(disk);
    }

    return disks;
  }

  /**
   * Extract value from ioreg output
   */
  private extractIoregValue(output: string, key: string): string | undefined {
    const regex = new RegExp(`"${key}"\\s*=\\s*(?:"([^"]+)"|([0-9]+))`);
    const match = output.match(regex);
    return match ? (match[1] || match[2]) : undefined;
  }

  /**
   * Format hex ID (ensure 0x prefix and 4 digits)
   */
  private formatHexId(value: string | number): string {
    if (typeof value === 'number') {
      return `0x${value.toString(16).padStart(4, '0')}`;
    }
    if (value.startsWith('0x')) return value;
    const num = parseInt(value, 16);
    return `0x${num.toString(16).padStart(4, '0')}`;
  }
}

/**
 * Create macOS detector instance
 */
export function createMacOSDetector(): MacOSDeviceDetector {
  return new MacOSDeviceDetector();
}
