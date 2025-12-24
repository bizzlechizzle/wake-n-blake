/**
 * Geospatial Data Wrapper
 *
 * Extracts metadata from geospatial files (GPX, KML, GeoJSON).
 * Uses GDAL ogrinfo CLI for robust parsing.
 *
 * Install:
 *   macOS:   brew install gdal
 *   Linux:   apt install gdal-bin
 *   Windows: OSGeo4W installer
 *
 * Fallback: Pure Python parsing for common formats
 *
 * @module services/metadata/wrappers/geospatial
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Geospatial metadata result
 */
export interface GeospatialResult {
  /** Format detected */
  format: 'gpx' | 'kml' | 'kmz' | 'geojson' | 'fit' | 'tcx' | 'other';
  /** Number of features */
  featureCount: number;
  /** Bounding box */
  boundingBox?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  /** Number of tracks (GPX) */
  trackCount?: number;
  /** Number of waypoints */
  waypointCount?: number;
  /** Number of routes (GPX) */
  routeCount?: number;
  /** Total distance in meters */
  totalDistance?: number;
  /** Total duration in seconds */
  totalDuration?: number;
  /** Date range */
  dateRange?: {
    earliest: string;
    latest: string;
  };
  /** Elevation range */
  elevationRange?: {
    min: number;
    max: number;
  };
  /** Coordinate reference system */
  crs?: string;
  /** Layer names (if multi-layer) */
  layers?: string[];
  /** Geometry types present */
  geometryTypes?: string[];
  /** File creator/source */
  creator?: string;
}

// Common installation paths for ogrinfo
const OGRINFO_PATHS = [
  process.env.OGRINFO_PATH,
  '/opt/homebrew/bin/ogrinfo',
  '/usr/local/bin/ogrinfo',
  '/usr/bin/ogrinfo',
  '/Library/Frameworks/GDAL.framework/Programs/ogrinfo',
].filter(Boolean) as string[];

let ogrinfoPath: string | null | undefined = undefined;

/**
 * Find ogrinfo binary
 */
export async function findOgrinfo(): Promise<string | null> {
  if (ogrinfoPath !== undefined) return ogrinfoPath;

  for (const p of OGRINFO_PATHS) {
    try {
      await fsp.access(p, fs.constants.X_OK);
      ogrinfoPath = p;
      return p;
    } catch {
      // Continue
    }
  }

  // Fallback: search PATH
  try {
    const { stdout } = await execFileAsync('which', ['ogrinfo']);
    const foundPath = stdout.trim();
    if (foundPath) {
      ogrinfoPath = foundPath;
      return foundPath;
    }
  } catch {
    // Not in PATH
  }

  ogrinfoPath = null;
  return null;
}

/**
 * Check if geospatial extraction is available
 */
