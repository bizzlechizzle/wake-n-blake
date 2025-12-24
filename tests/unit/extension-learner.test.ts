/**
 * Tests for extension-learner.ts
 *
 * Dynamic extension learning and categorization.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ExtensionLearner } from '../../src/services/file-type/extension-learner.js';

describe('ExtensionLearner', () => {
  let testDir: string;
  let learner: ExtensionLearner;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wnb-learner-test-'));
    learner = new ExtensionLearner(testDir);
  });

  afterEach(() => {
    learner.flush();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('getCategory', () => {
    it('should return built-in category for known extensions', () => {
      expect(learner.getCategory('.jpg')).toBe('image');
      expect(learner.getCategory('.mp4')).toBe('video');
      expect(learner.getCategory('.mp3')).toBe('audio');
      expect(learner.getCategory('.zip')).toBe('archive');
    });

    it('should return other for unknown extensions', () => {
      expect(learner.getCategory('.xyz')).toBe('other');
      expect(learner.getCategory('.unknown')).toBe('other');
    });

    it('should return learned category after learning', () => {
      learner.learn('.xyz', 'video', 'Custom video format');
      expect(learner.getCategory('.xyz')).toBe('video');
    });

    it('should handle extensions with or without dot', () => {
      expect(learner.getCategory('jpg')).toBe('image');
      expect(learner.getCategory('.jpg')).toBe('image');
    });
  });

  describe('reportExtension', () => {
    it('should not report known extensions', () => {
      const isNew = learner.reportExtension('.jpg', '/path/to/file.jpg');
      expect(isNew).toBe(false);
    });

    it('should report unknown extensions as new', () => {
      const isNew = learner.reportExtension('.xyz', '/path/to/file.xyz');
      expect(isNew).toBe(true);
    });

    it('should not report same unknown extension twice as new', () => {
      const first = learner.reportExtension('.xyz', '/path/to/file1.xyz');
      const second = learner.reportExtension('.xyz', '/path/to/file2.xyz');
      expect(first).toBe(true);
      expect(second).toBe(false);
    });

    it('should track sample paths', () => {
      learner.reportExtension('.xyz', '/path/to/file1.xyz');
      learner.reportExtension('.xyz', '/path/to/file2.xyz');

      const unknowns = learner.getUnknownExtensions();
      const xyz = unknowns.find(u => u.extension === '.xyz');
      expect(xyz).toBeDefined();
      expect(xyz!.samplePaths).toContain('/path/to/file1.xyz');
      expect(xyz!.samplePaths).toContain('/path/to/file2.xyz');
    });

    it('should increment count for repeated extensions', () => {
      learner.reportExtension('.xyz', '/path/to/file1.xyz');
      learner.reportExtension('.xyz', '/path/to/file2.xyz');
      learner.reportExtension('.xyz', '/path/to/file3.xyz');

      const unknowns = learner.getUnknownExtensions();
      const xyz = unknowns.find(u => u.extension === '.xyz');
      expect(xyz!.count).toBe(3);
    });

    it('should limit sample paths to 5', () => {
      for (let i = 0; i < 10; i++) {
        learner.reportExtension('.xyz', `/path/to/file${i}.xyz`);
      }

      const unknowns = learner.getUnknownExtensions();
      const xyz = unknowns.find(u => u.extension === '.xyz');
      expect(xyz!.samplePaths.length).toBe(5);
    });
  });

  describe('learn', () => {
    it('should learn an extension category', () => {
      learner.learn('.xyz', 'video', 'Custom format');
      expect(learner.getCategory('.xyz')).toBe('video');
    });

    it('should remove from unknown after learning', () => {
      learner.reportExtension('.xyz', '/path/to/file.xyz');
      expect(learner.isUnknown('.xyz')).toBe(true);

      learner.learn('.xyz', 'video');
      expect(learner.isUnknown('.xyz')).toBe(false);
    });

    it('should persist learned extensions', () => {
      learner.learn('.xyz', 'video', 'Custom format');
      learner.flush();

      // Create new instance and verify persistence
      const learner2 = new ExtensionLearner(testDir);
      expect(learner2.getCategory('.xyz')).toBe('video');
    });
  });

  describe('autoLearn', () => {
    it('should auto-learn with lower confidence', () => {
      learner.autoLearn('.xyz', 'video', 0.7);

      const learned = learner.getLearnedExtensions();
      const xyz = learned.find(l => l.extension === '.xyz');
      expect(xyz).toBeDefined();
      expect(xyz!.learnedBy).toBe('auto');
      expect(xyz!.confidence).toBe(0.7);
    });

    it('should not override user learning with auto', () => {
      learner.learn('.xyz', 'audio');
      learner.autoLearn('.xyz', 'video', 0.9);

      expect(learner.getCategory('.xyz')).toBe('audio');
    });

    it('should cap auto confidence at 0.9', () => {
      learner.autoLearn('.xyz', 'video', 1.0);

      const learned = learner.getLearnedExtensions();
      const xyz = learned.find(l => l.extension === '.xyz');
      expect(xyz!.confidence).toBe(0.9);
    });
  });

  describe('forget', () => {
    it('should forget learned extensions', () => {
      learner.learn('.xyz', 'video');
      expect(learner.getCategory('.xyz')).toBe('video');

      learner.forget('.xyz');
      expect(learner.getCategory('.xyz')).toBe('other');
    });
  });

  describe('getUnknownExtensions', () => {
    it('should return empty array initially', () => {
      expect(learner.getUnknownExtensions()).toEqual([]);
    });

    it('should return sorted by count descending', () => {
      learner.reportExtension('.aaa', '/path/file.aaa');

      learner.reportExtension('.bbb', '/path/file1.bbb');
      learner.reportExtension('.bbb', '/path/file2.bbb');
      learner.reportExtension('.bbb', '/path/file3.bbb');

      learner.reportExtension('.ccc', '/path/file1.ccc');
      learner.reportExtension('.ccc', '/path/file2.ccc');

      const unknowns = learner.getUnknownExtensions();
      expect(unknowns[0].extension).toBe('.bbb');
      expect(unknowns[0].count).toBe(3);
      expect(unknowns[1].extension).toBe('.ccc');
      expect(unknowns[1].count).toBe(2);
      expect(unknowns[2].extension).toBe('.aaa');
      expect(unknowns[2].count).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      learner.reportExtension('.xyz', '/path/file.xyz');
      learner.reportExtension('.abc', '/path/file.abc');
      learner.learn('.custom1', 'video');
      learner.autoLearn('.custom2', 'audio', 0.8);

      const stats = learner.getStats();
      expect(stats.unknown).toBe(2);
      expect(stats.learned).toBe(2);
      expect(stats.userLearned).toBe(1);
      expect(stats.autoLearned).toBe(1);
    });
  });

  describe('isUnknown', () => {
    it('should return false for known extensions', () => {
      expect(learner.isUnknown('.jpg')).toBe(false);
      expect(learner.isUnknown('.mp4')).toBe(false);
    });

    it('should return true for unknown extensions', () => {
      expect(learner.isUnknown('.xyz')).toBe(true);
    });

    it('should return false for learned extensions', () => {
      learner.learn('.xyz', 'video');
      expect(learner.isUnknown('.xyz')).toBe(false);
    });
  });
});
