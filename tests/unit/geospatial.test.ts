/**
 * Geospatial Data Extraction Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { geospatial } from '../../src/services/metadata/index.js';

describe('Geospatial Data Extraction', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-geo-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isGeospatialAvailable', () => {
    it('should correctly detect tool availability', async () => {
      const available = await geospatial.isGeospatialAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('extract', () => {
    it('should parse GPX file', async () => {
      const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <metadata>
    <name>Test Track</name>
  </metadata>
  <trk>
    <name>Morning Run</name>
    <trkseg>
      <trkpt lat="37.7749" lon="-122.4194">
        <ele>10</ele>
        <time>2024-01-01T10:00:00Z</time>
      </trkpt>
      <trkpt lat="37.7750" lon="-122.4195">
        <ele>12</ele>
        <time>2024-01-01T10:01:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
  <wpt lat="37.7749" lon="-122.4194">
    <name>Start</name>
  </wpt>
</gpx>`;
      const gpxFile = path.join(tempDir, 'track.gpx');
      await fs.writeFile(gpxFile, gpxContent);

      const result = await geospatial.extract(gpxFile);

      expect(result).toBeDefined();
      expect(result!.format).toBe('gpx');
      expect(result!.trackCount).toBe(1);
      expect(result!.waypointCount).toBe(1);
      expect(result!.boundingBox).toBeDefined();
      expect(result!.boundingBox!.minLat).toBeCloseTo(37.7749, 2);
    });

    it('should parse GeoJSON file', async () => {
      const geojsonContent = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [-122.4194, 37.7749],
            },
            properties: { name: 'San Francisco' },
          },
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [-122.4194, 37.7749],
                [-122.4184, 37.7759],
              ],
            },
            properties: { name: 'A Line' },
          },
        ],
      });
      const geojsonFile = path.join(tempDir, 'places.geojson');
      await fs.writeFile(geojsonFile, geojsonContent);

      const result = await geospatial.extract(geojsonFile);

      expect(result).toBeDefined();
      expect(result!.format).toBe('geojson');
      expect(result!.featureCount).toBe(2);
      expect(result!.geometryTypes).toContain('Point');
      expect(result!.geometryTypes).toContain('LineString');
    });

    it('should return undefined for non-existent files', async () => {
      const result = await geospatial.extract('/nonexistent/file.gpx');
      expect(result).toBeUndefined();
    });
  });

  describe('toRawMetadata', () => {
    it('should convert GPX result to prefixed key-value pairs', () => {
      const result: geospatial.GeospatialResult = {
        format: 'gpx',
        featureCount: 5,
        trackCount: 2,
        waypointCount: 3,
        routeCount: 0,
        boundingBox: {
          minLat: 37.0,
          maxLat: 38.0,
          minLon: -123.0,
          maxLon: -122.0,
        },
        elevationRange: {
          min: 0,
          max: 500,
        },
        dateRange: {
          earliest: '2024-01-01T00:00:00Z',
          latest: '2024-01-02T00:00:00Z',
        },
        creator: 'Garmin Edge 530',
      };

      const metadata = geospatial.toRawMetadata(result);

      expect(metadata['Geo_Format']).toBe('GPX');
      expect(metadata['Geo_FeatureCount']).toBe(5);
      expect(metadata['Geo_TrackCount']).toBe(2);
      expect(metadata['Geo_WaypointCount']).toBe(3);
      expect(metadata['Geo_BBoxMinLat']).toBe(37.0);
      expect(metadata['Geo_BBoxMaxLat']).toBe(38.0);
      expect(metadata['Geo_ElevationMin']).toBe(0);
      expect(metadata['Geo_ElevationMax']).toBe(500);
      expect(metadata['Geo_DateStart']).toBe('2024-01-01T00:00:00Z');
      expect(metadata['Geo_DateEnd']).toBe('2024-01-02T00:00:00Z');
      expect(metadata['Geo_Creator']).toBe('Garmin Edge 530');
    });

    it('should convert GeoJSON result', () => {
      const result: geospatial.GeospatialResult = {
        format: 'geojson',
        featureCount: 10,
        geometryTypes: ['Point', 'Polygon', 'MultiPolygon'],
        boundingBox: {
          minLat: 35.0,
          maxLat: 40.0,
          minLon: -125.0,
          maxLon: -120.0,
        },
        crs: 'EPSG:4326',
      };

      const metadata = geospatial.toRawMetadata(result);

      expect(metadata['Geo_Format']).toBe('GEOJSON');
      expect(metadata['Geo_FeatureCount']).toBe(10);
      expect(metadata['Geo_GeometryTypes']).toBe('Point, Polygon, MultiPolygon');
      expect(metadata['Geo_CRS']).toBe('EPSG:4326');
    });
  });
});
