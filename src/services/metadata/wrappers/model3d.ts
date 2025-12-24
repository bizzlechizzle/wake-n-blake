/**
 * 3D Model Analysis Wrapper
 *
 * Analyzes 3D model files (GLB, GLTF, OBJ).
 * Uses gltf-transform CLI for GLTF/GLB, and Python trimesh for others.
 *
 * Install:
 *   npm install -g @gltf-transform/cli
 *   pip install trimesh
 *
 * @module services/metadata/wrappers/model3d
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * 3D model analysis result
 */
export interface Model3DResult {
  /** Model format */
  format: 'glb' | 'gltf' | 'obj' | 'fbx' | 'stl' | 'dae' | 'other';
  /** Total vertex count */
  vertexCount: number;
  /** Total face/triangle count */
  faceCount: number;
  /** Number of meshes */
  meshCount: number;
  /** Number of materials */
  materialCount: number;
  /** Number of textures */
  textureCount: number;
  /** Number of animations */
  animationCount: number;
  /** Bounding box dimensions */
  boundingBox?: {
    width: number;
    height: number;
    depth: number;
  };
  /** Whether model has normals */
  hasNormals?: boolean;
  /** Whether model has UV coordinates */
  hasUVs?: boolean;
  /** Whether model has vertex colors */
  hasVertexColors?: boolean;
  /** Whether model has skeleton/armature */
  hasSkeleton?: boolean;
  /** Number of bones (if skeleton) */
  boneCount?: number;
  /** Scene hierarchy depth */
  sceneDepth?: number;
  /** Generator/exporter used */
  generator?: string;
  /** Asset version */
  assetVersion?: string;
  /** File size in bytes */
  fileSize?: number;
}

// Common paths for gltf-transform
const GLTF_TRANSFORM_PATHS = [
  process.env.GLTF_TRANSFORM_PATH,
  '/opt/homebrew/bin/gltf-transform',
  '/usr/local/bin/gltf-transform',
  `${process.env.HOME}/.npm-global/bin/gltf-transform`,
].filter(Boolean) as string[];

let gltfTransformPath: string | null | undefined = undefined;
let hasTrimesh: boolean | undefined;

/**
 * Find gltf-transform binary
 */
async function findGltfTransform(): Promise<string | null> {
  if (gltfTransformPath !== undefined) return gltfTransformPath;

  for (const p of GLTF_TRANSFORM_PATHS) {
    try {
      await fsp.access(p, fs.constants.X_OK);
      gltfTransformPath = p;
      return p;
    } catch {
      // Continue
    }
  }

  // Try npx
  try {
    await execFileAsync('npx', ['--yes', 'gltf-transform', '--version'], { timeout: 10000 });
    gltfTransformPath = 'npx';
    return 'npx';
  } catch {
    // Not available
  }

  gltfTransformPath = null;
  return null;
}

/**
 * Check if trimesh is available
 */
async function checkTrimesh(): Promise<boolean> {
  if (hasTrimesh !== undefined) return hasTrimesh;

  try {
    await execFileAsync('python3', ['-c', 'import trimesh'], { timeout: 5000 });
    hasTrimesh = true;
  } catch {
    hasTrimesh = false;
  }
  return hasTrimesh;
}

/**
 * Check if 3D model analysis is available
 */
export async function isModel3DAvailable(format?: string): Promise<boolean> {
  if (!format || format === 'glb' || format === 'gltf') {
    if (await findGltfTransform()) return true;
  }

  return checkTrimesh();
}

/**
 * Analyze GLTF/GLB using gltf-transform
 */
