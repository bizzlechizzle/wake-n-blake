/**
 * GPS Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseGpsFile,
  detectFormat,
  getTimedWaypoints,
  getAllWaypoints
} from '../../src/services/gps/parsers.js';
import { collectMediaFiles } from '../../src/services/gps/index.js';

describe('GPS Service', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `wnb-gps-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('detectFormat', () => {
    it('should detect KML format', () => {
      expect(detectFormat('track.kml')).toBe('kml');
      expect(detectFormat('TRACK.KML')).toBe('kml');
    });

    it('should detect GPX format', () => {
      expect(detectFormat('track.gpx')).toBe('gpx');
      expect(detectFormat('TRACK.GPX')).toBe('gpx');
    });

    it('should detect GeoJSON format', () => {
      expect(detectFormat('track.geojson')).toBe('geojson');
      expect(detectFormat('track.json')).toBe('geojson');
    });

    it('should return null for unsupported formats', () => {
      expect(detectFormat('track.txt')).toBeNull();
      expect(detectFormat('track.xml')).toBeNull();
    });
  });

  describe('parseGpsFile - KML', () => {
    it('should parse KML with placemarks', () => {
      const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Test Track</name>
    <Placemark>
      <name>Point 1</name>
      <Point>
        <coordinates>-122.4194,37.7749,10</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;

      const doc = parseGpsFile(kml, 'kml');

      expect(doc.format).toBe('kml');
      expect(doc.name).toBe('Test Track');
      expect(doc.waypoints).toHaveLength(1);
      expect(doc.waypoints[0].latitude).toBeCloseTo(37.7749, 4);
      expect(doc.waypoints[0].longitude).toBeCloseTo(-122.4194, 4);
      expect(doc.waypoints[0].altitude).toBe(10);
    });

    it('should parse KML with LineString track', () => {
      const kml = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Track</name>
      <LineString>
        <coordinates>
          -122.0,37.0,0
          -122.1,37.1,10
          -122.2,37.2,20
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

      const doc = parseGpsFile(kml, 'kml');

      expect(doc.tracks).toHaveLength(1);
      expect(doc.tracks[0].points).toHaveLength(3);
    });
  });

  describe('parseGpsFile - GPX', () => {
    it('should parse GPX with waypoints', () => {
      const gpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <metadata>
    <name>Test GPX</name>
  </metadata>
  <wpt lat="37.7749" lon="-122.4194">
    <ele>10</ele>
    <name>San Francisco</name>
    <time>2024-01-01T12:00:00Z</time>
  </wpt>
</gpx>`;

      const doc = parseGpsFile(gpx, 'gpx');

      expect(doc.format).toBe('gpx');
      expect(doc.name).toBe('Test GPX');
      expect(doc.waypoints).toHaveLength(1);
      expect(doc.waypoints[0].latitude).toBe(37.7749);
      expect(doc.waypoints[0].longitude).toBe(-122.4194);
      expect(doc.waypoints[0].altitude).toBe(10);
      expect(doc.waypoints[0].timestamp).toBeDefined();
    });

    it('should parse GPX with track', () => {
      const gpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <trk>
    <name>My Track</name>
    <trkseg>
      <trkpt lat="37.0" lon="-122.0">
        <ele>0</ele>
        <time>2024-01-01T12:00:00Z</time>
      </trkpt>
      <trkpt lat="37.1" lon="-122.1">
        <ele>10</ele>
        <time>2024-01-01T12:01:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

      const doc = parseGpsFile(gpx, 'gpx');

      expect(doc.tracks).toHaveLength(1);
      expect(doc.tracks[0].name).toBe('My Track');
      expect(doc.tracks[0].points).toHaveLength(2);
    });
  });

  describe('parseGpsFile - GeoJSON', () => {
    it('should parse GeoJSON Point', () => {
      const geojson = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Test Point' },
            geometry: {
              type: 'Point',
              coordinates: [-122.4194, 37.7749, 10]
            }
          }
        ]
      });

      const doc = parseGpsFile(geojson, 'geojson');

      expect(doc.format).toBe('geojson');
      expect(doc.waypoints).toHaveLength(1);
      expect(doc.waypoints[0].latitude).toBeCloseTo(37.7749, 4);
      expect(doc.waypoints[0].longitude).toBeCloseTo(-122.4194, 4);
    });

    it('should parse GeoJSON LineString as track', () => {
      const geojson = JSON.stringify({
        type: 'Feature',
        properties: { name: 'Track' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.0, 37.0, 0],
            [-122.1, 37.1, 10],
            [-122.2, 37.2, 20]
          ]
        }
      });

      const doc = parseGpsFile(geojson, 'geojson');

      expect(doc.tracks).toHaveLength(1);
      expect(doc.tracks[0].points).toHaveLength(3);
    });
  });

  describe('getTimedWaypoints', () => {
    it('should return only waypoints with timestamps', () => {
      const gpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <wpt lat="37.0" lon="-122.0">
    <name>No Time</name>
  </wpt>
  <wpt lat="37.1" lon="-122.1">
    <name>With Time</name>
    <time>2024-01-01T12:00:00Z</time>
  </wpt>
</gpx>`;

      const doc = parseGpsFile(gpx, 'gpx');
      const timed = getTimedWaypoints(doc);

      expect(timed).toHaveLength(1);
      expect(timed[0].name).toBe('With Time');
    });

    it('should include track points with timestamps', () => {
      const gpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="37.0" lon="-122.0">
        <time>2024-01-01T12:00:00Z</time>
      </trkpt>
      <trkpt lat="37.1" lon="-122.1">
        <time>2024-01-01T12:01:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

      const doc = parseGpsFile(gpx, 'gpx');
      const timed = getTimedWaypoints(doc);

      expect(timed).toHaveLength(2);
    });
  });

  describe('getAllWaypoints', () => {
    it('should return all waypoints including track points', () => {
      const gpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <wpt lat="37.0" lon="-122.0">
    <name>Waypoint</name>
  </wpt>
  <trk>
    <trkseg>
      <trkpt lat="37.1" lon="-122.1"></trkpt>
      <trkpt lat="37.2" lon="-122.2"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

      const doc = parseGpsFile(gpx, 'gpx');
      const all = getAllWaypoints(doc);

      expect(all).toHaveLength(3);
    });
  });

  describe('collectMediaFiles', () => {
    it('should collect image files', async () => {
      await fs.writeFile(path.join(tempDir, 'photo.jpg'), 'fake jpg');
      await fs.writeFile(path.join(tempDir, 'photo.png'), 'fake png');
      await fs.writeFile(path.join(tempDir, 'doc.txt'), 'text file');

      const files = await collectMediaFiles([tempDir]);

      expect(files).toHaveLength(2);
      expect(files.some(f => f.endsWith('.jpg'))).toBe(true);
      expect(files.some(f => f.endsWith('.png'))).toBe(true);
    });

    it('should collect video files', async () => {
      await fs.writeFile(path.join(tempDir, 'video.mp4'), 'fake mp4');
      await fs.writeFile(path.join(tempDir, 'video.mov'), 'fake mov');

      const files = await collectMediaFiles([tempDir]);

      expect(files).toHaveLength(2);
    });

    it('should recurse when enabled', async () => {
      const subDir = path.join(tempDir, 'subdir');
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(tempDir, 'root.jpg'), 'jpg');
      await fs.writeFile(path.join(subDir, 'nested.jpg'), 'jpg');

      const files = await collectMediaFiles([tempDir], true);

      expect(files).toHaveLength(2);
    });

    it('should not recurse by default', async () => {
      const subDir = path.join(tempDir, 'subdir');
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(tempDir, 'root.jpg'), 'jpg');
      await fs.writeFile(path.join(subDir, 'nested.jpg'), 'jpg');

      const files = await collectMediaFiles([tempDir], false);

      expect(files).toHaveLength(1);
    });

    it('should skip hidden files', async () => {
      await fs.writeFile(path.join(tempDir, '.hidden.jpg'), 'jpg');
      await fs.writeFile(path.join(tempDir, 'visible.jpg'), 'jpg');

      const files = await collectMediaFiles([tempDir]);

      expect(files).toHaveLength(1);
      expect(files[0]).toContain('visible.jpg');
    });
  });
});
