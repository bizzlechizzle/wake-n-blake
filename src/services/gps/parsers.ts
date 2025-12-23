/**
 * GPS Reference Map Parsers
 * Parse KML, GPX, and GeoJSON files into waypoints
 */

import type { Waypoint, GpsTrack, GpsDocument } from './schemas.js';

/**
 * Parse a GPS reference file based on extension
 */
export function parseGpsFile(content: string, format: 'kml' | 'gpx' | 'geojson'): GpsDocument {
  switch (format) {
    case 'kml':
      return parseKml(content);
    case 'gpx':
      return parseGpx(content);
    case 'geojson':
      return parseGeoJson(content);
    default:
      throw new Error(`Unsupported GPS format: ${format}`);
  }
}

/**
 * Detect format from file extension
 */
export function detectFormat(filename: string): 'kml' | 'gpx' | 'geojson' | null {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'kml':
    case 'kmz':
      return 'kml';
    case 'gpx':
      return 'gpx';
    case 'geojson':
    case 'json':
      return 'geojson';
    default:
      return null;
  }
}

/**
 * Parse KML (Keyhole Markup Language)
 * Extracts Placemarks with coordinates and optional timestamps
 */
export function parseKml(content: string): GpsDocument {
  const waypoints: Waypoint[] = [];
  const tracks: GpsTrack[] = [];

  // Extract document name
  const nameMatch = content.match(/<Document[^>]*>[\s\S]*?<name>([^<]+)<\/name>/i);
  const docName = nameMatch?.[1];

  // Extract Placemarks (waypoints)
  const placemarkRegex = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/gi;
  let placemarkMatch;

  while ((placemarkMatch = placemarkRegex.exec(content)) !== null) {
    const placemark = placemarkMatch[1];
    const waypoint = parseKmlPlacemark(placemark);
    if (waypoint) {
      waypoints.push(waypoint);
    }
  }

  // Extract LineStrings as tracks (gx:Track or LineString with coordinates)
  const lineStringRegex = /<LineString[^>]*>([\s\S]*?)<\/LineString>/gi;
  let lineMatch;

  while ((lineMatch = lineStringRegex.exec(content)) !== null) {
    const lineContent = lineMatch[1];
    const coordsMatch = lineContent.match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i);

    if (coordsMatch) {
      const points = parseKmlCoordinates(coordsMatch[1]);
      if (points.length > 0) {
        tracks.push({
          name: 'Track',
          points
        });
      }
    }
  }

  // Also look for gx:Track elements (Google Earth extension)
  const gxTrackRegex = /<gx:Track[^>]*>([\s\S]*?)<\/gx:Track>/gi;
  let gxMatch;

  while ((gxMatch = gxTrackRegex.exec(content)) !== null) {
    const track = parseGxTrack(gxMatch[1]);
    if (track.points.length > 0) {
      tracks.push(track);
    }
  }

  return {
    format: 'kml',
    name: docName,
    waypoints,
    tracks
  };
}

/**
 * Parse a KML Placemark element
 */
function parseKmlPlacemark(placemark: string): Waypoint | null {
  // Extract coordinates
  const coordsMatch = placemark.match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i);
  if (!coordsMatch) return null;

  const coords = parseKmlCoordinates(coordsMatch[1]);
  if (coords.length === 0) return null;

  const point = coords[0];

  // Extract name
  const nameMatch = placemark.match(/<name>([^<]*)<\/name>/i);
  if (nameMatch) {
    point.name = nameMatch[1].trim();
  }

  // Extract description
  const descMatch = placemark.match(/<description>([^<]*)<\/description>/i);
  if (descMatch) {
    point.description = descMatch[1].trim();
  }

  // Extract timestamp (TimeStamp or when)
  const timeMatch = placemark.match(/<(?:TimeStamp|when)[^>]*>[\s\S]*?<when>([^<]+)<\/when>/i) ||
                    placemark.match(/<when>([^<]+)<\/when>/i);
  if (timeMatch) {
    const ts = new Date(timeMatch[1].trim());
    if (!isNaN(ts.getTime())) {
      point.timestamp = ts;
    }
  }

  return point;
}

