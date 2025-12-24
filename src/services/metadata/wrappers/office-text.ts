/**
 * Office Document Text Extraction Wrapper
 *
 * Extracts text content from Microsoft Office documents (DOCX, PPTX, XLSX).
 * Uses Python libraries for extraction.
 *
 * Install:
 *   pip install python-docx openpyxl python-pptx
 *
 * Alternative (faster, single package):
 *   pip install textract
 *
 * @module services/metadata/wrappers/office-text
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Office document text extraction result
 */
export interface OfficeTextResult {
  /** Extracted text content */
  text: string;
  /** Document format */
  format: 'docx' | 'pptx' | 'xlsx' | 'doc' | 'xls' | 'ppt';
  /** Word count in extracted text */
  wordCount: number;
  /** Character count in extracted text */
  charCount: number;
  /** Paragraph count (DOCX only) */
  paragraphCount?: number;
  /** Slide count (PPTX only) */
  slideCount?: number;
  /** Sheet count (XLSX only) */
  sheetCount?: number;
  /** Sheet names (XLSX only) */
  sheetNames?: string[];
  /** Whether text was found */
  hasText: boolean;
}

// Python scripts for extraction
const DOCX_SCRIPT = `
import sys
import json
from docx import Document

try:
    doc = Document(sys.argv[1])
    paragraphs = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            paragraphs.append(text)

    full_text = '\\n'.join(paragraphs)
    word_count = len(full_text.split()) if full_text else 0

    result = {
        'text': full_text,
        'paragraphCount': len(paragraphs),
        'wordCount': word_count,
        'charCount': len(full_text),
        'hasText': word_count > 0
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

const PPTX_SCRIPT = `
import sys
import json
from pptx import Presentation

