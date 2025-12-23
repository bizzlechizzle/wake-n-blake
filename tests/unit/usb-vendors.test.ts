/**
 * Tests for usb-vendors.ts
 *
 * USB Vendor ID database and helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  USB_VENDORS,
  USB_DEVICES,
  VENDOR_CATEGORIES,
  getVendorName,
  getDeviceName,
  getDeviceCategory,
  isCameraVendor,
  isDroneVendor,
  isCardReaderVendor,
  parseHexId,
  formatVidPid,
} from '../../src/services/device/usb-vendors.js';

describe('USB Vendors', () => {
  describe('USB_VENDORS', () => {
    it('should have major camera manufacturers', () => {
      expect(USB_VENDORS[1193]).toBe('Canon');
      expect(USB_VENDORS[1356]).toBe('Sony');
      expect(USB_VENDORS[1112]).toBe('Panasonic');
      expect(USB_VENDORS[1133]).toBe('Nikon');
      expect(USB_VENDORS[1227]).toBe('Fujifilm');
    });

    it('should have action camera vendors', () => {
      expect(USB_VENDORS[2996]).toBe('GoPro');
      expect(USB_VENDORS[10239]).toBe('Insta360');
    });

    it('should have drone manufacturers', () => {
      expect(USB_VENDORS[10007]).toBe('DJI');
    });

    it('should have cinema camera vendors', () => {
      expect(USB_VENDORS[7086]).toBe('RED');
      expect(USB_VENDORS[11046]).toBe('Blackmagic');
      expect(USB_VENDORS[9987]).toBe('ARRI');
    });

    it('should have phone manufacturers', () => {
      expect(USB_VENDORS[1452]).toBe('Apple');
      expect(USB_VENDORS[6353]).toBe('Google');
    });

    it('should have card reader manufacturers', () => {
      expect(USB_VENDORS[1921]).toBe('SanDisk');
      expect(USB_VENDORS[2316]).toBe('Lexar');
    });
  });

  describe('USB_DEVICES', () => {
    it('should have some known device mappings', () => {
      expect(Object.keys(USB_DEVICES).length).toBeGreaterThan(5);
    });
  });

  describe('VENDOR_CATEGORIES', () => {
    it('should categorize cinema cameras', () => {
      expect(VENDOR_CATEGORIES[7086]).toBe('camera_cinema');
      expect(VENDOR_CATEGORIES[11046]).toBe('camera_cinema');
      expect(VENDOR_CATEGORIES[9987]).toBe('camera_cinema');
    });

    it('should categorize professional cameras', () => {
      expect(VENDOR_CATEGORIES[1356]).toBe('camera_professional');
      expect(VENDOR_CATEGORIES[1193]).toBe('camera_professional');
    });

    it('should categorize action cameras', () => {
      expect(VENDOR_CATEGORIES[2996]).toBe('camera_action');
      expect(VENDOR_CATEGORIES[10239]).toBe('camera_action');
    });

    it('should categorize drones', () => {
      expect(VENDOR_CATEGORIES[10007]).toBe('drone');
    });

    it('should categorize phones', () => {
      expect(VENDOR_CATEGORIES[1452]).toBe('phone');
      expect(VENDOR_CATEGORIES[6353]).toBe('phone');
    });

    it('should categorize card readers', () => {
      expect(VENDOR_CATEGORIES[1921]).toBe('card_reader');
      expect(VENDOR_CATEGORIES[2316]).toBe('card_reader');
    });
  });

  describe('getVendorName', () => {
    it('should return vendor name for known IDs', () => {
      expect(getVendorName(1193)).toBe('Canon');
      expect(getVendorName(1356)).toBe('Sony');
      expect(getVendorName(10007)).toBe('DJI');
    });

    it('should return undefined for unknown IDs', () => {
      expect(getVendorName(99999)).toBeUndefined();
      expect(getVendorName(0)).toBeUndefined();
    });
  });

  describe('getDeviceName', () => {
    it('should return device name for known VID:PID combos', () => {
      // Test any device that exists in USB_DEVICES
      const keys = Object.keys(USB_DEVICES);
      if (keys.length > 0) {
        const [vid, pid] = keys[0].split(':').map(Number);
        expect(getDeviceName(vid, pid)).toBeDefined();
      }
    });

    it('should return undefined for unknown combos', () => {
      expect(getDeviceName(0, 0)).toBeUndefined();
      expect(getDeviceName(99999, 99999)).toBeUndefined();
    });
  });

  describe('getDeviceCategory', () => {
    it('should return category for known vendors', () => {
      expect(getDeviceCategory(1193)).toBe('camera_professional');
      expect(getDeviceCategory(2996)).toBe('camera_action');
      expect(getDeviceCategory(10007)).toBe('drone');
    });

    it('should return unknown for unknown vendors', () => {
      expect(getDeviceCategory(99999)).toBe('unknown');
    });
  });

  describe('isCameraVendor', () => {
    it('should return true for camera vendors', () => {
      expect(isCameraVendor(1193)).toBe(true);  // Canon
      expect(isCameraVendor(1356)).toBe(true);  // Sony
      expect(isCameraVendor(2996)).toBe(true);  // GoPro
      expect(isCameraVendor(7086)).toBe(true);  // RED
    });

    it('should return false for non-camera vendors', () => {
      expect(isCameraVendor(10007)).toBe(false);  // DJI (drone)
      expect(isCameraVendor(1452)).toBe(false);   // Apple (phone)
      expect(isCameraVendor(1921)).toBe(false);   // SanDisk (card reader)
      expect(isCameraVendor(99999)).toBe(false);  // Unknown
    });
  });

  describe('isDroneVendor', () => {
    it('should return true for drone vendors', () => {
      expect(isDroneVendor(10007)).toBe(true);  // DJI
    });

    it('should return false for non-drone vendors', () => {
      expect(isDroneVendor(1193)).toBe(false);  // Canon
      expect(isDroneVendor(1452)).toBe(false);  // Apple
    });
  });

  describe('isCardReaderVendor', () => {
    it('should return true for card reader vendors', () => {
      expect(isCardReaderVendor(1921)).toBe(true);  // SanDisk
      expect(isCardReaderVendor(2316)).toBe(true);  // Lexar
    });

    it('should return false for non-card reader vendors', () => {
      expect(isCardReaderVendor(1193)).toBe(false);  // Canon
      expect(isCardReaderVendor(10007)).toBe(false); // DJI
    });
  });

  describe('parseHexId', () => {
    it('should parse hex strings', () => {
      expect(parseHexId('0x04a9')).toBe(1193);  // Canon
      expect(parseHexId('0x054c')).toBe(1356);  // Sony
      expect(parseHexId('0x2717')).toBe(10007); // DJI
    });

    it('should handle hex with company name suffix', () => {
      expect(parseHexId('0x04a9  (Canon Inc.)')).toBe(1193);
      expect(parseHexId('0x054c (Sony Corporation)')).toBe(1356);
    });

    it('should return number as-is', () => {
      expect(parseHexId(1193 as unknown as string)).toBe(1193);
    });

    it('should return 0 for invalid input', () => {
      expect(parseHexId('')).toBe(0);
      expect(parseHexId('invalid')).toBe(0);
      expect(parseHexId(null as unknown as string)).toBe(0);
    });
  });

  describe('formatVidPid', () => {
    it('should format VID:PID as hex string', () => {
      expect(formatVidPid(1193, 12818)).toBe('04a9:3212');
      expect(formatVidPid(1356, 2479)).toBe('054c:09af');
    });

    it('should pad with zeros', () => {
      expect(formatVidPid(1, 1)).toBe('0001:0001');
      expect(formatVidPid(255, 255)).toBe('00ff:00ff');
    });
  });
});