export async function isGeospatialAvailable(): Promise<boolean> {
  const ogrinfo = await findOgrinfo();
  if (ogrinfo) return true;

  // Fallback: check for Python xml.etree for GPX/KML
  try {
    await execFileAsync('python3', ['-c', 'import xml.etree.ElementTree'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse GPX file using Python
 */
async function parseGpxPython(filePath: string): Promise<GeospatialResult | undefined> {
  const script = `
import sys
import json
import xml.etree.ElementTree as ET
from datetime import datetime

try:
    tree = ET.parse(sys.argv[1])
    root = tree.getroot()

    # Handle namespace
    ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
    if root.tag.startswith('{'):
        ns['gpx'] = root.tag.split('}')[0][1:]

    # Count features
    tracks = root.findall('.//gpx:trk', ns) or root.findall('.//trk')
    waypoints = root.findall('.//gpx:wpt', ns) or root.findall('.//wpt')
    routes = root.findall('.//gpx:rte', ns) or root.findall('.//rte')

    # Get all points for bounding box
    all_points = []
    times = []
    elevations = []

    for wpt in waypoints:
        lat = float(wpt.get('lat', 0))
        lon = float(wpt.get('lon', 0))
        all_points.append((lat, lon))
        ele = wpt.find('gpx:ele', ns) or wpt.find('ele')
        if ele is not None and ele.text:
            elevations.append(float(ele.text))
        time = wpt.find('gpx:time', ns) or wpt.find('time')
        if time is not None and time.text:
            times.append(time.text)

    for trk in tracks:
        for seg in (trk.findall('.//gpx:trkseg', ns) or trk.findall('.//trkseg')):
            for trkpt in (seg.findall('gpx:trkpt', ns) or seg.findall('trkpt')):
                lat = float(trkpt.get('lat', 0))
                lon = float(trkpt.get('lon', 0))
                all_points.append((lat, lon))
                ele = trkpt.find('gpx:ele', ns) or trkpt.find('ele')
                if ele is not None and ele.text:
                    elevations.append(float(ele.text))
                time = trkpt.find('gpx:time', ns) or trkpt.find('time')
                if time is not None and time.text:
                    times.append(time.text)

    result = {
        'format': 'gpx',
        'featureCount': len(tracks) + len(waypoints) + len(routes),
        'trackCount': len(tracks),
        'waypointCount': len(waypoints),
        'routeCount': len(routes),
    }

    if all_points:
        lats = [p[0] for p in all_points]
        lons = [p[1] for p in all_points]
        result['boundingBox'] = {
            'minLat': min(lats),
            'maxLat': max(lats),
            'minLon': min(lons),
            'maxLon': max(lons)
        }

    if elevations:
        result['elevationRange'] = {
            'min': min(elevations),
            'max': max(elevations)
        }

    if times:
        times.sort()
        result['dateRange'] = {
            'earliest': times[0],
            'latest': times[-1]
        }

    # Get creator
    metadata = root.find('gpx:metadata', ns) or root.find('metadata')
    if metadata is not None:
        creator_elem = metadata.find('gpx:author', ns) or metadata.find('author')
        if creator_elem is not None:
            name = creator_elem.find('gpx:name', ns) or creator_elem.find('name')
            if name is not None and name.text:
                result['creator'] = name.text
    if 'creator' not in result and root.get('creator'):
        result['creator'] = root.get('creator')

    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', script, filePath], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.error) return undefined;

    return result as GeospatialResult;
  } catch {
    return undefined;
  }
}

/**
 * Parse GeoJSON file
 */
async function parseGeoJson(filePath: string): Promise<GeospatialResult | undefined> {
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    const geojson = JSON.parse(content);

    const result: GeospatialResult = {
      format: 'geojson',
      featureCount: 0,
      geometryTypes: [],
    };

    const geometryTypes = new Set<string>();
    const allCoords: [number, number][] = [];

    function extractCoords(coords: unknown): void {
      if (!Array.isArray(coords)) return;

      if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        allCoords.push([coords[1] as number, coords[0] as number]); // lat, lon
      } else {
        for (const c of coords) {
          extractCoords(c);
        }
      }
    }

    function processFeature(feature: { geometry?: { type?: string; coordinates?: unknown } }): void {
      if (!feature.geometry) return;

      if (feature.geometry.type) {
        geometryTypes.add(feature.geometry.type);
      }

      if (feature.geometry.coordinates) {
        extractCoords(feature.geometry.coordinates);
      }
    }

    if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
      result.featureCount = geojson.features.length;
      for (const feature of geojson.features) {
        processFeature(feature);
      }
    } else if (geojson.type === 'Feature') {
      result.featureCount = 1;
      processFeature(geojson);
    } else if (geojson.type && geojson.coordinates) {
      result.featureCount = 1;
      geometryTypes.add(geojson.type);
      extractCoords(geojson.coordinates);
    }

    result.geometryTypes = Array.from(geometryTypes);

    if (allCoords.length > 0) {
      const lats = allCoords.map(c => c[0]);
      const lons = allCoords.map(c => c[1]);
      result.boundingBox = {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLon: Math.min(...lons),
        maxLon: Math.max(...lons),
      };
    }

    if (geojson.crs?.properties?.name) {
      result.crs = geojson.crs.properties.name;
    }

    return result;
  } catch {
    return undefined;
  }
}

/**
 * Get format from extension
 */
function getFormat(ext: string): GeospatialResult['format'] {
  switch (ext.toLowerCase()) {
    case '.gpx': return 'gpx';
    case '.kml': return 'kml';
    case '.kmz': return 'kmz';
    case '.geojson': return 'geojson';
    case '.fit': return 'fit';
    case '.tcx': return 'tcx';
    default: return 'other';
  }
}

/**
 * Extract metadata from a geospatial file
 *
 * @param filePath - Path to geospatial file
 * @returns Extraction result or undefined if extraction failed
 */
export async function extract(filePath: string): Promise<GeospatialResult | undefined> {
  const ext = path.extname(filePath).toLowerCase();
  const format = getFormat(ext);

  // Try format-specific parsers first
  switch (format) {
    case 'gpx':
      return parseGpxPython(filePath);

    case 'geojson':
      return parseGeoJson(filePath);

    default: {
      // Try ogrinfo for other formats
      const ogrinfo = await findOgrinfo();
      if (!ogrinfo) return undefined;

      try {
        const { stdout } = await execFileAsync(ogrinfo, ['-al', '-so', filePath], {
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024
        });

        // Basic parsing of ogrinfo output
        const result: GeospatialResult = {
          format,
          featureCount: 0,
        };

        const featureMatch = stdout.match(/Feature Count:\s*(\d+)/);
        if (featureMatch) {
          result.featureCount = parseInt(featureMatch[1], 10);
        }

        const extentMatch = stdout.match(/Extent:\s*\(([^)]+)\)\s*-\s*\(([^)]+)\)/);
        if (extentMatch) {
          const [minLon, minLat] = extentMatch[1].split(',').map(s => parseFloat(s.trim()));
          const [maxLon, maxLat] = extentMatch[2].split(',').map(s => parseFloat(s.trim()));
          result.boundingBox = { minLat, maxLat, minLon, maxLon };
        }

        const layerMatches = stdout.matchAll(/Layer name:\s*(\S+)/g);
        const layers = Array.from(layerMatches, m => m[1]);
        if (layers.length > 0) {
          result.layers = layers;
        }

        return result;
      } catch {
        return undefined;
      }
    }
  }
}

/**
 * Convert result to XMP rawMetadata format with Geo_ prefix
 */
export function toRawMetadata(result: GeospatialResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'Geo_Format': result.format.toUpperCase(),
    'Geo_FeatureCount': result.featureCount,
  };

  if (result.trackCount !== undefined) {
    metadata['Geo_TrackCount'] = result.trackCount;
  }

  if (result.waypointCount !== undefined) {
    metadata['Geo_WaypointCount'] = result.waypointCount;
  }

  if (result.routeCount !== undefined) {
    metadata['Geo_RouteCount'] = result.routeCount;
  }

  if (result.boundingBox) {
    metadata['Geo_BoundingBox'] =
      `${result.boundingBox.minLat},${result.boundingBox.minLon},${result.boundingBox.maxLat},${result.boundingBox.maxLon}`;
    metadata['Geo_BBoxMinLat'] = result.boundingBox.minLat;
    metadata['Geo_BBoxMaxLat'] = result.boundingBox.maxLat;
    metadata['Geo_BBoxMinLon'] = result.boundingBox.minLon;
    metadata['Geo_BBoxMaxLon'] = result.boundingBox.maxLon;
  }

  if (result.elevationRange) {
    metadata['Geo_ElevationMin'] = result.elevationRange.min;
    metadata['Geo_ElevationMax'] = result.elevationRange.max;
  }

  if (result.dateRange) {
    metadata['Geo_DateStart'] = result.dateRange.earliest;
    metadata['Geo_DateEnd'] = result.dateRange.latest;
  }

  if (result.totalDistance !== undefined) {
    metadata['Geo_TotalDistance'] = result.totalDistance;
  }

  if (result.totalDuration !== undefined) {
    metadata['Geo_TotalDuration'] = result.totalDuration;
  }

  if (result.geometryTypes && result.geometryTypes.length > 0) {
    metadata['Geo_GeometryTypes'] = result.geometryTypes.join(', ');
  }

  if (result.layers && result.layers.length > 0) {
    metadata['Geo_Layers'] = result.layers.join(', ');
    metadata['Geo_LayerCount'] = result.layers.length;
  }

  if (result.crs) {
    metadata['Geo_CRS'] = result.crs;
  }

  if (result.creator) {
    metadata['Geo_Creator'] = result.creator;
  }

  return metadata;
}

/**
 * Get GDAL version information
 */
export async function getVersion(): Promise<string | undefined> {
  const ogrinfo = await findOgrinfo();
  if (!ogrinfo) return 'Python XML parser (no GDAL)';

  try {
    const { stdout } = await execFileAsync(ogrinfo, ['--version'], { timeout: 5000 });
    return stdout.trim();
  } catch {
    return 'GDAL (version check failed)';
  }
}
