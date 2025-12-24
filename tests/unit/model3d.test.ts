/**
 * 3D Model Analysis Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { model3d } from '../../src/services/metadata/index.js';

function checkToolAvailable(tool: string): boolean {
  try {
    execSync(`which ${tool}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkPythonLibAvailable(lib: string): boolean {
  try {
    execSync(`python3 -c "import ${lib}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasGltfTransform = checkToolAvailable('gltf-transform');
const hasTrimesh = checkPythonLibAvailable('trimesh');
const hasAnyTool = hasGltfTransform || hasTrimesh;

describe('3D Model Analysis', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-model3d-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isModel3DAvailable', () => {
    it('should correctly detect tool availability', async () => {
      const available = await model3d.isModel3DAvailable();
      expect(typeof available).toBe('boolean');
      expect(available).toBe(hasAnyTool);
    });
  });

  describe('getAvailableTools', () => {
    it('should return array of available tools', async () => {
      const tools = await model3d.getAvailableTools();
      expect(Array.isArray(tools)).toBe(true);

      if (hasGltfTransform) {
        expect(tools).toContain('gltf-transform');
      }
      if (hasTrimesh) {
        expect(tools).toContain('trimesh');
      }
    });
  });

  describe('analyze', () => {
    it('should return undefined for non-existent files', async () => {
      const result = await model3d.analyze('/nonexistent/file.glb');
      expect(result).toBeUndefined();
    });

    it('should return undefined when no tools available', async () => {
      if (hasAnyTool) {
        return; // Skip if tools are available
      }
      const result = await model3d.analyze(path.join(tempDir, 'test.glb'));
      expect(result).toBeUndefined();
    });
  });

  describe('toRawMetadata', () => {
    it('should convert result to prefixed key-value pairs', () => {
      const result: model3d.Model3DResult = {
        format: 'glb',
        vertexCount: 10000,
        faceCount: 5000,
        meshCount: 5,
        materialCount: 3,
        textureCount: 4,
        animationCount: 2,
        boundingBox: {
          width: 2.5,
          height: 3.0,
          depth: 1.5,
        },
        hasNormals: true,
        hasUVs: true,
        hasSkeleton: true,
        boneCount: 50,
        fileSize: 1024000,
      };

      const metadata = model3d.toRawMetadata(result);

      expect(metadata['Model3D_Format']).toBe('GLB');
      expect(metadata['Model3D_VertexCount']).toBe(10000);
      expect(metadata['Model3D_FaceCount']).toBe(5000);
      expect(metadata['Model3D_MeshCount']).toBe(5);
      expect(metadata['Model3D_MaterialCount']).toBe(3);
      expect(metadata['Model3D_TextureCount']).toBe(4);
      expect(metadata['Model3D_AnimationCount']).toBe(2);
      expect(metadata['Model3D_BBoxWidth']).toBe(2.5);
      expect(metadata['Model3D_BBoxHeight']).toBe(3.0);
      expect(metadata['Model3D_BBoxDepth']).toBe(1.5);
      expect(metadata['Model3D_HasNormals']).toBe(true);
      expect(metadata['Model3D_HasUVs']).toBe(true);
      expect(metadata['Model3D_HasSkeleton']).toBe(true);
      expect(metadata['Model3D_BoneCount']).toBe(50);
      expect(metadata['Model3D_FileSize']).toBe(1024000);
    });

    it('should calculate complexity indicator', () => {
      const lowResult: model3d.Model3DResult = {
        format: 'obj',
        vertexCount: 500,
        faceCount: 200,
        meshCount: 1,
        materialCount: 1,
        textureCount: 0,
        animationCount: 0,
      };

      const highResult: model3d.Model3DResult = {
        format: 'glb',
        vertexCount: 100000,
        faceCount: 50000,
        meshCount: 10,
        materialCount: 5,
        textureCount: 8,
        animationCount: 3,
      };

      const lowMeta = model3d.toRawMetadata(lowResult);
      const highMeta = model3d.toRawMetadata(highResult);

      expect(lowMeta['Model3D_Complexity']).toBe('Low');
      expect(highMeta['Model3D_Complexity']).toBe('High');
    });

    it('should handle OBJ format', () => {
      const result: model3d.Model3DResult = {
        format: 'obj',
        vertexCount: 5000,
        faceCount: 2500,
        meshCount: 1,
        materialCount: 0,
        textureCount: 0,
        animationCount: 0,
      };

      const metadata = model3d.toRawMetadata(result);

      expect(metadata['Model3D_Format']).toBe('OBJ');
      expect(metadata['Model3D_Complexity']).toBe('Medium');
    });
  });
});
