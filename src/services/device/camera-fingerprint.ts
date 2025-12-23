/**
 * Camera Fingerprinting Service
 *
 * Identifies the source camera/device from file metadata and naming patterns.
 * Uses the comprehensive camera signature database from nightfoxfilms.
 *
 * Benefits:
 * - Auto-categorization (cinema vs consumer vs drone)
 * - Expected sidecar patterns (DJI=SRT, Sony=XML)
 * - Processing hints (deinterlace dadcam footage)
 * - Quality tier inference
 * - GPS/telemetry handling differences
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { minimatch } from 'minimatch';

// =============================================================================
// TYPES
// =============================================================================

/** Camera category classification */
export type CameraCategory =
  | 'cinema'       // RED, ARRI, Blackmagic, Sony Cinema Line
  | 'professional' // Sony A7S, Nikon Z8, broadcast cameras
  | 'prosumer'     // GH5, Canon R6, semi-pro
  | 'consumer'     // Handycams, point-and-shoot
  | 'action'       // GoPro, Insta360, action cameras
  | 'drone'        // DJI, drone-mounted cameras
  | 'smartphone'   // iPhone, Pixel, Samsung
  | 'scanner'      // Film scanners (Super8, slides)
  | 'webcam'       // Webcams, screen capture
  | 'unknown';

/** Media era classification */
export type MediaEra = 'modern' | 'dadcam' | 'super8';

/** Camera signature from database */
export interface CameraSignature {
  id: string;
  make: string;
  model: string;
  model_variants: string[];
  category: CameraCategory;
  medium: MediaEra;
  year_released?: number | null;
  matching: {
    exif_make?: string[];
    exif_model?: string[];
    filename_patterns?: string[];
    folder_patterns?: string[];
  };
  technical?: {
    sensor_width_mm?: number | null;
    sensor_height_mm?: number | null;
    max_resolution?: string | null;
    native_codec?: string | null;
  };
  processing?: {
    deinterlace?: boolean;
    audio_channels?: 'stereo' | 'mono' | 'none';
    suggested_lut?: string | null;
  };
  source: 'exiftool' | 'openmvg' | 'manual' | 'user';
  verified: boolean;
}

/** Match result with confidence */
export interface CameraMatch {
  camera: CameraSignature;
  matchedBy: 'exif' | 'filename' | 'folder' | 'heuristic';
  confidence: number;  // 0-1
}

/** Metadata used for matching */
export interface FileMetadata {
  make?: string | null;
  model?: string | null;
  filename?: string;
  folderPath?: string;
  width?: number | null;
  height?: number | null;
  codec?: string | null;
}

// =============================================================================
// CAMERA DATABASE
// =============================================================================

interface CameraDatabase {
  version: string;
  camera_count: number;
  cameras: CameraSignature[];
}

// Build indexes for fast lookup
interface CameraIndex {
  byMake: Map<string, CameraSignature[]>;        // lowercase make -> cameras
  byModel: Map<string, CameraSignature[]>;       // lowercase model variant -> cameras
  byMakeModel: Map<string, CameraSignature>;     // "make|model" -> camera
  withFilenamePatterns: CameraSignature[];
  withFolderPatterns: CameraSignature[];
}

// =============================================================================
// CAMERA FINGERPRINTER
// =============================================================================

export class CameraFingerprinter {
  private db: CameraDatabase | null = null;
  private index: CameraIndex | null = null;
  private userCameras: CameraSignature[] = [];
  private userDbPath: string;

  constructor(private dataDir: string) {
    this.userDbPath = path.join(dataDir, 'user-cameras.json');
  }

  /**
   * Load camera database (call once at startup)
   */
  async loadDatabase(dbPath?: string): Promise<void> {
    // Try to load from provided path or bundled location
    const searchPaths = [
      dbPath,
      path.join(this.dataDir, 'camera-signatures.json'),
      path.join(__dirname, '../../../data/camera-signatures.json'),
    ].filter(Boolean) as string[];

    for (const p of searchPaths) {
      try {
        if (fs.existsSync(p)) {
          const data = fs.readFileSync(p, 'utf8');
          this.db = JSON.parse(data);
          this.buildIndex();
          console.log(`Loaded ${this.db!.camera_count} camera signatures from ${p}`);
          break;
        }
      } catch (err) {
        console.warn(`Failed to load camera database from ${p}:`, err);
      }
    }

    // Load user-defined cameras
    this.loadUserCameras();
  }

