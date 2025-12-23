/**
 * Tests for storage-patterns.ts
 *
 * Storage type detection and camera folder patterns.
 */

import { describe, it, expect } from 'vitest';
import {
  NETWORK_PATH_PREFIXES,
  LOCAL_VOLUME_PATTERNS,
  CAMERA_VOLUME_PATTERNS,
  CAMERA_FOLDER_PATTERNS,
  FILENAME_PATTERNS,
  STORAGE_CONFIGS,
  detectStorageType,
  getStorageConfig,
  detectCameraFromFolder,
  getVolumeName,
} from '../../src/services/device/storage-patterns.js';

describe('Storage Patterns', () => {
  describe('Constants', () => {
    it('should have NETWORK_PATH_PREFIXES', () => {
      expect(NETWORK_PATH_PREFIXES).toContain('smb://');
      expect(NETWORK_PATH_PREFIXES).toContain('nfs://');
      expect(NETWORK_PATH_PREFIXES).toContain('afp://');
      expect(NETWORK_PATH_PREFIXES).toContain('//');
    });

    it('should have LOCAL_VOLUME_PATTERNS', () => {
      expect(LOCAL_VOLUME_PATTERNS).toContain('macintosh hd');
      expect(LOCAL_VOLUME_PATTERNS).toContain('ssd');
      expect(LOCAL_VOLUME_PATTERNS).toContain('internal');
    });

    it('should have CAMERA_VOLUME_PATTERNS', () => {
      expect(CAMERA_VOLUME_PATTERNS).toContain('sdcard');
      expect(CAMERA_VOLUME_PATTERNS).toContain('dcim');
      expect(CAMERA_VOLUME_PATTERNS).toContain('gopro');
      expect(CAMERA_VOLUME_PATTERNS).toContain('dji');
      expect(CAMERA_VOLUME_PATTERNS).toContain('canon');
    });

    it('should have CAMERA_FOLDER_PATTERNS for major brands', () => {
      expect(CAMERA_FOLDER_PATTERNS.sony).toBeDefined();
      expect(CAMERA_FOLDER_PATTERNS.canon).toBeDefined();
      expect(CAMERA_FOLDER_PATTERNS.panasonic).toBeDefined();
      expect(CAMERA_FOLDER_PATTERNS.gopro).toBeDefined();
      expect(CAMERA_FOLDER_PATTERNS.dji).toBeDefined();
    });

    it('should have FILENAME_PATTERNS for cameras', () => {
      expect(FILENAME_PATTERNS.sony).toBeDefined();
      expect(FILENAME_PATTERNS.canon).toBeDefined();
      expect(FILENAME_PATTERNS.gopro).toBeDefined();
      expect(FILENAME_PATTERNS.dadcam).toBeDefined();
    });

    it('should have STORAGE_CONFIGS for all types', () => {
      expect(STORAGE_CONFIGS.local).toBeDefined();
      expect(STORAGE_CONFIGS.network).toBeDefined();
      expect(STORAGE_CONFIGS.camera_media).toBeDefined();
      expect(STORAGE_CONFIGS.unknown).toBeDefined();
    });
  });

  describe('detectStorageType', () => {
    it('should detect network paths', () => {
      expect(detectStorageType('smb://server/share')).toBe('network');
      expect(detectStorageType('nfs://server/path')).toBe('network');
      expect(detectStorageType('afp://server/share')).toBe('network');
      expect(detectStorageType('//server/share')).toBe('network');
    });

    it('should detect local volumes on macOS', () => {
      expect(detectStorageType('/Volumes/Macintosh HD/Users')).toBe('local');
      expect(detectStorageType('/Volumes/SSD/data')).toBe('local');
      expect(detectStorageType('/Volumes/Internal/files')).toBe('local');
    });

    it('should detect camera media volumes', () => {
      expect(detectStorageType('/Volumes/SDCARD/DCIM')).toBe('camera_media');
      expect(detectStorageType('/Volumes/GOPRO/DCIM')).toBe('camera_media');
      expect(detectStorageType('/Volumes/Canon/DCIM')).toBe('camera_media');
      expect(detectStorageType('/Volumes/DJI/DCIM')).toBe('camera_media');
    });

    it('should treat unknown /Volumes/ as network (conservative)', () => {
      expect(detectStorageType('/Volumes/SomeNASShare/data')).toBe('network');
      expect(detectStorageType('/Volumes/BackupDrive/files')).toBe('network');
    });

    it('should treat Linux mount points conservatively', () => {
      expect(detectStorageType('/mnt/data')).toBe('network');
      expect(detectStorageType('/media/usb')).toBe('network');
    });

    it('should detect camera media in Linux paths', () => {
      expect(detectStorageType('/media/sdcard/DCIM')).toBe('camera_media');
      expect(detectStorageType('/mnt/gopro/DCIM')).toBe('camera_media');
    });

    it('should default to local for regular paths', () => {
      expect(detectStorageType('/Users/name/Documents')).toBe('local');
      expect(detectStorageType('/home/user/files')).toBe('local');
      expect(detectStorageType('/tmp/test')).toBe('local');
    });

    it('should handle empty/null paths', () => {
      expect(detectStorageType('')).toBe('unknown');
    });
  });

  describe('getStorageConfig', () => {
    it('should return local config for local paths', () => {
      const config = getStorageConfig('/Users/name/Documents');
      expect(config.type).toBe('local');
      expect(config.concurrency).toBeGreaterThan(2);
      expect(config.operationDelayMs).toBe(0);
    });

    it('should return network config for network paths', () => {
      const config = getStorageConfig('smb://server/share');
      expect(config.type).toBe('network');
      expect(config.concurrency).toBe(1);
      expect(config.bufferSize).toBe(1024 * 1024);
      expect(config.operationDelayMs).toBe(50);
    });

    it('should return camera_media config for SD cards', () => {
      const config = getStorageConfig('/Volumes/SDCARD/DCIM');
      expect(config.type).toBe('camera_media');
      expect(config.concurrency).toBe(2);
      expect(config.operationDelayMs).toBe(10);
    });
  });

  describe('detectCameraFromFolder', () => {
    it('should detect Sony camera folders', () => {
      expect(detectCameraFromFolder('/Volumes/SD/PRIVATE/M4ROOT/CLIP')).toBe('sony');
      expect(detectCameraFromFolder('/XDROOT/Clip')).toBe('sony');
    });

    it('should detect Canon camera folders', () => {
      expect(detectCameraFromFolder('/Volumes/SD/DCIM/100CANON')).toBe('canon');
      expect(detectCameraFromFolder('/DCIM/100EOS')).toBe('canon');
    });

    it('should detect GoPro folders', () => {
      expect(detectCameraFromFolder('/Volumes/GOPRO/DCIM/100GOPRO')).toBe('gopro');
    });

    it('should detect DJI folders', () => {
      expect(detectCameraFromFolder('/Volumes/DJI/DCIM/100MEDIA')).toBe('dji');
      expect(detectCameraFromFolder('/DCIM/DJI_001')).toBe('dji');
    });

    it('should detect generic DCIM', () => {
      expect(detectCameraFromFolder('/Volumes/SD/DCIM')).toBe('generic');
    });

    it('should return null for non-camera folders', () => {
      expect(detectCameraFromFolder('/Users/name/Documents')).toBeNull();
      expect(detectCameraFromFolder('/tmp/test')).toBeNull();
    });
  });

  describe('getVolumeName', () => {
    it('should extract volume name from macOS paths', () => {
      expect(getVolumeName('/Volumes/SDCARD/DCIM')).toBe('SDCARD');
      expect(getVolumeName('/Volumes/Macintosh HD/Users')).toBe('Macintosh HD');
      expect(getVolumeName('/Volumes/My Drive/data')).toBe('My Drive');
    });

    it('should return null for non-Volumes paths', () => {
      expect(getVolumeName('/Users/name/Documents')).toBeNull();
      expect(getVolumeName('/tmp/test')).toBeNull();
      expect(getVolumeName('/mnt/data')).toBeNull();
    });
  });
});
