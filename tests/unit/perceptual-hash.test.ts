/**
 * Perceptual Hash Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { perceptualHash } from '../../src/services/metadata/index.js';

function checkPythonLibAvailable(lib: string): boolean {
  try {
    execSync(`python3 -c "import ${lib}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasImagehash = checkPythonLibAvailable('imagehash');

describe('Perceptual Hash', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-phash-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isPerceptualHashAvailable', () => {
    it('should correctly detect imagehash availability', async () => {
      const available = await perceptualHash.isPerceptualHashAvailable();
      expect(typeof available).toBe('boolean');
      expect(available).toBe(hasImagehash);
    });
  });

  describe('compute', () => {
    it('should return undefined for non-existent files', async () => {
      const result = await perceptualHash.compute('/nonexistent/file.jpg');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-image files', async () => {
      const textFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(textFile, 'not an image');
      const result = await perceptualHash.compute(textFile);
      expect(result).toBeUndefined();
    });

    it.skipIf(!hasImagehash)('should compute hashes for valid image', async () => {
      // Use a system image if available
      const systemImages = [
        '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns',
        '/usr/share/pixmaps/apple-logo.png',
      ];

      let testImage: string | null = null;
      for (const img of systemImages) {
        try {
          await fs.access(img);
          testImage = img;
          break;
        } catch {
          continue;
        }
      }

      if (!testImage) {
        return; // Skip if no test image available
      }

      const result = await perceptualHash.compute(testImage);

      if (result) {
        expect(result.phash).toBeDefined();
        expect(typeof result.phash).toBe('string');
        expect(result.dhash).toBeDefined();
        expect(typeof result.dhash).toBe('string');
      }
    });
  });

  describe('toRawMetadata', () => {
    it('should convert result to prefixed key-value pairs', () => {
      const result: perceptualHash.PerceptualHashResult = {
        phash: 'a1b2c3d4e5f60718',
        dhash: 'f8e7d6c5b4a39281',
        ahash: '0123456789abcdef',
        imageSize: { width: 1920, height: 1080 },
      };

      const metadata = perceptualHash.toRawMetadata(result);

      expect(metadata['PHash_Perceptual']).toBe('a1b2c3d4e5f60718');
      expect(metadata['PHash_Difference']).toBe('f8e7d6c5b4a39281');
      expect(metadata['PHash_Average']).toBe('0123456789abcdef');
      expect(metadata['PHash_ImageWidth']).toBe(1920);
      expect(metadata['PHash_ImageHeight']).toBe(1080);
    });

    it('should handle missing optional hash', () => {
      const result: perceptualHash.PerceptualHashResult = {
        phash: 'a1b2c3d4e5f60718',
        dhash: 'f8e7d6c5b4a39281',
        imageSize: { width: 100, height: 100 },
      };

      const metadata = perceptualHash.toRawMetadata(result);

      expect(metadata['PHash_Perceptual']).toBe('a1b2c3d4e5f60718');
      expect(metadata['PHash_Difference']).toBe('f8e7d6c5b4a39281');
      expect(metadata['PHash_Average']).toBeUndefined();
    });
  });

  describe('hammingDistance', () => {
    it('should calculate distance between identical hashes', () => {
      const distance = perceptualHash.hammingDistance('0000000000000000', '0000000000000000');
      expect(distance).toBe(0);
    });

    it('should calculate distance between different hashes', () => {
      const distance = perceptualHash.hammingDistance('0000000000000000', 'ffffffffffffffff');
      expect(distance).toBe(64);
    });

    it('should calculate partial difference', () => {
      const distance = perceptualHash.hammingDistance('0000000000000000', '000000000000000f');
      expect(distance).toBe(4);
    });
  });
});