/**
 * Parse KML coordinates string: "lon,lat,alt lon,lat,alt ..."
 */
function parseKmlCoordinates(coordString: string): Waypoint[] {
  const points: Waypoint[] = [];
  const coordPairs = coordString.trim().split(/\s+/);

  for (const pair of coordPairs) {
    const parts = pair.split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const waypoint: Waypoint = {
        longitude: parts[0],
        latitude: parts[1]
      };
      if (parts.length >= 3 && !isNaN(parts[2])) {
        waypoint.altitude = parts[2];
      }
      points.push(waypoint);
    }
  }

  return points;
}

/**
 * Parse gx:Track element (Google Earth extension with timestamps)
 */
function parseGxTrack(trackContent: string): GpsTrack {
  const points: Waypoint[] = [];

  // Extract when elements (timestamps)
  const whenRegex = /<when>([^<]+)<\/when>/gi;
  const timestamps: Date[] = [];
  let whenMatch;
  while ((whenMatch = whenRegex.exec(trackContent)) !== null) {
    const ts = new Date(whenMatch[1].trim());
    if (!isNaN(ts.getTime())) {
      timestamps.push(ts);
    }
  }

  // Extract gx:coord elements (lon lat alt)
  const coordRegex = /<gx:coord>([^<]+)<\/gx:coord>/gi;
  let coordMatch;
  let idx = 0;

  while ((coordMatch = coordRegex.exec(trackContent)) !== null) {
    const parts = coordMatch[1].trim().split(/\s+/).map(parseFloat);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const waypoint: Waypoint = {
        longitude: parts[0],
        latitude: parts[1]
      };
      if (parts.length >= 3 && !isNaN(parts[2])) {
        waypoint.altitude = parts[2];
      }
      if (idx < timestamps.length) {
        waypoint.timestamp = timestamps[idx];
      }
      points.push(waypoint);
    }
    idx++;
  }

  return {
    name: 'gx:Track',
    points,
    startTime: timestamps[0],
    endTime: timestamps[timestamps.length - 1]
  };
}

/**
 * Parse GPX (GPS Exchange Format)
 */
export function parseGpx(content: string): GpsDocument {
  const waypoints: Waypoint[] = [];
  const tracks: GpsTrack[] = [];

  // Extract metadata name
  const nameMatch = content.match(/<metadata[^>]*>[\s\S]*?<name>([^<]+)<\/name>/i) ||
                    content.match(/<gpx[^>]*>[\s\S]*?<name>([^<]+)<\/name>/i);
  const docName = nameMatch?.[1];

  // Extract waypoints <wpt>
  const wptRegex = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/wpt>/gi;
  let wptMatch;

  while ((wptMatch = wptRegex.exec(content)) !== null) {
    const lat = parseFloat(wptMatch[1]);
    const lon = parseFloat(wptMatch[2]);
    const wptContent = wptMatch[3];

    if (!isNaN(lat) && !isNaN(lon)) {
      const waypoint: Waypoint = {
        latitude: lat,
        longitude: lon
      };

      // Extract optional fields
      const eleMatch = wptContent.match(/<ele>([^<]+)<\/ele>/i);
      if (eleMatch) {
        const ele = parseFloat(eleMatch[1]);
        if (!isNaN(ele)) waypoint.altitude = ele;
      }

      const nameMatch = wptContent.match(/<name>([^<]+)<\/name>/i);
      if (nameMatch) waypoint.name = nameMatch[1].trim();

      const descMatch = wptContent.match(/<desc>([^<]+)<\/desc>/i);
      if (descMatch) waypoint.description = descMatch[1].trim();

      const timeMatch = wptContent.match(/<time>([^<]+)<\/time>/i);
      if (timeMatch) {
        const ts = new Date(timeMatch[1].trim());
        if (!isNaN(ts.getTime())) waypoint.timestamp = ts;
      }

      waypoints.push(waypoint);
    }
  }

  // Extract tracks <trk>
  const trkRegex = /<trk[^>]*>([\s\S]*?)<\/trk>/gi;
  let trkMatch;

  while ((trkMatch = trkRegex.exec(content)) !== null) {
    const trkContent = trkMatch[1];
    const track = parseGpxTrack(trkContent);
    if (track.points.length > 0) {
      tracks.push(track);
    }
  }

  // Extract routes <rte> as tracks
  const rteRegex = /<rte[^>]*>([\s\S]*?)<\/rte>/gi;
  let rteMatch;

  while ((rteMatch = rteRegex.exec(content)) !== null) {
    const rteContent = rteMatch[1];
    const track = parseGpxRoute(rteContent);
    if (track.points.length > 0) {
      tracks.push(track);
    }
  }

  return {
    format: 'gpx',
    name: docName,
    waypoints,
    tracks
  };
}

