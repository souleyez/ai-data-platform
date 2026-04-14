import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function needsTemporaryAsciiPath(filePath: string) {
  return process.platform === 'win32' && /[^\x00-\x7F]/.test(filePath);
}

export async function withTemporaryAsciiCopy<T>(filePath: string, run: (inputPath: string) => Promise<T>) {
  if (!needsTemporaryAsciiPath(filePath)) {
    return run(filePath);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-pdf-'));
  const tempFilePath = path.join(tempDir, `input${path.extname(filePath) || '.pdf'}`);
  try {
    await fs.copyFile(filePath, tempFilePath);
    return await run(tempFilePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function extractPresentationTextViaPdfWithRuntime(
  filePath: string,
  deps: {
    normalizeText: (value: string) => string;
    withTemporaryAsciiCopy: typeof withTemporaryAsciiCopy;
    extractPresentationTextViaPdfInternal: (
      filePath: string,
      deps: {
        normalizeText: (value: string) => string;
        withTemporaryAsciiCopy: typeof withTemporaryAsciiCopy;
      },
    ) => Promise<{ text: string; parseMethod: string }>;
  },
) {
  return deps.extractPresentationTextViaPdfInternal(filePath, {
    normalizeText: deps.normalizeText,
    withTemporaryAsciiCopy: deps.withTemporaryAsciiCopy,
  });
}

export async function extractPdfTextWithRuntime(
  filePath: string,
  deps: {
    normalizeText: (value: string) => string;
    withTemporaryAsciiCopy: typeof withTemporaryAsciiCopy;
    extractPdfTextInternal: (
      filePath: string,
      deps: {
        normalizeText: (value: string) => string;
        withTemporaryAsciiCopy: typeof withTemporaryAsciiCopy;
      },
    ) => Promise<{ text: string; pageCount: number; method: 'pdf-parse' | 'pypdf' | 'ocrmypdf' }>;
  },
) {
  return deps.extractPdfTextInternal(filePath, {
    normalizeText: deps.normalizeText,
    withTemporaryAsciiCopy: deps.withTemporaryAsciiCopy,
  });
}

export async function extractImageTextWithTesseractWithRuntime(
  filePath: string,
  deps: {
    normalizeText: (value: string) => string;
    withTemporaryAsciiCopy: typeof withTemporaryAsciiCopy;
    extractImageTextWithTesseractInternal: (
      filePath: string,
      deps: {
        normalizeText: (value: string) => string;
        withTemporaryAsciiCopy: typeof withTemporaryAsciiCopy;
      },
    ) => Promise<string>;
  },
) {
  return deps.extractImageTextWithTesseractInternal(filePath, {
    normalizeText: deps.normalizeText,
    withTemporaryAsciiCopy: deps.withTemporaryAsciiCopy,
  });
}

export function inferParseMethod(
  ext: string,
  text: string,
  hintedMethod: string | undefined,
  deps: {
    imageExtensions: Set<string>;
    audioExtensions: Set<string>;
  },
) {
  if (hintedMethod) return hintedMethod;
  if (ext === '.txt') return 'text-utf8';
  if (ext === '.md') return 'markdown-utf8';
  if (ext === '.csv') return 'csv-utf8';
  if (ext === '.json') return 'json-utf8';
  if (ext === '.html' || ext === '.htm' || ext === '.xml') return 'html-utf8';
  if (ext === '.docx') return 'mammoth';
  if (ext === '.pptx' || ext === '.pptm') return 'pptx-ooxml';
  if (ext === '.ppt') return 'presentation-pdf-convert';
  if (ext === '.xlsx' || ext === '.xls') return 'xlsx-sheet-reader';
  if (deps.imageExtensions.has(ext)) return text.includes('OCR text:') ? 'image-ocr' : 'image-metadata';
  if (deps.audioExtensions.has(ext)) return 'audio-pending';
  if (ext === '.pdf') {
    return text.includes('OCR fallback') || text.includes('[瑙ｆ瀽閾捐矾]')
      ? 'ocr-fallback'
      : 'pdf-auto';
  }
  return 'unsupported';
}

export function shouldAttemptDetailedMarkdownResolution(
  ext: string,
  parseStage: 'quick' | 'detailed',
  deps: {
    supportsMarkItDownExtension: (ext: string) => boolean;
  },
) {
  return parseStage === 'detailed' && (ext === '.md' || deps.supportsMarkItDownExtension(ext));
}

export function shouldPreserveLegacyAuxiliaryExtraction(ext: string) {
  return ext === '.csv' || ext === '.xlsx' || ext === '.xls';
}

export function shouldTreatLegacyExtractionAsCanonical(ext: string) {
  return ext === '.txt'
    || ext === '.json'
    || ext === '.html'
    || ext === '.htm'
    || ext === '.xml'
    || ext === '.csv';
}
