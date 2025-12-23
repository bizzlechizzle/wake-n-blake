/**
 * XML Sidecar Parser
 *
 * Parses XML sidecar files from professional cameras (Sony, Canon, ARRI, etc.)
 * and extracts camera metadata for linking to video files.
 *
 * Supported formats:
 * - Sony XDCAM (.XML alongside .MXF/.MP4)
 * - Canon XF (.XML alongside .MXF/.MP4)
 * - ARRI (.XML metadata files)
 * - Generic XML metadata
 *
 * Adapted from nightfoxfilms.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// =============================================================================
// TYPES
// =============================================================================

export interface XmlSidecarData {
  /** Original XML file path */
  filePath: string;
  /** Associated video file path (if found) */
  linkedVideoPath: string | null;
  /** XML format type */
  format: 'sony_xdcam' | 'canon_xf' | 'arri' | 'fcpxml' | 'generic';
  /** Camera make from XML */
  make: string | null;
  /** Camera model from XML */
  model: string | null;
  /** Lens info */
  lens: string | null;
  /** Recording date/time */
  recordedAt: string | null;
  /** Duration in seconds */
  duration: number | null;
  /** Frame rate */
  frameRate: number | null;
  /** Resolution */
  width: number | null;
  height: number | null;
  /** Codec info */
  codec: string | null;
  /** Timecode */
  timecode: string | null;
  /** Reel/clip name */
  reelName: string | null;
  /** Scene/take info */
  scene: string | null;
  take: string | null;
  /** Shooting notes */
  notes: string | null;
}

// =============================================================================
// DETECTION
// =============================================================================

/** Check if a file is an XML sidecar */
export function isXmlSidecar(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.xml', '.fcpxml'].includes(ext);
}

/** Video extensions to search for linked files */
const VIDEO_EXTENSIONS = [
  '.mxf', '.MXF',
  '.mp4', '.MP4',
  '.mov', '.MOV',
  '.mts', '.MTS',
  '.m2ts', '.M2TS',
  '.avi', '.AVI',
  '.mkv', '.MKV',
  '.r3d', '.R3D',
  '.braw', '.BRAW',
];

/**
 * Find the associated video file for an XML sidecar
 */
export async function findLinkedVideoFile(xmlPath: string): Promise<string | null> {
  const dir = path.dirname(xmlPath);
  const baseName = path.basename(xmlPath, path.extname(xmlPath));

  // Try direct match
  for (const ext of VIDEO_EXTENSIONS) {
    const videoPath = path.join(dir, baseName + ext);
    try {
      await fs.access(videoPath);
      return videoPath;
    } catch {
      // Continue
    }
  }

  // Try removing common suffixes (e.g., C0001M01.xml -> C0001.MP4)
  const suffixPatterns = ['M01', 'M02', '_metadata', '_meta', '_info'];
  for (const suffix of suffixPatterns) {
    if (baseName.endsWith(suffix)) {
      const strippedBase = baseName.slice(0, -suffix.length);
      for (const ext of VIDEO_EXTENSIONS) {
        const videoPath = path.join(dir, strippedBase + ext);
        try {
          await fs.access(videoPath);
          return videoPath;
        } catch {
          // Continue
        }
      }
    }
  }

  return null;
}

// =============================================================================
// SIMPLE XML PARSER (No dependencies)
// =============================================================================

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

/** Simple XML parser for sidecar files (no external deps) */
function parseXmlSimple(xml: string): XmlNode | null {
  // Remove XML declaration and comments
  xml = xml.replace(/<\?xml[^?]*\?>/g, '');
  xml = xml.replace(/<!--[\s\S]*?-->/g, '');

  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  let current: XmlNode | null = null;

  // Simple regex-based parser
  const tagRegex = /<\/?([^>\s]+)([^>]*)>/g;
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(xml)) !== null) {
    const [fullMatch, tag, attrString] = match;
    const isSelfClosing = attrString.endsWith('/') || fullMatch.endsWith('/>');
    const isClosing = fullMatch.startsWith('</');

    // Text between tags
    if (current && lastIndex < match.index) {
      const text = xml.slice(lastIndex, match.index).trim();
      if (text) current.text += text;
    }
    lastIndex = match.index + fullMatch.length;

    if (isClosing) {
      // Pop from stack
      if (stack.length > 0) {
        current = stack.pop()!;
      }
    } else {
      // Parse attributes
      const attrs: Record<string, string> = {};
      const attrRegex = /(\w+)=["']([^"']*)["']/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }

      const node: XmlNode = { tag, attrs, children: [], text: '' };

      if (current) {
        current.children.push(node);
        if (!isSelfClosing) {
          stack.push(current);
          current = node;
        }
      } else {
        root = node;
        current = node;
      }
    }
  }

  return root;
}

