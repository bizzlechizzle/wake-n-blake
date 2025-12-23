/**
 * Tests for media-types.ts
 *
 * Comprehensive file type definitions and categorization.
 */

import { describe, it, expect } from 'vitest';
import {
  IMAGE_EXTENSIONS,
  RAW_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  SIDECAR_EXTENSIONS,
  EBOOK_EXTENSIONS,
  GAME_EXTENSIONS,
  ARCHIVE_EXTENSIONS,
  ALL_MEDIA_EXTENSIONS,
  ALL_KNOWN_EXTENSIONS,
  getMediaCategory,
  isMediaExtension,
  isKnownExtension,
} from '../../src/services/file-type/media-types.js';

describe('Media Types', () => {
  describe('Extension Sets', () => {
    it('should have IMAGE_EXTENSIONS populated', () => {
      expect(IMAGE_EXTENSIONS.size).toBeGreaterThan(30);
      expect(IMAGE_EXTENSIONS.has('.jpg')).toBe(true);
      expect(IMAGE_EXTENSIONS.has('.png')).toBe(true);
      expect(IMAGE_EXTENSIONS.has('.heic')).toBe(true);
      expect(IMAGE_EXTENSIONS.has('.tga')).toBe(true);
      expect(IMAGE_EXTENSIONS.has('.pcd')).toBe(true);
    });

    it('should have RAW_EXTENSIONS for all major camera formats', () => {
      expect(RAW_EXTENSIONS.size).toBeGreaterThan(25);
      // Canon
      expect(RAW_EXTENSIONS.has('.cr2')).toBe(true);
      expect(RAW_EXTENSIONS.has('.cr3')).toBe(true);
      // Nikon
      expect(RAW_EXTENSIONS.has('.nef')).toBe(true);
      // Sony
      expect(RAW_EXTENSIONS.has('.arw')).toBe(true);
      // Fujifilm
      expect(RAW_EXTENSIONS.has('.raf')).toBe(true);
      // Adobe
      expect(RAW_EXTENSIONS.has('.dng')).toBe(true);
    });

    it('should have VIDEO_EXTENSIONS for common containers', () => {
      expect(VIDEO_EXTENSIONS.size).toBeGreaterThan(20);
      expect(VIDEO_EXTENSIONS.has('.mp4')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.mov')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.mkv')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.mxf')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.r3d')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.braw')).toBe(true);
    });

    it('should have AUDIO_EXTENSIONS for all formats', () => {
      expect(AUDIO_EXTENSIONS.size).toBeGreaterThan(25);
      expect(AUDIO_EXTENSIONS.has('.mp3')).toBe(true);
      expect(AUDIO_EXTENSIONS.has('.flac')).toBe(true);
      expect(AUDIO_EXTENSIONS.has('.wav')).toBe(true);
      expect(AUDIO_EXTENSIONS.has('.m4a')).toBe(true);
      expect(AUDIO_EXTENSIONS.has('.opus')).toBe(true);
    });

    it('should have SIDECAR_EXTENSIONS for metadata files', () => {
      expect(SIDECAR_EXTENSIONS.size).toBeGreaterThan(15);
      expect(SIDECAR_EXTENSIONS.has('.xmp')).toBe(true);
      expect(SIDECAR_EXTENSIONS.has('.srt')).toBe(true);
      expect(SIDECAR_EXTENSIONS.has('.aae')).toBe(true);
      expect(SIDECAR_EXTENSIONS.has('.thm')).toBe(true);
      expect(SIDECAR_EXTENSIONS.has('.lrv')).toBe(true);
      expect(SIDECAR_EXTENSIONS.has('.nfo')).toBe(true);
    });

    it('should have EBOOK_EXTENSIONS including comics', () => {
      expect(EBOOK_EXTENSIONS.size).toBeGreaterThan(10);
      expect(EBOOK_EXTENSIONS.has('.epub')).toBe(true);
      expect(EBOOK_EXTENSIONS.has('.mobi')).toBe(true);
      expect(EBOOK_EXTENSIONS.has('.cbr')).toBe(true);
      expect(EBOOK_EXTENSIONS.has('.cbz')).toBe(true);
      expect(EBOOK_EXTENSIONS.has('.kepub')).toBe(true);
    });

    it('should have GAME_EXTENSIONS for ROMs and packages', () => {
      expect(GAME_EXTENSIONS.size).toBeGreaterThan(20);
      expect(GAME_EXTENSIONS.has('.nsp')).toBe(true);
      expect(GAME_EXTENSIONS.has('.xci')).toBe(true);
      expect(GAME_EXTENSIONS.has('.nes')).toBe(true);
      expect(GAME_EXTENSIONS.has('.gba')).toBe(true);
    });

    it('should have ARCHIVE_EXTENSIONS for compressed files', () => {
      expect(ARCHIVE_EXTENSIONS.size).toBeGreaterThan(25);
      expect(ARCHIVE_EXTENSIONS.has('.zip')).toBe(true);
      expect(ARCHIVE_EXTENSIONS.has('.rar')).toBe(true);
      expect(ARCHIVE_EXTENSIONS.has('.7z')).toBe(true);
      expect(ARCHIVE_EXTENSIONS.has('.tar')).toBe(true);
      expect(ARCHIVE_EXTENSIONS.has('.lzh')).toBe(true);
      expect(ARCHIVE_EXTENSIONS.has('.dmg')).toBe(true);
    });

    it('should have ALL_MEDIA_EXTENSIONS as union of media types', () => {
      expect(ALL_MEDIA_EXTENSIONS.has('.jpg')).toBe(true);
      expect(ALL_MEDIA_EXTENSIONS.has('.mp4')).toBe(true);
      expect(ALL_MEDIA_EXTENSIONS.has('.mp3')).toBe(true);
      expect(ALL_MEDIA_EXTENSIONS.has('.cr2')).toBe(true);
    });

    it('should have ALL_KNOWN_EXTENSIONS including all categories', () => {
      expect(ALL_KNOWN_EXTENSIONS.size).toBeGreaterThan(200);
      // Media
      expect(ALL_KNOWN_EXTENSIONS.has('.jpg')).toBe(true);
      // Sidecar
      expect(ALL_KNOWN_EXTENSIONS.has('.xmp')).toBe(true);
      // Ebook
      expect(ALL_KNOWN_EXTENSIONS.has('.epub')).toBe(true);
      // Game
      expect(ALL_KNOWN_EXTENSIONS.has('.nsp')).toBe(true);
      // Archive
      expect(ALL_KNOWN_EXTENSIONS.has('.zip')).toBe(true);
    });
  });

  describe('getMediaCategory', () => {
    it('should categorize image extensions', () => {
      expect(getMediaCategory('.jpg')).toBe('image');
      expect(getMediaCategory('.png')).toBe('image');
      expect(getMediaCategory('.heic')).toBe('image');
      expect(getMediaCategory('.tga')).toBe('image');
    });

    it('should categorize RAW extensions separately', () => {
      expect(getMediaCategory('.cr2')).toBe('raw');
      expect(getMediaCategory('.nef')).toBe('raw');
      expect(getMediaCategory('.arw')).toBe('raw');
      expect(getMediaCategory('.dng')).toBe('raw');
    });

    it('should categorize video extensions', () => {
      expect(getMediaCategory('.mp4')).toBe('video');
      expect(getMediaCategory('.mov')).toBe('video');
      expect(getMediaCategory('.mkv')).toBe('video');
    });

    it('should categorize audio extensions', () => {
      expect(getMediaCategory('.mp3')).toBe('audio');
      expect(getMediaCategory('.flac')).toBe('audio');
      expect(getMediaCategory('.wav')).toBe('audio');
    });

    it('should categorize sidecar extensions', () => {
      expect(getMediaCategory('.xmp')).toBe('sidecar');
      expect(getMediaCategory('.srt')).toBe('sidecar');
      expect(getMediaCategory('.aae')).toBe('sidecar');
    });

    it('should categorize ebook extensions', () => {
      expect(getMediaCategory('.epub')).toBe('ebook');
      expect(getMediaCategory('.cbr')).toBe('ebook');
      expect(getMediaCategory('.mobi')).toBe('ebook');
    });

    it('should categorize game extensions', () => {
      expect(getMediaCategory('.nsp')).toBe('game');
      expect(getMediaCategory('.xci')).toBe('game');
    });

    it('should categorize archive extensions', () => {
      expect(getMediaCategory('.zip')).toBe('archive');
      expect(getMediaCategory('.rar')).toBe('archive');
      expect(getMediaCategory('.7z')).toBe('archive');
    });

    it('should return document for unknown extensions', () => {
      expect(getMediaCategory('.xyz')).toBe('document');
      expect(getMediaCategory('.unknown')).toBe('document');
      expect(getMediaCategory('.foo')).toBe('document');
    });

    it('should handle extensions with or without dot', () => {
      expect(getMediaCategory('jpg')).toBe('image');
      expect(getMediaCategory('.jpg')).toBe('image');
    });

    it('should be case-insensitive', () => {
      expect(getMediaCategory('.JPG')).toBe('image');
      expect(getMediaCategory('.Mp4')).toBe('video');
      expect(getMediaCategory('.FLAC')).toBe('audio');
    });
  });

  describe('isMediaExtension', () => {
    it('should return true for media extensions', () => {
      expect(isMediaExtension('.jpg')).toBe(true);
      expect(isMediaExtension('.mp4')).toBe(true);
      expect(isMediaExtension('.mp3')).toBe(true);
      expect(isMediaExtension('.cr2')).toBe(true);
    });

    it('should return false for non-media extensions', () => {
      expect(isMediaExtension('.zip')).toBe(false);
      expect(isMediaExtension('.epub')).toBe(false);
      expect(isMediaExtension('.xmp')).toBe(false);
      expect(isMediaExtension('.nsp')).toBe(false);
    });
  });

  describe('isKnownExtension', () => {
    it('should return true for all known extensions', () => {
      expect(isKnownExtension('.jpg')).toBe(true);
      expect(isKnownExtension('.zip')).toBe(true);
      expect(isKnownExtension('.epub')).toBe(true);
      expect(isKnownExtension('.nsp')).toBe(true);
      expect(isKnownExtension('.xmp')).toBe(true);
    });

    it('should return false for unknown extensions', () => {
      expect(isKnownExtension('.xyz')).toBe(false);
      expect(isKnownExtension('.afa')).toBe(false);
      expect(isKnownExtension('.unknown')).toBe(false);
    });
  });
});
