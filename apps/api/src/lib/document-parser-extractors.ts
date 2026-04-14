import { readTextWithBestEffortEncoding } from './document-parser-text-reading.js';
import { extractPdfText as extractPdfTextInternal, renderPdfDocumentToImages as renderPdfDocumentToImagesInternal } from './document-parser-pdf.js';
import { extractPptxTextFromArchive, extractPresentationTextViaPdf as extractPresentationTextViaPdfInternal, renderPresentationDocumentToImages as renderPresentationDocumentToImagesInternal } from './document-parser-presentation.js';
import { extractImageTextWithTesseract as extractImageTextWithTesseractInternal } from './document-parser-ocr.js';
import { extractTextForDocument } from './document-parser-text-extraction.js';
import {
  buildWorkbookTableSummary,
  flattenSpreadsheetRows,
  stripHtmlTags,
} from './document-parser-table-summary.js';
import { normalizeText } from './document-parser-text-normalization.js';
import {
  extractImageTextWithTesseractWithRuntime,
  extractPdfTextWithRuntime,
  extractPresentationTextViaPdfWithRuntime,
  withTemporaryAsciiCopy,
} from './document-parser-runtime.js';
import {
  DOCUMENT_AUDIO_EXTENSIONS,
  DOCUMENT_IMAGE_EXTENSIONS,
  DOCUMENT_PRESENTATION_EXTENSIONS,
  type TableSummary,
} from './document-parser-types.js';

const IMAGE_EXTENSIONS = new Set<string>(DOCUMENT_IMAGE_EXTENSIONS);
const PRESENTATION_EXTENSIONS = new Set<string>(DOCUMENT_PRESENTATION_EXTENSIONS);
const AUDIO_EXTENSIONS = new Set<string>(DOCUMENT_AUDIO_EXTENSIONS);

export async function renderPresentationDocumentToImages(filePath: string, options?: { maxSlides?: number }) {
  return renderPresentationDocumentToImagesInternal(filePath, options, { withTemporaryAsciiCopy });
}

export async function renderPdfDocumentToImages(filePath: string, options?: { maxPages?: number }) {
  return renderPdfDocumentToImagesInternal(filePath, options);
}

export async function extractPresentationTextViaPdfForParse(filePath: string) {
  return extractPresentationTextViaPdfWithRuntime(filePath, {
    normalizeText,
    withTemporaryAsciiCopy,
    extractPresentationTextViaPdfInternal,
  });
}

export async function extractPdfTextForParse(filePath: string) {
  return extractPdfTextWithRuntime(filePath, {
    normalizeText,
    withTemporaryAsciiCopy,
    extractPdfTextInternal,
  });
}

export async function extractImageTextWithTesseractForParse(filePath: string) {
  return extractImageTextWithTesseractWithRuntime(filePath, {
    normalizeText,
    withTemporaryAsciiCopy,
    extractImageTextWithTesseractInternal,
  });
}

export async function extractTextForParse(filePath: string, ext: string) {
  const result = await extractTextForDocument(filePath, ext, {
    readTextWithBestEffortEncoding,
    extractPdfText: extractPdfTextForParse,
    extractPptxTextFromArchive,
    extractPresentationTextViaPdf: extractPresentationTextViaPdfForParse,
    extractImageTextWithTesseract: extractImageTextWithTesseractForParse,
    buildWorkbookTableSummary,
    flattenSpreadsheetRows,
    stripHtmlTags,
    normalizeText,
    imageExtensions: IMAGE_EXTENSIONS,
  });
  return result as {
    status: 'parsed' | 'error' | 'unsupported';
    text: string;
    parseMethod?: string;
    tableSummary?: TableSummary;
  };
}

export function buildDocumentParserExtensionSets() {
  return {
    imageExtensions: IMAGE_EXTENSIONS,
    presentationExtensions: PRESENTATION_EXTENSIONS,
    audioExtensions: AUDIO_EXTENSIONS,
  };
}