/** Find child node by tag */
function findChild(node: XmlNode | null, tag: string): XmlNode | null {
  if (!node) return null;
  return node.children.find(c => c.tag === tag) || null;
}

/** Find all children by tag */
function _findChildren(node: XmlNode | null, tag: string): XmlNode[] {
  if (!node) return [];
  return node.children.filter(c => c.tag === tag);
}

/** Get text content of child */
function getChildText(node: XmlNode | null, tag: string): string | null {
  const child = findChild(node, tag);
  return child?.text || null;
}

/** Search recursively for a value */
function findValueRecursive(node: XmlNode | null, tags: string[]): string | null {
  if (!node) return null;

  for (const tag of tags) {
    const child = findChild(node, tag);
    if (child?.text) return child.text;
    if (child?.attrs.value) return child.attrs.value;
  }

  for (const child of node.children) {
    const result = findValueRecursive(child, tags);
    if (result) return result;
  }

  return null;
}

// =============================================================================
// FORMAT-SPECIFIC PARSERS
// =============================================================================

function detectFormat(root: XmlNode): XmlSidecarData['format'] {
  if (root.tag === 'NonRealTimeMeta') return 'sony_xdcam';
  if (root.tag === 'ClipMetadata') {
    const device = findChild(root, 'Device');
    const make = getChildText(device, 'Manufacturer')?.toLowerCase();
    if (make?.includes('sony')) return 'sony_xdcam';
    if (make?.includes('canon')) return 'canon_xf';
  }
  if (root.tag === 'CanonClip') return 'canon_xf';
  if (root.tag === 'ArrihdrMetaData' || root.tag === 'ArriMetaData') return 'arri';
  if (root.tag === 'fcpxml' || root.tag === 'xmeml') return 'fcpxml';
  return 'generic';
}

function parseSonyXdcam(root: XmlNode): Partial<XmlSidecarData> {
  const result: Partial<XmlSidecarData> = { format: 'sony_xdcam' };

  // Device info
  const device = findChild(root, 'Device');
  if (device) {
    result.make = getChildText(device, 'Manufacturer') || 'Sony';
    result.model = getChildText(device, 'ModelName');
  }

  // Duration (frames)
  const duration = findChild(root, 'Duration');
  if (duration?.attrs.value) {
    result.duration = parseFloat(duration.attrs.value) / 30; // Assume 30fps
  }

  // Creation date
  const creationDate = findChild(root, 'CreationDate');
  if (creationDate?.attrs.value) {
    result.recordedAt = creationDate.attrs.value;
  }

  // Video format
  const videoFormat = findChild(root, 'VideoFormat');
  const videoLayout = findChild(videoFormat, 'VideoLayout');
  if (videoLayout?.attrs) {
    result.width = parseInt(videoLayout.attrs.pixel, 10) || null;
    result.height = parseInt(videoLayout.attrs.numOfVerticalLine, 10) || null;
    result.codec = videoLayout.attrs.videoCodec || null;
  }

  // Timecode
  const ltcTable = findChild(root, 'LtcChangeTable');
  const ltcChange = findChild(ltcTable, 'LtcChange');
  if (ltcChange?.attrs.value) {
    result.timecode = ltcChange.attrs.value;
  }

  return result;
}

