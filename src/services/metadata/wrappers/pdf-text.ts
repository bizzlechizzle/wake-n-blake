/**
 * PDF Text Extraction Wrapper
 *
 * Extracts selectable text from PDF files using pdftotext (poppler-utils).
 * Falls back to PyMuPDF if pdftotext is not available.
 *
 * Install:
 *   macOS:   brew install poppler
 *   Linux:   apt install poppler-utils
 *   Windows: choco install poppler
 *
 * PyMuPDF fallback:
 *   pip install PyMuPDF
 *
 * @module services/metadata/wrappers/pdf-text
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * PDF text extraction result
 */
export interface PdfTextResult {
  /** Extracted text content */
  text: string;
  /** Number of pages in PDF */
  pageCount: number;
  /** Word count in extracted text */
  wordCount: number;
  /** Character count in extracted text */
  charCount: number;
  /** Whether selectable text was found */
  hasText: boolean;
  /** Tool used for extraction */
  extractionMethod: 'pdftotext' | 'pymupdf';
}

// Common installation paths for pdftotext
const PDFTOTEXT_PATHS = [
  process.env.PDFTOTEXT_PATH,
  '/opt/homebrew/bin/pdftotext',      // macOS Homebrew ARM
  '/usr/local/bin/pdftotext',         // macOS Homebrew Intel / Linux manual
  '/usr/bin/pdftotext',               // Linux package managers
  `${process.env.HOME}/.local/bin/pdftotext`,
].filter(Boolean) as string[];

let pdftotextPath: string | null | undefined = undefined;
let hasPymupdf: boolean | undefined = undefined;

/**
 * Find pdftotext binary
 */
export async function findPdftotext(): Promise<string | null> {
  if (pdftotextPath !== undefined) return pdftotextPath;

  for (const p of PDFTOTEXT_PATHS) {
    try {
      await fsp.access(p, fs.constants.X_OK);
      pdftotextPath = p;
      return p;
    } catch {
      // Continue to next path
    }
  }

  // Fallback: search PATH
  try {
    const { stdout } = await execFileAsync('which', ['pdftotext']);
    const foundPath = stdout.trim();
    if (foundPath) {
      pdftotextPath = foundPath;
      return foundPath;
    }
  } catch {
    // Not in PATH
  }

  pdftotextPath = null;
  return null;
}

/**
 * Check if PyMuPDF is available
 */
export async function hasPyMuPDF(): Promise<boolean> {
  if (hasPymupdf !== undefined) return hasPymupdf;

  try {
    await execFileAsync('python3', ['-c', 'import fitz; print(fitz.version)'], {
      timeout: 5000
    });
    hasPymupdf = true;
    return true;
  } catch {
    hasPymupdf = false;
    return false;
  }
}

/**
 * Check if any PDF text extraction tool is available
 */
export async function isPdfTextAvailable(): Promise<boolean> {
  const pdftotext = await findPdftotext();
  if (pdftotext) return true;
  return hasPyMuPDF();
}

/**
 * Get page count using pdfinfo (comes with poppler)
 */