/**
 * Parse GPX track <trk> element
 */
function parseGpxTrack(trkContent: string): GpsTrack {
  const points: Waypoint[] = [];

  // Extract track name
  const nameMatch = trkContent.match(/<name>([^<]+)<\/name>/i);
  const trackName = nameMatch?.[1]?.trim();

  // Extract track points from track segments <trkseg>
  const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
  let ptMatch;

  while ((ptMatch = trkptRegex.exec(trkContent)) !== null) {
    const lat = parseFloat(ptMatch[1]);
    const lon = parseFloat(ptMatch[2]);
    const ptContent = ptMatch[3];

    if (!isNaN(lat) && !isNaN(lon)) {
      const waypoint: Waypoint = {
        latitude: lat,
        longitude: lon
      };

      const eleMatch = ptContent.match(/<ele>([^<]+)<\/ele>/i);
      if (eleMatch) {
        const ele = parseFloat(eleMatch[1]);
        if (!isNaN(ele)) waypoint.altitude = ele;
      }

      const timeMatch = ptContent.match(/<time>([^<]+)<\/time>/i);
      if (timeMatch) {
        const ts = new Date(timeMatch[1].trim());
        if (!isNaN(ts.getTime())) waypoint.timestamp = ts;
      }

      points.push(waypoint);
    }
  }

  return {
    name: trackName || 'Track',
    points,
    startTime: points[0]?.timestamp,
    endTime: points[points.length - 1]?.timestamp
  };
}

/**
 * Parse GPX route <rte> element
 */
function parseGpxRoute(rteContent: string): GpsTrack {
  const points: Waypoint[] = [];

  const nameMatch = rteContent.match(/<name>([^<]+)<\/name>/i);
  const routeName = nameMatch?.[1]?.trim();

  // Extract route points <rtept>
  const rteptRegex = /<rtept\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/rtept>/gi;
  let ptMatch;

  while ((ptMatch = rteptRegex.exec(rteContent)) !== null) {
    const lat = parseFloat(ptMatch[1]);
    const lon = parseFloat(ptMatch[2]);
    const ptContent = ptMatch[3];

    if (!isNaN(lat) && !isNaN(lon)) {
      const waypoint: Waypoint = {
        latitude: lat,
        longitude: lon
      };

      const eleMatch = ptContent.match(/<ele>([^<]+)<\/ele>/i);
      if (eleMatch) {
        const ele = parseFloat(eleMatch[1]);
        if (!isNaN(ele)) waypoint.altitude = ele;
      }

      const nameMatch = ptContent.match(/<name>([^<]+)<\/name>/i);
      if (nameMatch) waypoint.name = nameMatch[1].trim();

      points.push(waypoint);
    }
  }

  return {
    name: routeName || 'Route',
    points
  };
}

/**
 * Parse GeoJSON
 */
