/**
 * Device Detection Tests
 */

import { describe, it, expect } from 'vitest';
import {
  getSourceType,
  formatDeviceInfo,
  createDeviceFingerprint
} from '../../src/services/device/index.js';
import type { DeviceChain } from '../../src/services/device/types.js';
import type { ImportSourceDevice } from '../../src/services/xmp/schema.js';

describe('Device Detection', () => {
  describe('getSourceType', () => {
    it('should return "unknown" for undefined chain', () => {
      expect(getSourceType(undefined)).toBe('unknown');
    });

    it('should detect network share', () => {
      const chain: DeviceChain = {
        volume: {
          mountPoint: '/Volumes/NetworkShare',
          volumeName: 'NetworkShare',
          fileSystem: 'smbfs',
          isRemovable: false,
          isExternal: false,
          isNetwork: true
        }
      };
      expect(getSourceType(chain)).toBe('network_share');
    });

    it('should detect camera direct connection', () => {
      const chain: DeviceChain = {
        volume: {
          mountPoint: '/Volumes/EOS_DIGITAL',
          volumeName: 'EOS_DIGITAL',
          fileSystem: 'msdos',
          isRemovable: true,
          isExternal: true,
          isNetwork: false
        },
        isCameraDirect: true
      };
      expect(getSourceType(chain)).toBe('camera_direct');
    });

    it('should detect phone direct connection', () => {
      const chain: DeviceChain = {
        volume: {
          mountPoint: '/Volumes/iPhone',
          volumeName: 'iPhone',
          fileSystem: 'afc',
          isRemovable: true,
          isExternal: true,
          isNetwork: false
        },
        isPhoneDirect: true
      };
      expect(getSourceType(chain)).toBe('phone_direct');
    });

    it('should detect memory card', () => {
      const chain: DeviceChain = {
        volume: {
          mountPoint: '/Volumes/SDCARD',
          volumeName: 'SDCARD',
          fileSystem: 'exfat',
          isRemovable: true,
          isExternal: true,
          isNetwork: false
        },
        isMemoryCard: true
      };
      expect(getSourceType(chain)).toBe('memory_card');
    });

    it('should detect cloud sync folders', () => {
      const chain: DeviceChain = {
        volume: {
          mountPoint: '/Users/user/Dropbox',
          volumeName: 'Dropbox',
          fileSystem: 'apfs',
          isRemovable: true,
          isExternal: true,
          isNetwork: false
        }
      };
      expect(getSourceType(chain)).toBe('cloud_sync');
    });

    it('should detect Google Drive sync', () => {
      const chain: DeviceChain = {
        volume: {
          mountPoint: '/Users/user/Google Drive',
          volumeName: 'Google Drive',
          fileSystem: 'apfs',
          isRemovable: true,
          isExternal: true,
          isNetwork: false
        }
      };
      expect(getSourceType(chain)).toBe('cloud_sync');
    });

    it('should default to local_disk for external drives', () => {
      const chain: DeviceChain = {
        volume: {
          mountPoint: '/Volumes/ExternalSSD',
          volumeName: 'ExternalSSD',
          fileSystem: 'apfs',
          isRemovable: true,
          isExternal: true,
          isNetwork: false
        }
      };
      expect(getSourceType(chain)).toBe('local_disk');
    });

    it('should return local_disk for internal drives', () => {
      const chain: DeviceChain = {
        volume: {
          mountPoint: '/Users/user/Documents',
          volumeName: 'Macintosh HD',
          fileSystem: 'apfs',
          isRemovable: false,
          isExternal: false,
          isNetwork: false
        }
      };
      expect(getSourceType(chain)).toBe('local_disk');
    });
  });

  describe('formatDeviceInfo', () => {
    it('should format USB device info', () => {
      const device: ImportSourceDevice = {
        usb: {
          deviceName: 'SanDisk Ultra USB',
          vendorId: '0781',
          productId: '5583',
          serial: 'ABC123'
        }
      };

      const formatted = formatDeviceInfo(device);

      expect(formatted).toContain('USB: SanDisk Ultra USB');
      expect(formatted).toContain('VID:PID: 0781:5583');
      expect(formatted).toContain('Serial: ABC123');
    });

    it('should format card reader info', () => {
      const device: ImportSourceDevice = {
        cardReader: {
          vendor: 'Apple',
          model: 'Built-in SD Card Reader',
          serial: 'READER001'
        }
      };

      const formatted = formatDeviceInfo(device);

      expect(formatted).toContain('Card Reader: Apple Built-in SD Card Reader');
      expect(formatted).toContain('Serial: READER001');
    });

    it('should format media info', () => {
      const device: ImportSourceDevice = {
        media: {
          type: 'sd',
          manufacturer: 'SanDisk',
          serial: 'SD123456',
          capacity: 128 * 1024 * 1024 * 1024 // 128 GB
        }
      };

      const formatted = formatDeviceInfo(device);

      expect(formatted).toContain('Media: SD');
      expect(formatted).toContain('Manufacturer: SanDisk');
      expect(formatted).toContain('Serial: SD123456');
      expect(formatted).toContain('Capacity: 128.0 GB');
    });

    it('should format camera body serial', () => {
      const device: ImportSourceDevice = {
        cameraBodySerial: 'CAM-2024-001'
      };

      const formatted = formatDeviceInfo(device);

      expect(formatted).toContain('Camera Body: CAM-2024-001');
    });

    it('should format tethered connection', () => {
      const device: ImportSourceDevice = {
        tetheredConnection: 'usb'
      };

      const formatted = formatDeviceInfo(device);

      expect(formatted).toContain('Connection: usb');
    });

    it('should format complete device chain', () => {
      const device: ImportSourceDevice = {
        cardReader: {
          vendor: 'Apple',
          model: 'SD Card Reader'
        },
        usb: {
          vendorId: '05ac',
          productId: '8406',
          deviceName: 'Apple Card Reader'
        },
        media: {
          type: 'sd',
          manufacturer: 'SanDisk',
          capacity: 64 * 1024 * 1024 * 1024
        },
        cameraBodySerial: 'CANON-123'
      };

      const formatted = formatDeviceInfo(device);

      expect(formatted).toContain('Card Reader:');
      expect(formatted).toContain('USB:');
      expect(formatted).toContain('Media:');
      expect(formatted).toContain('Camera Body:');
    });
  });

  describe('createDeviceFingerprint', () => {
    it('should create fingerprint from USB info', () => {
      const device: ImportSourceDevice = {
        usb: {
          vendorId: '0781',
          productId: '5583',
          serial: 'ABC123'
        }
      };

      const fingerprint = createDeviceFingerprint(device);

      expect(fingerprint).toContain('usb:0781:5583');
      expect(fingerprint).toContain('usb-sn:ABC123');
    });

    it('should create fingerprint from card reader serial', () => {
      const device: ImportSourceDevice = {
        cardReader: {
          serial: 'READER-001'
        }
      };

      const fingerprint = createDeviceFingerprint(device);

      expect(fingerprint).toContain('reader-sn:READER-001');
    });

    it('should create fingerprint from media serial', () => {
      const device: ImportSourceDevice = {
        media: {
          serial: 'SDCARD-001'
        }
      };

      const fingerprint = createDeviceFingerprint(device);

      expect(fingerprint).toContain('media-sn:SDCARD-001');
    });

    it('should create fingerprint from camera body serial', () => {
      const device: ImportSourceDevice = {
        cameraBodySerial: 'CAM-2024-001'
      };

      const fingerprint = createDeviceFingerprint(device);

      expect(fingerprint).toContain('camera:CAM-2024-001');
    });

    it('should combine multiple identifiers', () => {
      const device: ImportSourceDevice = {
        usb: {
          vendorId: '0781',
          productId: '5583',
          serial: 'USB-001'
        },
        cardReader: {
          serial: 'READER-001'
        },
        media: {
          serial: 'MEDIA-001'
        }
      };

      const fingerprint = createDeviceFingerprint(device);

      expect(fingerprint).toContain('usb:0781:5583');
      expect(fingerprint).toContain('usb-sn:USB-001');
      expect(fingerprint).toContain('reader-sn:READER-001');
      expect(fingerprint).toContain('media-sn:MEDIA-001');
      expect(fingerprint.split('|').length).toBe(4);
    });

    it('should return "unknown" for empty device', () => {
      const device: ImportSourceDevice = {};

      const fingerprint = createDeviceFingerprint(device);

      expect(fingerprint).toBe('unknown');
    });
  });
});
