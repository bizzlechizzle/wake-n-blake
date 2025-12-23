/**
 * Linux Device Detection
 *
 * Uses udevadm, lsblk, and /sys to detect USB devices,
 * card readers, and physical media.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type {
  PlatformDeviceDetector,
  DetectedUSBDevice,
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
 * Linux Device Detector implementation
 */
export class LinuxDeviceDetector implements PlatformDeviceDetector {
  private volumeCache = new Map<string, DeviceChain>();
  private cacheTime = 0;
  private readonly CACHE_TTL = 5000;

  /**
   * Get all mounted removable/external volumes
   */
  async getRemovableVolumes(): Promise<MountedVolume[]> {
    const volumes: MountedVolume[] = [];

    try {
      // Use lsblk to get block devices with mount info
      const { stdout } = await execAsync(
        'lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,UUID,LABEL,HOTPLUG,RM,TRAN'
      );
      const data = JSON.parse(stdout);

      const processDevice = async (device: any, _parent?: any): Promise<void> => {
        if (device.mountpoint && (device.rm || device.hotplug)) {
          const volume = await this.getVolumeFromLsblk(device);
          if (volume) volumes.push(volume);
        }

        // Process children
        if (device.children) {
          for (const child of device.children) {
            await processDevice(child, device);
          }
        }
      };

      for (const device of data.blockdevices || []) {
        await processDevice(device);
      }
    } catch {
      // Fallback: parse /proc/mounts
      try {
        const mounts = await fs.readFile('/proc/mounts', 'utf-8');
        for (const line of mounts.split('\n')) {
          const [_device, mountPoint] = line.split(' ');
          if (mountPoint?.startsWith('/media/') || mountPoint?.startsWith('/mnt/')) {
            const volume = await this.getVolumeInfo(mountPoint);
            if (volume) volumes.push(volume);
          }
        }
      } catch {
        // No volumes accessible
      }
    }

    return volumes;
  }