  /**
   * Match a file to a camera
   */
  match(metadata: FileMetadata): CameraMatch | null {
    if (!this.index) return null;

    // 1. Try EXIF make+model match (highest confidence)
    if (metadata.make && metadata.model) {
      const camera = this.matchExif(metadata.make, metadata.model);
      if (camera) {
        return { camera, matchedBy: 'exif', confidence: 0.95 };
      }
    }

    // 2. Try filename pattern match
    if (metadata.filename) {
      const camera = this.matchFilename(metadata.filename);
      if (camera) {
        return { camera, matchedBy: 'filename', confidence: 0.8 };
      }
    }

    // 3. Try folder pattern match
    if (metadata.folderPath) {
      const camera = this.matchFolder(metadata.folderPath);
      if (camera) {
        return { camera, matchedBy: 'folder', confidence: 0.7 };
      }
    }

    // 4. Heuristic based on resolution/codec
    if (metadata.width && metadata.height) {
      const era = this.detectEra(metadata.width, metadata.height, metadata.codec);
      return {
        camera: this.createUnknownCamera(era, metadata),
        matchedBy: 'heuristic',
        confidence: 0.3,
      };
    }

    return null;
  }

  /**
   * Get expected sidecar patterns for a camera
   */
  getExpectedSidecars(camera: CameraSignature): string[] {
    const sidecars: string[] = ['.xmp']; // Universal

    switch (camera.make.toLowerCase()) {
      case 'dji':
        sidecars.push('.srt'); // Telemetry
        break;
      case 'gopro':
        sidecars.push('.thm', '.lrv'); // Thumbnail, low-res video
        break;
      case 'sony':
        if (camera.category === 'cinema' || camera.category === 'professional') {
          sidecars.push('.xml'); // Sony XML sidecar
        }
        if (camera.model.includes('HDR') || camera.model.includes('DCR')) {
          sidecars.push('.moi', '.mpl'); // AVCHD
        }
        break;
      case 'canon':
        sidecars.push('.thm');
        if (camera.category === 'cinema') {
          sidecars.push('.cif'); // Canon info file
        }
        break;
      case 'red':
        sidecars.push('.rmd'); // RED metadata
        break;
      case 'blackmagic':
        sidecars.push('.sidecar');
        break;
      case 'arri':
        sidecars.push('.ale', '.xml');
        break;
      case 'apple':
        sidecars.push('.aae'); // iOS adjustments
        break;
    }

    return sidecars;
  }

  /**
   * Should this camera's footage be deinterlaced?
   */
  needsDeinterlace(camera: CameraSignature): boolean {
    // Check explicit flag
    if (camera.processing?.deinterlace) return true;

    // Dadcam era footage often interlaced
    if (camera.medium === 'dadcam') return true;

    // Consumer camcorders from certain era
    if (camera.category === 'consumer' && camera.year_released && camera.year_released < 2015) {
      return true;
    }

    return false;
  }

  /**
   * Get quality tier for sorting/grouping
   */
  getQualityTier(camera: CameraSignature): 'pro' | 'prosumer' | 'consumer' | 'legacy' {
    if (camera.medium === 'dadcam' || camera.medium === 'super8') return 'legacy';
    if (camera.category === 'cinema' || camera.category === 'professional') return 'pro';
    if (camera.category === 'prosumer') return 'prosumer';
    return 'consumer';
  }

  // ---------------------------------------------------------------------------
  // USER LEARNING
  // ---------------------------------------------------------------------------

  /**
   * Learn a new camera from user input
   */
  learnCamera(camera: Omit<CameraSignature, 'id' | 'source' | 'verified'>): CameraSignature {
    const newCamera: CameraSignature = {
      ...camera,
      id: this.generateId(camera.make, camera.model),
      source: 'user',
      verified: true,
    };

    this.userCameras.push(newCamera);
    this.saveUserCameras();
    this.rebuildIndex();

    return newCamera;
  }

  /**
   * Get all user-defined cameras
   */
  getUserCameras(): CameraSignature[] {
    return [...this.userCameras];
  }

  // ---------------------------------------------------------------------------
  // PRIVATE: MATCHING
  // ---------------------------------------------------------------------------

  private matchExif(make: string, model: string): CameraSignature | null {
    if (!this.index) return null;

    const normalizedMake = make.toLowerCase().trim();
    const normalizedModel = model.toLowerCase().trim();

    // Try exact make+model key
    const key = `${normalizedMake}|${normalizedModel}`;
    if (this.index.byMakeModel.has(key)) {
      return this.index.byMakeModel.get(key)!;
    }

    // Try matching model variants
    const byModel = this.index.byModel.get(normalizedModel);
    if (byModel) {
      // Filter by make if possible
      const withMake = byModel.filter(c =>
        c.matching.exif_make?.some(m => normalizedMake.includes(m.toLowerCase()))
      );
      if (withMake.length > 0) return withMake[0];
      return byModel[0];
    }

    // Fuzzy match on make
    const byMake = this.index.byMake.get(normalizedMake);
    if (byMake) {
      // Find camera where model contains our model string
      const match = byMake.find(c =>
        c.model_variants.some(v => normalizedModel.includes(v.toLowerCase()))
      );
      if (match) return match;
    }

    return null;
  }