async function getPageCount(filePath: string): Promise<number> {
  try {
    const pdftotextDir = path.dirname(await findPdftotext() ?? '/usr/bin/pdftotext');
    const pdfinfo = path.join(pdftotextDir, 'pdfinfo');

    const { stdout } = await execFileAsync(pdfinfo, [filePath], {
      timeout: 10000
    });

    const match = stdout.match(/Pages:\s*(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Extract text using pdftotext
 */
async function extractWithPdftotext(filePath: string): Promise<PdfTextResult | undefined> {
  const pdftotext = await findPdftotext();
  if (!pdftotext) return undefined;

  try {
    // Create temp file for output
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pdf-text-'));
    const tempFile = path.join(tempDir, 'output.txt');

    try {
      // Run pdftotext with layout preservation
      await execFileAsync(pdftotext, [
        '-layout',  // Maintain layout
        '-enc', 'UTF-8',
        filePath,
        tempFile
      ], {
        timeout: 60000,
        maxBuffer: 50 * 1024 * 1024  // 50MB buffer for large PDFs
      });

      // Read extracted text
      const text = await fsp.readFile(tempFile, 'utf-8');
      const pageCount = await getPageCount(filePath);

      // Calculate stats
      const trimmedText = text.trim();
      const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0;
      const charCount = trimmedText.length;
      const hasText = wordCount > 0;

      return {
        text: trimmedText,
        pageCount,
        wordCount,
        charCount,
        hasText,
        extractionMethod: 'pdftotext'
      };
    } finally {
      // Cleanup temp files
      try {
        await fsp.rm(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch {
    return undefined;
  }
}

/**
 * Extract text using PyMuPDF
 */
async function extractWithPyMuPDF(filePath: string): Promise<PdfTextResult | undefined> {
  if (!(await hasPyMuPDF())) return undefined;

  const pythonScript = `
import sys
import json
import fitz  # PyMuPDF

try:
    doc = fitz.open(sys.argv[1])
    text_parts = []
    for page in doc:
        text_parts.append(page.get_text())

    full_text = '\\n'.join(text_parts).strip()
    word_count = len(full_text.split()) if full_text else 0

    result = {
        'text': full_text,
        'pageCount': len(doc),
        'wordCount': word_count,
        'charCount': len(full_text),
        'hasText': word_count > 0
    }
    print(json.dumps(result))
    doc.close()
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', pythonScript, filePath], {
      timeout: 60000,
      maxBuffer: 50 * 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.error) return undefined;

    return {
      text: result.text,
      pageCount: result.pageCount,
      wordCount: result.wordCount,
      charCount: result.charCount,
      hasText: result.hasText,
      extractionMethod: 'pymupdf'
    };
  } catch {
    return undefined;
  }
}

/**
 * Extract text from a PDF file
 *
 * @param filePath - Path to PDF file
 * @returns Extraction result or undefined if extraction failed
 */
export async function extract(filePath: string): Promise<PdfTextResult | undefined> {
  // Try pdftotext first (faster)
  const pdftotextResult = await extractWithPdftotext(filePath);
  if (pdftotextResult) return pdftotextResult;

  // Fall back to PyMuPDF
  const pymupdfResult = await extractWithPyMuPDF(filePath);
  if (pymupdfResult) return pymupdfResult;

  return undefined;
}

/**
 * Convert result to XMP rawMetadata format with PDFText_ prefix
 */
export function toRawMetadata(result: PdfTextResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'PDFText_HasText': result.hasText,
    'PDFText_PageCount': result.pageCount,
    'PDFText_WordCount': result.wordCount,
    'PDFText_CharCount': result.charCount,
    'PDFText_ExtractionMethod': result.extractionMethod,
  };

  // Store text content (truncated if too long)
  if (result.text) {
    const maxLength = 100000; // ~100KB limit for XMP
    if (result.text.length > maxLength) {
      metadata['PDFText_Content'] = result.text.substring(0, maxLength);
      metadata['PDFText_Truncated'] = true;
    } else {
      metadata['PDFText_Content'] = result.text;
      metadata['PDFText_Truncated'] = false;
    }
  }

  if (!result.hasText) {
    metadata['PDFText_ExtractionNote'] = 'No selectable text found - may be image-based PDF';
  }

  return metadata;
}

/**
 * Get tool version information
 */
export async function getVersion(): Promise<string | undefined> {
  const pdftotext = await findPdftotext();
  if (pdftotext) {
    try {
      const { stdout, stderr } = await execFileAsync(pdftotext, ['-v'], { timeout: 5000 });
      const output = stderr || stdout; // pdftotext outputs version to stderr
      const match = output.match(/pdftotext\s+version\s+([\d.]+)/i);
      return match ? `pdftotext ${match[1]}` : 'pdftotext (version unknown)';
    } catch {
      return 'pdftotext (version check failed)';
    }
  }

  if (await hasPyMuPDF()) {
    try {
      const { stdout } = await execFileAsync('python3', ['-c', 'import fitz; print(fitz.version)']);
      return `PyMuPDF ${stdout.trim()}`;
    } catch {
      return 'PyMuPDF (version unknown)';
    }
  }

  return undefined;
}

/**
 * Get available tools for PDF text extraction
 */
export async function getAvailableTools(): Promise<string[]> {
  const tools: string[] = [];

  if (await findPdftotext()) {
    tools.push('pdftotext');
  }

  if (await hasPyMuPDF()) {
    tools.push('pymupdf');
  }

  return tools;
}