function parseCanonXf(root: XmlNode): Partial<XmlSidecarData> {
  const result: Partial<XmlSidecarData> = { format: 'canon_xf' };

  const device = findChild(root, 'Device');
  if (device) {
    result.make = getChildText(device, 'Manufacturer') || 'Canon';
    result.model = getChildText(device, 'ModelName');
  }

  const lens = findChild(root, 'Lens');
  if (lens) {
    result.lens = getChildText(lens, 'ModelName');
  }

  const recordInfo = findChild(root, 'RecordInfo');
  if (recordInfo) {
    result.recordedAt = getChildText(recordInfo, 'RecordDate');
    result.timecode = getChildText(recordInfo, 'Timecode');
  }

  const videoFormat = findChild(root, 'VideoFormat');
  if (videoFormat) {
    result.width = parseInt(getChildText(videoFormat, 'Width') || '', 10) || null;
    result.height = parseInt(getChildText(videoFormat, 'Height') || '', 10) || null;
    result.frameRate = parseFloat(getChildText(videoFormat, 'FrameRate') || '') || null;
    result.codec = getChildText(videoFormat, 'Codec');
  }

  result.reelName = getChildText(root, 'UserClipName');
  result.scene = getChildText(root, 'Scene');
  result.take = getChildText(root, 'Take');

  return result;
}

function parseGeneric(root: XmlNode): Partial<XmlSidecarData> {
  const result: Partial<XmlSidecarData> = { format: 'generic' };

  result.make = findValueRecursive(root, ['Manufacturer', 'Make', 'CameraMake', 'manufacturer', 'make']);
  result.model = findValueRecursive(root, ['ModelName', 'Model', 'CameraModel', 'modelName', 'model']);
  result.lens = findValueRecursive(root, ['Lens', 'LensModel', 'LensName', 'lens']);
  result.recordedAt = findValueRecursive(root, ['CreationDate', 'RecordDate', 'CreateDate', 'DateTimeOriginal']);
  result.timecode = findValueRecursive(root, ['Timecode', 'StartTimecode', 'timecode']);
  result.reelName = findValueRecursive(root, ['ReelName', 'ClipName', 'UserClipName']);

  return result;
}

// =============================================================================
// MAIN API
// =============================================================================

/**
 * Parse an XML sidecar file
 */
export async function parseXmlSidecar(filePath: string): Promise<XmlSidecarData> {
  const content = await fs.readFile(filePath, 'utf-8');
  const root = parseXmlSimple(content);

  if (!root) {
    return {
      filePath,
      linkedVideoPath: null,
      format: 'generic',
      make: null,
      model: null,
      lens: null,
      recordedAt: null,
      duration: null,
      frameRate: null,
      width: null,
      height: null,
      codec: null,
      timecode: null,
      reelName: null,
      scene: null,
      take: null,
      notes: null,
    };
  }

  const format = detectFormat(root);
  let parsed: Partial<XmlSidecarData>;

  switch (format) {
    case 'sony_xdcam':
      parsed = parseSonyXdcam(root);
      break;
    case 'canon_xf':
      parsed = parseCanonXf(root);
      break;
    default:
      parsed = parseGeneric(root);
  }

  const linkedVideoPath = await findLinkedVideoFile(filePath);

  return {
    filePath,
    linkedVideoPath,
    format: parsed.format || 'generic',
    make: parsed.make || null,
    model: parsed.model || null,
    lens: parsed.lens || null,
    recordedAt: parsed.recordedAt || null,
    duration: parsed.duration || null,
    frameRate: parsed.frameRate || null,
    width: parsed.width || null,
    height: parsed.height || null,
    codec: parsed.codec || null,
    timecode: parsed.timecode || null,
    reelName: parsed.reelName || null,
    scene: parsed.scene || null,
    take: parsed.take || null,
    notes: parsed.notes || null,
  };
}

/**
 * Get XML sidecar data for a video file (if exists)
 */
export async function getXmlSidecarForVideo(videoPath: string): Promise<XmlSidecarData | null> {
  const dir = path.dirname(videoPath);
  const baseName = path.basename(videoPath, path.extname(videoPath));

  const xmlPatterns = [
    `${baseName}.xml`,
    `${baseName}.XML`,
    `${baseName}M01.xml`,
    `${baseName}M01.XML`,
    `${baseName}_metadata.xml`,
  ];

  for (const pattern of xmlPatterns) {
    const xmlPath = path.join(dir, pattern);
    try {
      await fs.access(xmlPath);
      return parseXmlSidecar(xmlPath);
    } catch {
      // Continue
    }
  }

  return null;
}
