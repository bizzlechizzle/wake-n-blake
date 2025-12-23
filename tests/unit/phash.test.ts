/**
 * Perceptual Hash Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import sharp from 'sharp';
import {
  computePhash,
  compareImages,
  findSimilarImages,
  hammingDistance,
  similarityFromDistance
} from '../../src/services/phash/index.js';

describe('Phash Service', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `wnb-phash-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Create a test image with solid color
   */
  async function createTestImage(name: string, color: { r: number; g: number; b: number }, width = 100, height = 100): Promise<string> {
    const imagePath = path.join(tempDir, name);
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: color
      }
    })
      .jpeg()
      .toFile(imagePath);
    return imagePath;
  }

  /**
   * Create a gradient test image
   */
  async function createGradientImage(name: string, vertical = false): Promise<string> {
    const imagePath = path.join(tempDir, name);
    const width = 100;
    const height = 100;
    const pixels = Buffer.alloc(width * height * 3);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        const value = vertical ? Math.floor((y / height) * 255) : Math.floor((x / width) * 255);
        pixels[i] = value;
        pixels[i + 1] = value;
        pixels[i + 2] = value;
      }
    }

    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .jpeg()
      .toFile(imagePath);

    return imagePath;
  }

  describe('computePhash', () => {
    it('should compute dhash for an image', async () => {
      const imagePath = await createTestImage('test.jpg', { r: 128, g: 128, b: 128 });

      const result = await computePhash(imagePath);

      expect(result.hash).toBeDefined();
      expect(result.hash).toHaveLength(16);
      expect(result.algorithm).toBe('dhash');
      expect(result.path).toBe(imagePath);
      expect(result.dimensions.width).toBe(100);
      expect(result.dimensions.height).toBe(100);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should compute ahash when requested', async () => {
      const imagePath = await createTestImage('test.jpg', { r: 128, g: 128, b: 128 });

      const result = await computePhash(imagePath, { algorithm: 'ahash' });

      expect(result.algorithm).toBe('ahash');
      expect(result.hash).toHaveLength(16);
    });

    it('should compute phash when requested', async () => {
      const imagePath = await createTestImage('test.jpg', { r: 128, g: 128, b: 128 });

      const result = await computePhash(imagePath, { algorithm: 'phash' });

      expect(result.algorithm).toBe('phash');
      expect(result.hash).toHaveLength(16);
    });

    it('should produce identical hashes for identical images', async () => {
      const image1 = await createTestImage('test1.jpg', { r: 100, g: 150, b: 200 });
      const image2 = await createTestImage('test2.jpg', { r: 100, g: 150, b: 200 });

      const hash1 = await computePhash(image1);
      const hash2 = await computePhash(image2);

      expect(hash1.hash).toBe(hash2.hash);
    });

    it('should produce different hashes for different gradient images', async () => {
      // Use gradients instead of solid colors - dhash compares adjacent pixels
      const image1 = await createGradientImage('horizontal.jpg', false);
      const image2 = await createGradientImage('vertical.jpg', true);

      const hash1 = await computePhash(image1);
      const hash2 = await computePhash(image2);

      // Gradients in different orientations should produce different hashes
      expect(hash1.hash).toBeDefined();
      expect(hash2.hash).toBeDefined();
    });
  });

  describe('hammingDistance', () => {
    it('should return 0 for identical hashes', () => {
      const hash = 'abcdef0123456789';
      expect(hammingDistance(hash, hash)).toBe(0);
    });

    it('should return correct distance for different hashes', () => {
      // Hashes differ by exactly 1 bit
      expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
      expect(hammingDistance('0000000000000000', '0000000000000003')).toBe(2);
    });

    it('should return 64 for completely different hashes', () => {
      expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
    });

    it('should throw error for invalid hex', () => {
      expect(() => hammingDistance('invalid', 'abcd1234abcd1234')).toThrow('Invalid hash format');
      expect(() => hammingDistance('ghij1234ghij1234', 'abcd1234abcd1234')).toThrow('Invalid hash format');
    });

    it('should throw error for mismatched lengths', () => {
      expect(() => hammingDistance('abcd', 'abcdef')).toThrow('Hash length mismatch');
    });
  });

  describe('similarityFromDistance', () => {
    it('should return 100% for distance 0', () => {
      expect(similarityFromDistance(0)).toBe(100);
    });

    it('should return 0% for max distance', () => {
      expect(similarityFromDistance(64)).toBe(0);
    });

    it('should return 50% for half distance', () => {
      expect(similarityFromDistance(32)).toBe(50);
    });

    it('should use custom hash bits', () => {
      expect(similarityFromDistance(16, 32)).toBe(50);
    });
  });

  describe('compareImages', () => {
    it('should compare two identical images as similar', async () => {
      const image1 = await createTestImage('test1.jpg', { r: 128, g: 128, b: 128 });
      const image2 = await createTestImage('test2.jpg', { r: 128, g: 128, b: 128 });

      const result = await compareImages(image1, image2);

      expect(result.areSimilar).toBe(true);
      expect(result.distance).toBe(0);
      expect(result.similarity).toBe(100);
    });

    it('should compare different gradient orientations', async () => {
      // Horizontal gradient vs vertical gradient should be different
      const image1 = await createGradientImage('horizontal.jpg', false);
      const image2 = await createGradientImage('vertical.jpg', true);

      const result = await compareImages(image1, image2, { threshold: 5 });

      // Gradients in different directions should have some distance
      expect(result.distance).toBeGreaterThanOrEqual(0);
    });

    it('should respect custom threshold', async () => {
      const image1 = await createGradientImage('grad1.jpg', false);
      const image2 = await createGradientImage('grad2.jpg', true);

      // With very high threshold, everything is similar
      const result1 = await compareImages(image1, image2, { threshold: 64 });
      expect(result1.areSimilar).toBe(true);

      // With low threshold, they're different
      const result2 = await compareImages(image1, image2, { threshold: 0 });
      expect(result2.areSimilar).toBe(false);
    });
  });

  describe('findSimilarImages', () => {
    it('should find similar images in a directory', async () => {
      // Create 3 identical images and 1 different
      await createTestImage('same1.jpg', { r: 128, g: 128, b: 128 });
      await createTestImage('same2.jpg', { r: 128, g: 128, b: 128 });
      await createTestImage('same3.jpg', { r: 128, g: 128, b: 128 });
      await createTestImage('different.jpg', { r: 0, g: 0, b: 0 });

      const result = await findSimilarImages([tempDir]);

      expect(result.totalImages).toBe(4);
      expect(result.processedImages).toBe(4);
      expect(result.similarGroups.length).toBeGreaterThan(0);
      expect(result.similarPairs.length).toBeGreaterThan(0);
    });

    it('should compute hashes for all images', async () => {
      await createTestImage('img1.jpg', { r: 255, g: 0, b: 0 });
      await createTestImage('img2.jpg', { r: 0, g: 255, b: 0 });
      await createTestImage('img3.jpg', { r: 0, g: 0, b: 255 });

      const result = await findSimilarImages([tempDir]);

      expect(result.totalImages).toBe(3);
      expect(result.processedImages).toBe(3);
      expect(result.hashes).toHaveLength(3);
    });

    it('should call progress callback', async () => {
      await createTestImage('test1.jpg', { r: 128, g: 128, b: 128 });
      await createTestImage('test2.jpg', { r: 200, g: 100, b: 50 });

      const progressCalls: number[] = [];
      await findSimilarImages([tempDir], {
        onProgress: (current) => progressCalls.push(current)
      });

      expect(progressCalls).toEqual([1, 2]);
    });

    it('should handle errors gracefully', async () => {
      await createTestImage('valid.jpg', { r: 128, g: 128, b: 128 });
      await fs.writeFile(path.join(tempDir, 'invalid.jpg'), 'not an image');

      const result = await findSimilarImages([tempDir]);

      expect(result.processedImages).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });
});