  /**
   * Get volume info from lsblk device
   */
  private async getVolumeFromLsblk(device: any): Promise<MountedVolume | undefined> {
    if (!device.mountpoint) return undefined;

    try {
      const stat = await fs.statfs(device.mountpoint);

      return {
        path: `/dev/${device.name}`,
        device: device.name,
        volumeName: device.label || path.basename(device.mountpoint),
        volumeUUID: device.uuid,
        filesystemType: device.fstype || 'unknown',
        mountPoint: device.mountpoint,
        isRemovable: device.rm === true || device.rm === '1',
        isExternal: device.hotplug === true || device.hotplug === '1',
        isNetwork: device.fstype === 'nfs' || device.fstype === 'cifs' || device.fstype === 'smbfs',
        totalSize: stat.bsize * stat.blocks,
        freeSpace: stat.bsize * stat.bfree,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Get volume information for a mount point
   */
  async getVolumeInfo(mountPoint: string): Promise<MountedVolume | undefined> {
    try {
      // Find device for mount point
      const { stdout: findMnt } = await execAsync(`findmnt -n -o SOURCE,FSTYPE "${mountPoint}"`);
      const [device, fsType] = findMnt.trim().split(/\s+/);

      if (!device) return undefined;

      const stat = await fs.statfs(mountPoint);

      // Check if removable
      const deviceName = path.basename(device.replace('/dev/', ''));
      let isRemovable = false;
      try {
        const rm = await fs.readFile(`/sys/block/${deviceName}/removable`, 'utf-8');
        isRemovable = rm.trim() === '1';
      } catch {
        // Check parent device
        const match = deviceName.match(/^([a-z]+)/);
        if (match) {
          try {
            const rm = await fs.readFile(`/sys/block/${match[1]}/removable`, 'utf-8');
            isRemovable = rm.trim() === '1';
          } catch {
            // Not available
          }
        }
      }

      // Get label and UUID
      let volumeName = path.basename(mountPoint);
      let volumeUUID: string | undefined;

      try {
        const { stdout: blkid } = await execAsync(`blkid -o value -s LABEL "${device}"`);
        if (blkid.trim()) volumeName = blkid.trim();
      } catch {
        // Label not available
      }

      try {
        const { stdout: uuid } = await execAsync(`blkid -o value -s UUID "${device}"`);
        if (uuid.trim()) volumeUUID = uuid.trim();
      } catch {
        // UUID not available
      }

      return {
        path: device,
        device: deviceName,
        volumeName,
        volumeUUID,
        filesystemType: fsType || 'unknown',
        mountPoint,
        isRemovable,
        isExternal: isRemovable,
        isNetwork: ['nfs', 'cifs', 'smbfs'].includes(fsType || ''),
        totalSize: stat.bsize * stat.blocks,
        freeSpace: stat.bsize * stat.bfree,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Get device chain for a volume path
   */
  async getDeviceChain(volumePath: string): Promise<DeviceChain | undefined> {
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

    // Get USB device info using udevadm
    const usbInfo = await this.getUSBDeviceForVolume(volume.path);
    if (usbInfo) {
      chain.usb = usbInfo;
      chain.connectionType = 'usb';

      const nameLC = (usbInfo.deviceName || '').toLowerCase();

      // Check if it's a card reader
      const isCardReader = CARD_READER_VENDORS.has(usbInfo.manufacturer || '') ||
        nameLC.includes('card reader') ||
        nameLC.includes('sd reader') ||
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
        (nameLC.includes('camera') || nameLC.includes('ptp') || nameLC.includes('mtp'));

      if (isCamera) chain.isCameraDirect = true;

      // Check if it's a phone
      const isPhone = PHONE_MANUFACTURERS.has(usbInfo.manufacturer || '') ||
        nameLC.includes('android') || nameLC.includes('pixel');

      if (isPhone) chain.isPhoneDirect = true;
    }

    // Get media info
    chain.media = await this.getMediaInfo(volume);

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
      const mountPoint = await this.getMountPoint(filePath);
      if (!mountPoint) {
        return { found: false, errors: ['Could not determine mount point'], warnings };
      }

      const chain = await this.getDeviceChain(mountPoint);
      if (!chain) {
        return { found: false, errors: ['Could not detect device chain'], warnings };
      }

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
      // Use lsusb for basic info
      const { stdout } = await execAsync('lsusb -v 2>/dev/null || lsusb');

      const deviceRegex = /Bus (\d+) Device (\d+): ID ([0-9a-f]+):([0-9a-f]+)\s+(.+)/gi;
      let match;

      while ((match = deviceRegex.exec(stdout)) !== null) {
        const [, bus, device, vendorId, productId, name] = match;

        // Get detailed info from sysfs
        const busPath = `/sys/bus/usb/devices/${bus}-${device}`;
        let serial: string | undefined;
        let manufacturer: string | undefined;

        try {
          serial = (await fs.readFile(`${busPath}/serial`, 'utf-8')).trim();
        } catch {
          // Serial not available
        }

        try {
          manufacturer = (await fs.readFile(`${busPath}/manufacturer`, 'utf-8')).trim();
        } catch {
          // Manufacturer not available
        }

        devices.push({
          vendorId: `0x${vendorId}`,
          productId: `0x${productId}`,
          serial: normalizeSerial(serial),
          devicePath: busPath,
          deviceName: name.trim(),
          busLocation: `${bus}:${device}`,
          manufacturer,
        });
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
      const { stdout } = await execAsync(`df --output=target "${filePath}" | tail -1`);
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get USB device info for a block device
   */
  private async getUSBDeviceForVolume(devicePath: string): Promise<DetectedUSBDevice | undefined> {
    try {
      // Use udevadm to get device info
      const { stdout } = await execAsync(`udevadm info --query=all --name="${devicePath}"`);

      const getValue = (key: string): string | undefined => {
        const regex = new RegExp(`E: ${key}=(.+)`, 'i');
        const match = stdout.match(regex);
        return match ? match[1].trim() : undefined;
      };

      const vendorId = getValue('ID_VENDOR_ID');
      const productId = getValue('ID_MODEL_ID');

      if (!vendorId || !productId) return undefined;

      return {
        vendorId: `0x${vendorId}`,
        productId: `0x${productId}`,
        serial: normalizeSerial(getValue('ID_SERIAL_SHORT')),
        devicePath,
        deviceName: getValue('ID_MODEL') || getValue('ID_MODEL_FROM_DATABASE') || 'Unknown',
        busLocation: getValue('ID_PATH'),
        manufacturer: getValue('ID_VENDOR') || getValue('ID_VENDOR_FROM_DATABASE'),
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Get media info
   */
  private async getMediaInfo(volume: MountedVolume): Promise<DetectedMedia | undefined> {
    try {
      // Try to get SD card serial from /sys
      let serial: string | undefined;
      const deviceBase = volume.device.replace(/[0-9]+$/, '');

      try {
        // For MMC/SD cards
        const cidPath = `/sys/block/${deviceBase}/device/cid`;
        const cid = await fs.readFile(cidPath, 'utf-8');
        // CID contains manufacturer ID, product name, serial, etc.
        // Serial is bytes 9-12 (positions 18-25 in hex string)
        if (cid.length >= 26) {
          serial = cid.substring(18, 26);
        }
      } catch {
        // Not an SD card or no access
      }

      // Try to get manufacturer from sysfs
      let manufacturer: string | undefined;
      try {
        manufacturer = (await fs.readFile(`/sys/block/${deviceBase}/device/vendor`, 'utf-8')).trim();
      } catch {
        // Vendor not available
      }

      return {
        type: inferMediaType(volume.totalSize, volume.volumeName, manufacturer),
        serial: normalizeSerial(serial),
        manufacturer,
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
    }

    return device;
  }
}

/**
 * Create Linux detector instance
 */
export function createLinuxDetector(): LinuxDeviceDetector {
  return new LinuxDeviceDetector();
}