async function analyzeGltf(filePath: string): Promise<Model3DResult | undefined> {
  const gltfTransform = await findGltfTransform();
  if (!gltfTransform) return undefined;

  const ext = path.extname(filePath).toLowerCase();
  const format = ext === '.glb' ? 'glb' : 'gltf';

  try {
    // Use gltf-transform inspect
    const args = gltfTransform === 'npx'
      ? ['--yes', 'gltf-transform', 'inspect', filePath]
      : ['inspect', filePath];

    const cmd = gltfTransform === 'npx' ? 'npx' : gltfTransform;
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    });

    // Parse inspect output
    const result: Model3DResult = {
      format,
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      materialCount: 0,
      textureCount: 0,
      animationCount: 0,
    };

    // Parse lines like "Meshes: 5" or "Vertices: 12345"
    const meshMatch = stdout.match(/meshes?:\s*(\d+)/i);
    if (meshMatch) result.meshCount = parseInt(meshMatch[1], 10);

    const vertexMatch = stdout.match(/vertices?:\s*(\d+)/i);
    if (vertexMatch) result.vertexCount = parseInt(vertexMatch[1], 10);

    const triangleMatch = stdout.match(/(?:triangles?|faces?):\s*(\d+)/i);
    if (triangleMatch) result.faceCount = parseInt(triangleMatch[1], 10);

    const materialMatch = stdout.match(/materials?:\s*(\d+)/i);
    if (materialMatch) result.materialCount = parseInt(materialMatch[1], 10);

    const textureMatch = stdout.match(/textures?:\s*(\d+)/i);
    if (textureMatch) result.textureCount = parseInt(textureMatch[1], 10);

    const animationMatch = stdout.match(/animations?:\s*(\d+)/i);
    if (animationMatch) result.animationCount = parseInt(animationMatch[1], 10);

    const skinMatch = stdout.match(/skins?:\s*(\d+)/i);
    if (skinMatch) {
      result.hasSkeleton = parseInt(skinMatch[1], 10) > 0;
    }

    // Get file size
    const stats = await fsp.stat(filePath);
    result.fileSize = stats.size;

    return result;
  } catch {
    return undefined;
  }
}

/**
 * Analyze model using Python trimesh
 */
