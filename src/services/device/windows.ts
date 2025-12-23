/**
 * Windows Device Detection
 *
 * Uses PowerShell and WMI to detect USB devices,
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
 * Windows Device Detector implementation
 */
export class WindowsDeviceDetector implements PlatformDeviceDetector {
  private volumeCache = new Map<string, DeviceChain>();
  private cacheTime = 0;
  private readonly CACHE_TTL = 5000;

  /**
   * Get all mounted removable/external volumes
   */
  async getRemovableVolumes(): Promise<MountedVolume[]> {
    const volumes: MountedVolume[] = [];

    try {
      // Use PowerShell to get removable drives
      const script = `
        Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -or $_.DriveType -eq 'CD-ROM' } |
        Select-Object DriveLetter, FileSystemLabel, FileSystem, DriveType, Size, SizeRemaining |
        ConvertTo-Json -Compress
      `;
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${script}"`);

      const data = JSON.parse(stdout || '[]');
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (item.DriveLetter) {
          const mountPoint = `${item.DriveLetter}:\\`;
          volumes.push({
            path: mountPoint,
            device: item.DriveLetter,
            volumeName: item.FileSystemLabel || item.DriveLetter,
            filesystemType: item.FileSystem || 'unknown',
            mountPoint,
            isRemovable: item.DriveType === 'Removable',
            isExternal: item.DriveType === 'Removable',
            isNetwork: item.DriveType === 'Network',
            totalSize: item.Size || 0,
            freeSpace: item.SizeRemaining || 0,
          });
        }
      }
    } catch {
      // Fallback: use wmic
      try {
        const { stdout } = await execAsync(
          'wmic logicaldisk where "DriveType=2 or DriveType=5" get DeviceID,VolumeName,FileSystem,Size,FreeSpace /format:csv'
        );

        for (const line of stdout.split('\n').slice(1)) {
          const parts = line.trim().split(',');
          if (parts.length >= 5 && parts[1]) {
            const mountPoint = `${parts[1]}\\`;
            volumes.push({
              path: mountPoint,
              device: parts[1],
              volumeName: parts[4] || parts[1],
              filesystemType: parts[2] || 'unknown',
              mountPoint,
              isRemovable: true,
              isExternal: true,
              isNetwork: false,
              totalSize: parseInt(parts[3] || '0', 10),
              freeSpace: parseInt(parts[5] || '0', 10),
            });
          }
        }
      } catch {
        // No access
      }
    }

