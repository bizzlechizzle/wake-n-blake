/**
 * Extension Learning Service
 *
 * Tracks unknown file extensions encountered during scanning.
 * Allows users to categorize unknowns, persists learned types.
 *
 * No ML needed - this is a simple feedback loop:
 * 1. Encounter unknown extension → log it
 * 2. User categorizes it → persist to learned.json
 * 3. Next encounter → use learned category
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { type MediaCategory, ALL_KNOWN_EXTENSIONS, getMediaCategory } from './media-types.js';

// =============================================================================
// TYPES
// =============================================================================

export interface UnknownExtension {
  extension: string;
  count: number;
  firstSeen: string;  // ISO date
  lastSeen: string;   // ISO date
  samplePaths: string[];  // Up to 5 examples
  suggestedCategory?: MediaCategory;  // ML/heuristic guess
}

export interface LearnedExtension {
  extension: string;
  category: MediaCategory;
  learnedAt: string;  // ISO date
  learnedBy: 'user' | 'auto';
  confidence: number;  // 0-1, 1 = user-confirmed
  notes?: string;
}

interface ExtensionDatabase {
  version: number;
  unknown: Record<string, UnknownExtension>;
  learned: Record<string, LearnedExtension>;
}

// =============================================================================
// EXTENSION LEARNER CLASS
// =============================================================================

export class ExtensionLearner {
  private db: ExtensionDatabase;
  private dbPath: string;
  private dirty = false;
  private saveDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(dataDir: string) {
    this.dbPath = path.join(dataDir, 'extension-types.json');
    this.db = this.load();
  }

  // ---------------------------------------------------------------------------
  // CORE API
  // ---------------------------------------------------------------------------

  /**
   * Get category for an extension (checks learned first, then built-in)
   */
  getCategory(ext: string): MediaCategory {
    const normalizedExt = this.normalize(ext);

    // Check learned first (user overrides)
    const learned = this.db.learned[normalizedExt];
    if (learned) {
      return learned.category;
    }

    // Check built-in
    return getMediaCategory(normalizedExt);
  }

  /**
   * Report an extension encountered during scanning
   * Returns true if this is a new unknown extension
   */
  reportExtension(ext: string, filePath: string): boolean {
    const normalizedExt = this.normalize(ext);

    // Skip if already known
    if (ALL_KNOWN_EXTENSIONS.has(normalizedExt) || this.db.learned[normalizedExt]) {
      return false;
    }

    const now = new Date().toISOString();
    const existing = this.db.unknown[normalizedExt];

    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      if (existing.samplePaths.length < 5 && !existing.samplePaths.includes(filePath)) {
        existing.samplePaths.push(filePath);
      }
    } else {
      this.db.unknown[normalizedExt] = {
        extension: normalizedExt,
        count: 1,
        firstSeen: now,
        lastSeen: now,
        samplePaths: [filePath],
        suggestedCategory: this.guessCategoryHeuristic(normalizedExt),
      };
    }

    this.markDirty();
    return !existing;
  }

  /**
   * Learn an extension category (user teaching)
   */
  learn(ext: string, category: MediaCategory, notes?: string): void {
    const normalizedExt = this.normalize(ext);

    this.db.learned[normalizedExt] = {
      extension: normalizedExt,
      category,
      learnedAt: new Date().toISOString(),
      learnedBy: 'user',
      confidence: 1.0,
      notes,
    };

    // Remove from unknown
    delete this.db.unknown[normalizedExt];

    this.markDirty();
    this.save(); // Immediate save for user actions
  }

  /**
   * Auto-learn (lower confidence, can be overridden)
   */
  autoLearn(ext: string, category: MediaCategory, confidence: number): void {
    const normalizedExt = this.normalize(ext);

    // Don't override user learning
    const existing = this.db.learned[normalizedExt];
    if (existing?.learnedBy === 'user') return;

    this.db.learned[normalizedExt] = {
      extension: normalizedExt,
      category,
      learnedAt: new Date().toISOString(),
      learnedBy: 'auto',
      confidence: Math.min(confidence, 0.9), // Cap auto at 0.9
    };

    delete this.db.unknown[normalizedExt];
    this.markDirty();
  }

  /**
   * Forget a learned extension (reset to unknown or built-in)
   */
  forget(ext: string): void {
    const normalizedExt = this.normalize(ext);
    delete this.db.learned[normalizedExt];
    this.markDirty();
    this.save();
  }

  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------

  /**
   * Get all unknown extensions, sorted by count descending
   */
  getUnknownExtensions(): UnknownExtension[] {
    return Object.values(this.db.unknown)
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get all learned extensions
   */
  getLearnedExtensions(): LearnedExtension[] {
    return Object.values(this.db.learned);
  }

  /**
   * Get statistics
   */
  getStats(): { unknown: number; learned: number; autoLearned: number; userLearned: number } {
    const learned = Object.values(this.db.learned);
    return {
      unknown: Object.keys(this.db.unknown).length,
      learned: learned.length,
      autoLearned: learned.filter(l => l.learnedBy === 'auto').length,
      userLearned: learned.filter(l => l.learnedBy === 'user').length,
    };
  }

  /**
   * Check if extension is unknown
   */
  isUnknown(ext: string): boolean {
    const normalizedExt = this.normalize(ext);
    return !ALL_KNOWN_EXTENSIONS.has(normalizedExt) && !this.db.learned[normalizedExt];
  }

  // ---------------------------------------------------------------------------
  // HEURISTICS (simple pattern matching, no ML)
  // ---------------------------------------------------------------------------

  private guessCategoryHeuristic(ext: string): MediaCategory | undefined {
    const lower = ext.toLowerCase();

    // Video-like patterns
    if (/^\.(vid|mov|clip|rec|cap)/.test(lower)) return 'video';
    if (/\d{3,4}p$/.test(lower)) return 'video';  // .1080p etc

    // Audio-like patterns
    if (/^\.(snd|aud|sfx|mus|vox)/.test(lower)) return 'audio';

    // Image-like patterns
    if (/^\.(img|pic|pho|tex)/.test(lower)) return 'image';

    // Archive-like patterns
    if (/^\.(z[0-9]+|part[0-9]+)$/.test(lower)) return 'archive';

    // Backup/temp patterns
    if (/\.(bak|tmp|temp|old|orig|backup)$/.test(lower)) return 'document';

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // PERSISTENCE
  // ---------------------------------------------------------------------------

  private normalize(ext: string): string {
    const lower = ext.toLowerCase();
    return lower.startsWith('.') ? lower : `.${lower}`;
  }

  private load(): ExtensionDatabase {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = fs.readFileSync(this.dbPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error(`Failed to load extension database: ${err}`);
    }

    return { version: 1, unknown: {}, learned: {} };
  }

  private markDirty(): void {
    this.dirty = true;

    // Debounced save (5 seconds)
    if (this.saveDebounce) clearTimeout(this.saveDebounce);
    this.saveDebounce = setTimeout(() => this.save(), 5000);
  }

  save(): void {
    if (!this.dirty) return;

    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2));
      this.dirty = false;
    } catch (err) {
      console.error(`Failed to save extension database: ${err}`);
    }
  }

  /**
   * Force save (call on app shutdown)
   */
  flush(): void {
    if (this.saveDebounce) {
      clearTimeout(this.saveDebounce);
      this.saveDebounce = null;
    }
    this.save();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let instance: ExtensionLearner | null = null;

export function getExtensionLearner(dataDir?: string): ExtensionLearner {
  if (!instance) {
    if (!dataDir) {
      throw new Error('ExtensionLearner requires dataDir on first initialization');
    }
    instance = new ExtensionLearner(dataDir);
  }
  return instance;
}