  private matchFilename(filename: string): CameraSignature | null {
    if (!this.index) return null;

    for (const camera of this.index.withFilenamePatterns) {
      for (const pattern of camera.matching.filename_patterns || []) {
        if (this.matchPattern(filename, pattern)) {
          return camera;
        }
      }
    }
    return null;
  }

  private matchFolder(folderPath: string): CameraSignature | null {
    if (!this.index) return null;

    const folderName = path.basename(folderPath);
    const fullPath = folderPath.toLowerCase();

    for (const camera of this.index.withFolderPatterns) {
      for (const pattern of camera.matching.folder_patterns || []) {
        if (this.matchPattern(folderName, pattern) ||
            fullPath.includes(pattern.toLowerCase().replace(/\*/g, ''))) {
          return camera;
        }
      }
    }
    return null;
  }

  private matchPattern(str: string, pattern: string): boolean {
    if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
      return minimatch(str, pattern, { nocase: true });
    }
    return str.toLowerCase().includes(pattern.toLowerCase());
  }

  // ---------------------------------------------------------------------------
  // PRIVATE: HEURISTICS
  // ---------------------------------------------------------------------------

  private detectEra(width: number, height: number, _codec?: string | null): MediaEra {
    const resolution = Math.max(width, height);
    const aspectRatio = width / height;

    // Super8: very low res, often 4:3
    if (resolution < 480 && Math.abs(aspectRatio - 4/3) < 0.1) {
      return 'super8';
    }

    // Dadcam: SD resolution
    if (resolution < 720) {
      return 'dadcam';
    }

    return 'modern';
  }

  private createUnknownCamera(era: MediaEra, metadata: FileMetadata): CameraSignature {
    return {
      id: 'unknown',
      make: metadata.make || 'Unknown',
      model: metadata.model || 'Unknown',
      model_variants: [],
      category: 'unknown',
      medium: era,
      matching: {},
      processing: {
        deinterlace: era === 'dadcam',
        audio_channels: 'stereo',
      },
      source: 'manual',
      verified: false,
    };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE: INDEXING
  // ---------------------------------------------------------------------------

  private buildIndex(): void {
    if (!this.db) return;

    const allCameras = [...this.db.cameras, ...this.userCameras];

    this.index = {
      byMake: new Map(),
      byModel: new Map(),
      byMakeModel: new Map(),
      withFilenamePatterns: [],
      withFolderPatterns: [],
    };

    for (const camera of allCameras) {
      // Index by make
      for (const make of camera.matching.exif_make || [camera.make]) {
        const key = make.toLowerCase();
        if (!this.index.byMake.has(key)) {
          this.index.byMake.set(key, []);
        }
        this.index.byMake.get(key)!.push(camera);
      }

      // Index by model variants
      for (const model of camera.model_variants) {
        const key = model.toLowerCase();
        if (!this.index.byModel.has(key)) {
          this.index.byModel.set(key, []);
        }
        this.index.byModel.get(key)!.push(camera);

        // Also index make|model combo
        for (const make of camera.matching.exif_make || [camera.make]) {
          const comboKey = `${make.toLowerCase()}|${key}`;
          this.index.byMakeModel.set(comboKey, camera);
        }
      }

      // Index patterns
      if (camera.matching.filename_patterns?.length) {
        this.index.withFilenamePatterns.push(camera);
      }
      if (camera.matching.folder_patterns?.length) {
        this.index.withFolderPatterns.push(camera);
      }
    }
  }

  private rebuildIndex(): void {
    this.buildIndex();
  }

  // ---------------------------------------------------------------------------
  // PRIVATE: PERSISTENCE
  // ---------------------------------------------------------------------------

  private loadUserCameras(): void {
    try {
      if (fs.existsSync(this.userDbPath)) {
        const data = fs.readFileSync(this.userDbPath, 'utf8');
        this.userCameras = JSON.parse(data);
        console.log(`Loaded ${this.userCameras.length} user-defined cameras`);
      }
    } catch (err) {
      console.warn('Failed to load user cameras:', err);
      this.userCameras = [];
    }
  }

  private saveUserCameras(): void {
    try {
      const dir = path.dirname(this.userDbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.userDbPath, JSON.stringify(this.userCameras, null, 2));
    } catch (err) {
      console.error('Failed to save user cameras:', err);
    }
  }

  private generateId(make: string, model: string): string {
    const base = `user-${make}-${model}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `${base}-${Date.now()}`;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: CameraFingerprinter | null = null;

export function getCameraFingerprinter(dataDir?: string): CameraFingerprinter {
  if (!instance) {
    if (!dataDir) {
      throw new Error('CameraFingerprinter requires dataDir on first init');
    }
    instance = new CameraFingerprinter(dataDir);
  }
  return instance;
}