    return volumes;
  }

  /**
   * Get volume information for a mount point
   */
  async getVolumeInfo(mountPoint: string): Promise<MountedVolume | undefined> {
    try {
      // Extract drive letter
      const driveLetter = mountPoint.match(/^([A-Z]):/i)?.[1]?.toUpperCase();
      if (!driveLetter) return undefined;

      const script = `
        $vol = Get-Volume -DriveLetter '${driveLetter}'
        $vol | Select-Object DriveLetter, FileSystemLabel, FileSystem, DriveType, Size, SizeRemaining, UniqueId |
        ConvertTo-Json -Compress
      `;
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${script}"`);

      const info = JSON.parse(stdout);

      return {
        path: `${driveLetter}:\\`,
        device: driveLetter,
        volumeName: info.FileSystemLabel || driveLetter,
        volumeUUID: info.UniqueId,
        filesystemType: info.FileSystem || 'unknown',
        mountPoint: `${driveLetter}:\\`,
        isRemovable: info.DriveType === 'Removable',
        isExternal: info.DriveType === 'Removable' || info.DriveType === 'Unknown',
        isNetwork: info.DriveType === 'Network',
        totalSize: info.Size || 0,
        freeSpace: info.SizeRemaining || 0,
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

    // Get USB device info
    const usbInfo = await this.getUSBDeviceForVolume(volume.device);
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
        nameLC.includes('android') || nameLC.includes('iphone');

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
      // Extract drive letter from path
      const driveLetter = filePath.match(/^([A-Z]):/i)?.[1];
      if (!driveLetter) {
        return { found: false, errors: ['Could not determine drive letter'], warnings };
      }

      const chain = await this.getDeviceChain(`${driveLetter}:\\`);
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
      const script = `
        Get-PnpDevice -Class USB | ForEach-Object {
          $device = $_
          $props = Get-PnpDeviceProperty -InstanceId $device.InstanceId
          [PSCustomObject]@{
            Name = $device.FriendlyName
            InstanceId = $device.InstanceId
            Manufacturer = ($props | Where-Object KeyName -eq 'DEVPKEY_Device_Manufacturer').Data
            VendorId = ($device.InstanceId -split '&')[0] -replace 'USB\\\\VID_', ''
            ProductId = (($device.InstanceId -split '&')[1] -split '\\\\')[0] -replace 'PID_', ''
          }
        } | ConvertTo-Json -Compress
      `;

      const { stdout } = await execAsync(`powershell -NoProfile -Command "${script}"`);
      const data = JSON.parse(stdout || '[]');
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (item.VendorId && item.ProductId) {
          devices.push({
            vendorId: `0x${item.VendorId.toLowerCase()}`,
            productId: `0x${item.ProductId.toLowerCase()}`,
            serial: normalizeSerial(item.Serial),
            devicePath: item.InstanceId || '',
            deviceName: item.Name || 'Unknown USB Device',
            manufacturer: item.Manufacturer,
          });
        }
      }
    } catch {
      // Fallback to wmic
      try {
        const { stdout } = await execAsync(
          'wmic path Win32_USBHub get DeviceID,Name,Manufacturer /format:csv'
        );

        for (const line of stdout.split('\n').slice(1)) {
          const parts = line.trim().split(',');
          if (parts.length >= 4 && parts[1]) {
            const vidMatch = parts[1].match(/VID_([0-9A-F]+)/i);
            const pidMatch = parts[1].match(/PID_([0-9A-F]+)/i);

            if (vidMatch && pidMatch) {
              devices.push({
                vendorId: `0x${vidMatch[1].toLowerCase()}`,
                productId: `0x${pidMatch[1].toLowerCase()}`,
                devicePath: parts[1],
                deviceName: parts[3] || 'Unknown',
                manufacturer: parts[2],
              });
            }
          }
        }
      } catch {
        // No access
      }
    }

    return devices;
  }

  /**
   * Check if path is on removable media
   */
  async isRemovableMedia(filePath: string): Promise<boolean> {
    const driveLetter = filePath.match(/^([A-Z]):/i)?.[1];
    if (!driveLetter) return false;

    const volume = await this.getVolumeInfo(`${driveLetter}:\\`);
    return volume?.isRemovable || volume?.isExternal || false;
  }

  /**
   * Get USB device info for a drive
   */
  private async getUSBDeviceForVolume(driveLetter: string): Promise<DetectedUSBDevice | undefined> {
    try {
      const script = `
        $partition = Get-Partition -DriveLetter '${driveLetter}'
        $disk = Get-Disk -Number $partition.DiskNumber
        $pnpDevice = Get-PnpDevice | Where-Object { $_.InstanceId -like "*$($disk.SerialNumber)*" } | Select-Object -First 1

        if ($pnpDevice) {
          $props = Get-PnpDeviceProperty -InstanceId $pnpDevice.InstanceId
          [PSCustomObject]@{
            Name = $pnpDevice.FriendlyName
            InstanceId = $pnpDevice.InstanceId
            Manufacturer = ($props | Where-Object KeyName -eq 'DEVPKEY_Device_Manufacturer').Data
            Serial = $disk.SerialNumber
          } | ConvertTo-Json -Compress
        } else {
          [PSCustomObject]@{
            Name = $disk.FriendlyName
            Serial = $disk.SerialNumber
            Manufacturer = $disk.Manufacturer
          } | ConvertTo-Json -Compress
        }
      `;

      const { stdout } = await execAsync(`powershell -NoProfile -Command "${script}"`);
      const info = JSON.parse(stdout);

      if (!info.Name) return undefined;

      // Try to extract VID/PID from InstanceId
      let vendorId = '0x0000';
      let productId = '0x0000';

      if (info.InstanceId) {
        const vidMatch = info.InstanceId.match(/VID_([0-9A-F]+)/i);
        const pidMatch = info.InstanceId.match(/PID_([0-9A-F]+)/i);
        if (vidMatch) vendorId = `0x${vidMatch[1].toLowerCase()}`;
        if (pidMatch) productId = `0x${pidMatch[1].toLowerCase()}`;
      }

      return {
        vendorId,
        productId,
        serial: normalizeSerial(info.Serial),
        devicePath: info.InstanceId || '',
        deviceName: info.Name,
        manufacturer: info.Manufacturer,
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
      const script = `
        $partition = Get-Partition -DriveLetter '${volume.device}'
        $disk = Get-Disk -Number $partition.DiskNumber
        [PSCustomObject]@{
          SerialNumber = $disk.SerialNumber
          Manufacturer = $disk.Manufacturer
          Model = $disk.Model
          Size = $disk.Size
          FirmwareVersion = $disk.FirmwareVersion
          BusType = $disk.BusType
        } | ConvertTo-Json -Compress
      `;

      const { stdout } = await execAsync(`powershell -NoProfile -Command "${script}"`);
      const info = JSON.parse(stdout);

      return {
        type: inferMediaType(info.Size || volume.totalSize, info.Model, info.Manufacturer),
        serial: normalizeSerial(info.SerialNumber),
        manufacturer: info.Manufacturer,
        model: info.Model,
        capacity: info.Size || volume.totalSize,
        firmware: info.FirmwareVersion,
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
 * Create Windows detector instance
 */
export function createWindowsDetector(): WindowsDeviceDetector {
  return new WindowsDeviceDetector();
}