async function analyzeTrimesh(filePath: string): Promise<Model3DResult | undefined> {
  if (!(await checkTrimesh())) return undefined;

  const script = `
import sys
import json
import trimesh

try:
    scene = trimesh.load(sys.argv[1])

    result = {
        'vertexCount': 0,
        'faceCount': 0,
        'meshCount': 0,
        'materialCount': 0,
        'textureCount': 0,
        'animationCount': 0
    }

    if isinstance(scene, trimesh.Trimesh):
        # Single mesh
        result['vertexCount'] = len(scene.vertices)
        result['faceCount'] = len(scene.faces)
        result['meshCount'] = 1
        result['hasNormals'] = scene.vertex_normals is not None
        result['hasUVs'] = scene.visual.uv is not None if hasattr(scene.visual, 'uv') else False

        if scene.bounds is not None:
            bounds = scene.bounds
            result['boundingBox'] = {
                'width': float(bounds[1][0] - bounds[0][0]),
                'height': float(bounds[1][1] - bounds[0][1]),
                'depth': float(bounds[1][2] - bounds[0][2])
            }

    elif isinstance(scene, trimesh.Scene):
        # Multi-mesh scene
        meshes = list(scene.geometry.values())
        result['meshCount'] = len(meshes)

        total_verts = 0
        total_faces = 0
        for mesh in meshes:
            if hasattr(mesh, 'vertices'):
                total_verts += len(mesh.vertices)
            if hasattr(mesh, 'faces'):
                total_faces += len(mesh.faces)

        result['vertexCount'] = total_verts
        result['faceCount'] = total_faces

        if scene.bounds is not None:
            bounds = scene.bounds
            result['boundingBox'] = {
                'width': float(bounds[1][0] - bounds[0][0]),
                'height': float(bounds[1][1] - bounds[0][1]),
                'depth': float(bounds[1][2] - bounds[0][2])
            }

    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

  const ext = path.extname(filePath).toLowerCase();

  try {
    const { stdout } = await execFileAsync('python3', ['-c', script, filePath], {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.error) return undefined;

    // Get file size
    const stats = await fsp.stat(filePath);

    return {
      format: getFormat(ext),
      vertexCount: result.vertexCount,
      faceCount: result.faceCount,
      meshCount: result.meshCount,
      materialCount: result.materialCount,
      textureCount: result.textureCount,
      animationCount: result.animationCount,
      boundingBox: result.boundingBox,
      hasNormals: result.hasNormals,
      hasUVs: result.hasUVs,
      fileSize: stats.size,
    };
  } catch {
    return undefined;
  }
}

/**
 * Get format from extension
 */
function getFormat(ext: string): Model3DResult['format'] {
  switch (ext.toLowerCase()) {
    case '.glb': return 'glb';
    case '.gltf': return 'gltf';
    case '.obj': return 'obj';
    case '.fbx': return 'fbx';
    case '.stl': return 'stl';
    case '.dae': return 'dae';
    default: return 'other';
  }
}

/**
 * Analyze a 3D model file
 *
 * @param filePath - Path to 3D model file
 * @returns Analysis result or undefined if analysis failed
 */
export async function analyze(filePath: string): Promise<Model3DResult | undefined> {
  const ext = path.extname(filePath).toLowerCase();

  // Try gltf-transform for GLTF/GLB
  if (ext === '.glb' || ext === '.gltf') {
    const gltfResult = await analyzeGltf(filePath);
    if (gltfResult) return gltfResult;
  }

  // Fall back to trimesh
  return analyzeTrimesh(filePath);
}

/**
 * Convert result to XMP rawMetadata format with Model3D_ prefix
 */
export function toRawMetadata(result: Model3DResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'Model3D_Format': result.format.toUpperCase(),
    'Model3D_VertexCount': result.vertexCount,
    'Model3D_FaceCount': result.faceCount,
    'Model3D_MeshCount': result.meshCount,
    'Model3D_MaterialCount': result.materialCount,
    'Model3D_TextureCount': result.textureCount,
    'Model3D_AnimationCount': result.animationCount,
  };

  if (result.boundingBox) {
    metadata['Model3D_BBoxWidth'] = Math.round(result.boundingBox.width * 1000) / 1000;
    metadata['Model3D_BBoxHeight'] = Math.round(result.boundingBox.height * 1000) / 1000;
    metadata['Model3D_BBoxDepth'] = Math.round(result.boundingBox.depth * 1000) / 1000;
  }

  if (result.hasNormals !== undefined) {
    metadata['Model3D_HasNormals'] = result.hasNormals;
  }

  if (result.hasUVs !== undefined) {
    metadata['Model3D_HasUVs'] = result.hasUVs;
  }

  if (result.hasVertexColors !== undefined) {
    metadata['Model3D_HasVertexColors'] = result.hasVertexColors;
  }

  if (result.hasSkeleton !== undefined) {
    metadata['Model3D_HasSkeleton'] = result.hasSkeleton;
  }

  if (result.boneCount !== undefined) {
    metadata['Model3D_BoneCount'] = result.boneCount;
  }

  if (result.generator) {
    metadata['Model3D_Generator'] = result.generator;
  }

  if (result.fileSize) {
    metadata['Model3D_FileSize'] = result.fileSize;
  }

  // Complexity indicator
  const complexity =
    result.vertexCount < 1000 ? 'Low' :
    result.vertexCount < 50000 ? 'Medium' :
    result.vertexCount < 500000 ? 'High' : 'Very High';
  metadata['Model3D_Complexity'] = complexity;

  return metadata;
}

/**
 * Get available tools for 3D model analysis
 */
export async function getAvailableTools(): Promise<string[]> {
  const tools: string[] = [];

  if (await findGltfTransform()) {
    tools.push('gltf-transform');
  }

  if (await checkTrimesh()) {
    tools.push('trimesh');
  }

  return tools;
}