export function parseGeoJson(content: string): GpsDocument {
  const waypoints: Waypoint[] = [];
  const tracks: GpsTrack[] = [];

  const json = JSON.parse(content);

  // Handle FeatureCollection
  if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
    for (const feature of json.features) {
      parseGeoJsonFeature(feature, waypoints, tracks);
    }
  }
  // Handle single Feature
  else if (json.type === 'Feature') {
    parseGeoJsonFeature(json, waypoints, tracks);
  }
  // Handle geometry directly
  else if (json.type && json.coordinates) {
    parseGeoJsonGeometry(json, {}, waypoints, tracks);
  }

  return {
    format: 'geojson',
    name: json.name,
    waypoints,
    tracks
  };
}

/**
 * Parse a GeoJSON Feature
 */
function parseGeoJsonFeature(
  feature: Record<string, unknown>,
  waypoints: Waypoint[],
  tracks: GpsTrack[]
): void {
  if (feature.type !== 'Feature' || !feature.geometry) return;

  const props = (feature.properties || {}) as Record<string, unknown>;
  const geometry = feature.geometry as { type: string; coordinates: unknown };

  parseGeoJsonGeometry(geometry, props, waypoints, tracks);
}

/**
 * Parse a GeoJSON geometry
 */
function parseGeoJsonGeometry(
  geometry: { type: string; coordinates: unknown },
  props: Record<string, unknown>,
  waypoints: Waypoint[],
  tracks: GpsTrack[]
): void {
  switch (geometry.type) {
    case 'Point': {
      const coords = geometry.coordinates as number[];
      if (coords.length >= 2) {
        const waypoint: Waypoint = {
          longitude: coords[0],
          latitude: coords[1]
        };
        if (coords.length >= 3) waypoint.altitude = coords[2];
        if (props.name) waypoint.name = String(props.name);
        if (props.description) waypoint.description = String(props.description);
        if (props.timestamp || props.time) {
          const ts = new Date(String(props.timestamp || props.time));
          if (!isNaN(ts.getTime())) waypoint.timestamp = ts;
        }
        waypoints.push(waypoint);
      }
      break;
    }

    case 'LineString': {
      const coords = geometry.coordinates as number[][];
      const points: Waypoint[] = coords.map(coord => ({
        longitude: coord[0],
        latitude: coord[1],
        altitude: coord[2]
      }));
      if (points.length > 0) {
        tracks.push({
          name: props.name ? String(props.name) : 'Track',
          points
        });
      }
      break;
    }

    case 'MultiPoint': {
      const coords = geometry.coordinates as number[][];
      for (const coord of coords) {
        if (coord.length >= 2) {
          waypoints.push({
            longitude: coord[0],
            latitude: coord[1],
            altitude: coord[2],
            name: props.name ? String(props.name) : undefined
          });
        }
      }
      break;
    }

    case 'MultiLineString': {
      const lines = geometry.coordinates as number[][][];
      for (let i = 0; i < lines.length; i++) {
        const points: Waypoint[] = lines[i].map(coord => ({
          longitude: coord[0],
          latitude: coord[1],
          altitude: coord[2]
        }));
        if (points.length > 0) {
          tracks.push({
            name: `${props.name || 'Track'} ${i + 1}`,
            points
          });
        }
      }
      break;
    }

    case 'GeometryCollection': {
      const geometries = (geometry as unknown as { geometries: Array<{ type: string; coordinates: unknown }> }).geometries;
      for (const geom of geometries) {
        parseGeoJsonGeometry(geom, props, waypoints, tracks);
      }
      break;
    }
  }
}

/**
 * Get all waypoints from a GPS document (including track points)
 */
export function getAllWaypoints(doc: GpsDocument): Waypoint[] {
  const all: Waypoint[] = [...doc.waypoints];

  for (const track of doc.tracks) {
    all.push(...track.points);
  }

  return all;
}

/**
 * Get waypoints with timestamps, sorted by time
 */
export function getTimedWaypoints(doc: GpsDocument): Waypoint[] {
  return getAllWaypoints(doc)
    .filter(w => w.timestamp)
    .sort((a, b) => a.timestamp!.getTime() - b.timestamp!.getTime());
}