try:
    prs = Presentation(sys.argv[1])
    slides_text = []

    for slide in prs.slides:
        slide_text = []
        for shape in slide.shapes:
            if hasattr(shape, 'text') and shape.text.strip():
                slide_text.append(shape.text.strip())
        if slide_text:
            slides_text.append('\\n'.join(slide_text))

    full_text = '\\n\\n'.join(slides_text)
    word_count = len(full_text.split()) if full_text else 0

    result = {
        'text': full_text,
        'slideCount': len(prs.slides),
        'wordCount': word_count,
        'charCount': len(full_text),
        'hasText': word_count > 0
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

const XLSX_SCRIPT = `
import sys
import json
from openpyxl import load_workbook

try:
    wb = load_workbook(sys.argv[1], read_only=True, data_only=True)
    all_text = []
    sheet_names = wb.sheetnames

    for sheet_name in sheet_names:
        sheet = wb[sheet_name]
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value is not None:
                    cell_text = str(cell.value).strip()
                    if cell_text:
                        all_text.append(cell_text)

    full_text = '\\n'.join(all_text)
    word_count = len(full_text.split()) if full_text else 0

    result = {
        'text': full_text,
        'sheetCount': len(sheet_names),
        'sheetNames': sheet_names,
        'wordCount': word_count,
        'charCount': len(full_text),
        'hasText': word_count > 0
    }
    print(json.dumps(result))
    wb.close()
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

// Check for required Python packages
let hasDocx: boolean | undefined;
let hasPptx: boolean | undefined;
let hasOpenpyxl: boolean | undefined;

/**
 * Check if python-docx is available
 */
async function checkDocx(): Promise<boolean> {
  if (hasDocx !== undefined) return hasDocx;
  try {
    await execFileAsync('python3', ['-c', 'import docx'], { timeout: 5000 });
    hasDocx = true;
  } catch {
    hasDocx = false;
  }
  return hasDocx;
}

/**
 * Check if python-pptx is available
 */
async function checkPptx(): Promise<boolean> {
  if (hasPptx !== undefined) return hasPptx;
  try {
    await execFileAsync('python3', ['-c', 'import pptx'], { timeout: 5000 });
    hasPptx = true;
  } catch {
    hasPptx = false;
  }
  return hasPptx;
}

/**
 * Check if openpyxl is available
 */
async function checkOpenpyxl(): Promise<boolean> {
  if (hasOpenpyxl !== undefined) return hasOpenpyxl;
  try {
    await execFileAsync('python3', ['-c', 'import openpyxl'], { timeout: 5000 });
    hasOpenpyxl = true;
  } catch {
    hasOpenpyxl = false;
  }
  return hasOpenpyxl;
}

/**
 * Check if office text extraction is available for a specific format
 */
export async function isOfficeTextAvailable(format?: string): Promise<boolean> {
  if (!format) {
    // Any format available
    const [docx, pptx, xlsx] = await Promise.all([
      checkDocx(),
      checkPptx(),
      checkOpenpyxl()
    ]);
    return docx || pptx || xlsx;
  }

  switch (format.toLowerCase()) {
    case 'docx':
    case 'doc':
      return checkDocx();
    case 'pptx':
    case 'ppt':
      return checkPptx();
    case 'xlsx':
    case 'xls':
      return checkOpenpyxl();
    default:
      return false;
  }
}

/**
 * Get document format from extension
 */
function getFormat(ext: string): OfficeTextResult['format'] | null {
  switch (ext.toLowerCase()) {
    case '.docx': return 'docx';
    case '.doc': return 'doc';
    case '.pptx': return 'pptx';
    case '.ppt': return 'ppt';
    case '.xlsx': return 'xlsx';
    case '.xls': return 'xls';
    default: return null;
  }
}

/**
 * Extract text from DOCX file
 */
async function extractDocx(filePath: string): Promise<OfficeTextResult | undefined> {
  if (!(await checkDocx())) return undefined;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', DOCX_SCRIPT, filePath], {
      timeout: 60000,
      maxBuffer: 50 * 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.error) return undefined;

    return {
      text: result.text,
      format: 'docx',
      wordCount: result.wordCount,
      charCount: result.charCount,
      paragraphCount: result.paragraphCount,
      hasText: result.hasText,
    };
  } catch {
    return undefined;
  }
}

/**
 * Extract text from PPTX file
 */
async function extractPptx(filePath: string): Promise<OfficeTextResult | undefined> {
  if (!(await checkPptx())) return undefined;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', PPTX_SCRIPT, filePath], {
      timeout: 60000,
      maxBuffer: 50 * 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.error) return undefined;

    return {
      text: result.text,
      format: 'pptx',
      wordCount: result.wordCount,
      charCount: result.charCount,
      slideCount: result.slideCount,
      hasText: result.hasText,
    };
  } catch {
    return undefined;
  }
}

/**
 * Extract text from XLSX file
 */
async function extractXlsx(filePath: string): Promise<OfficeTextResult | undefined> {
  if (!(await checkOpenpyxl())) return undefined;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', XLSX_SCRIPT, filePath], {
      timeout: 60000,
      maxBuffer: 50 * 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.error) return undefined;

    return {
      text: result.text,
      format: 'xlsx',
      wordCount: result.wordCount,
      charCount: result.charCount,
      sheetCount: result.sheetCount,
      sheetNames: result.sheetNames,
      hasText: result.hasText,
    };
  } catch {
    return undefined;
  }
}

/**
 * Extract text from an Office document
 *
 * @param filePath - Path to Office document
 * @returns Extraction result or undefined if extraction failed
 */
export async function extract(filePath: string): Promise<OfficeTextResult | undefined> {
  const ext = path.extname(filePath).toLowerCase();
  const format = getFormat(ext);

  if (!format) return undefined;

  switch (format) {
    case 'docx':
    case 'doc':
      return extractDocx(filePath);
    case 'pptx':
    case 'ppt':
      return extractPptx(filePath);
    case 'xlsx':
    case 'xls':
      return extractXlsx(filePath);
    default:
      return undefined;
  }
}

/**
 * Convert result to XMP rawMetadata format with Office_ prefix
 */
export function toRawMetadata(result: OfficeTextResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'Office_Format': result.format.toUpperCase(),
    'Office_HasText': result.hasText,
    'Office_WordCount': result.wordCount,
    'Office_CharCount': result.charCount,
  };

  if (result.paragraphCount !== undefined) {
    metadata['Office_ParagraphCount'] = result.paragraphCount;
  }

  if (result.slideCount !== undefined) {
    metadata['Office_SlideCount'] = result.slideCount;
  }

  if (result.sheetCount !== undefined) {
    metadata['Office_SheetCount'] = result.sheetCount;
  }

  if (result.sheetNames && result.sheetNames.length > 0) {
    metadata['Office_SheetNames'] = result.sheetNames.join('; ');
  }

  // Store text content (truncated if too long)
  if (result.text) {
    const maxLength = 100000; // ~100KB limit for XMP
    if (result.text.length > maxLength) {
      metadata['Office_TextContent'] = result.text.substring(0, maxLength);
      metadata['Office_Truncated'] = true;
    } else {
      metadata['Office_TextContent'] = result.text;
      metadata['Office_Truncated'] = false;
    }
  }

  if (!result.hasText) {
    metadata['Office_ExtractionNote'] = 'No text content found';
  }

  return metadata;
}

/**
 * Get available Python packages for office extraction
 */
export async function getAvailablePackages(): Promise<string[]> {
  const packages: string[] = [];

  if (await checkDocx()) packages.push('python-docx');
  if (await checkPptx()) packages.push('python-pptx');
  if (await checkOpenpyxl()) packages.push('openpyxl');

  return packages;
}
