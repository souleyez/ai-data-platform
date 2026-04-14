import { promises as fs } from 'node:fs';
import path from 'node:path';

type ExtractTextResult = {
  status: 'parsed' | 'error' | 'unsupported';
  text: string;
  parseMethod?: string;
  tableSummary?: unknown;
};

type ExtractTextDeps = {
  readTextWithBestEffortEncoding: (filePath: string) => Promise<{ text: string; encoding: string }>;
  extractPdfText: (filePath: string) => Promise<{ text: string; method: 'pdf-parse' | 'pypdf' | 'ocrmypdf' }>;
  extractPptxTextFromArchive: (filePath: string) => Promise<string>;
  extractPresentationTextViaPdf: (filePath: string) => Promise<{ text: string; parseMethod: string }>;
  extractImageTextWithTesseract: (filePath: string) => Promise<string>;
  buildWorkbookTableSummary: (source: 'csv' | 'xlsx', sheets: Array<{ name: string; rows: unknown[][] }>) => unknown;
  flattenSpreadsheetRows: (rows: unknown[][]) => string;
  stripHtmlTags: (text: string) => string;
  normalizeText: (text: string) => string;
  imageExtensions: Set<string>;
};

export async function extractTextForDocument(
  filePath: string,
  ext: string,
  deps: ExtractTextDeps,
): Promise<ExtractTextResult> {
  if (ext === '.txt' || ext === '.md' || ext === '.csv') {
    const { text: content, encoding } = await deps.readTextWithBestEffortEncoding(filePath);
    const parseMethod = ext === '.txt'
      ? `text-${encoding}`
      : ext === '.md'
        ? `markdown-${encoding}`
        : `csv-${encoding}`;
    let tableSummary: unknown;
    if (ext === '.csv') {
      try {
        const { read, utils } = await import('xlsx');
        const workbook = read(content, { type: 'string', raw: false });
        tableSummary = deps.buildWorkbookTableSummary('csv', workbook.SheetNames.map((sheetName) => ({
          name: sheetName,
          rows: utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false }) as unknown[][],
        })));
      } catch {
        tableSummary = undefined;
      }
    }
    return { status: 'parsed', text: content, parseMethod, tableSummary };
  }

  if (ext === '.json') {
    const { text: content, encoding } = await deps.readTextWithBestEffortEncoding(filePath);
    const parsed = JSON.parse(content);
    return { status: 'parsed', text: JSON.stringify(parsed, null, 2), parseMethod: `json-${encoding}` };
  }

  if (ext === '.html' || ext === '.htm' || ext === '.xml') {
    const { text: content, encoding } = await deps.readTextWithBestEffortEncoding(filePath);
    return { status: 'parsed', text: deps.stripHtmlTags(content), parseMethod: `html-${encoding}` };
  }

  if (ext === '.pdf') {
    const result = await deps.extractPdfText(filePath);
    const methodNote = result.method === 'ocrmypdf'
      ? '\n\n[解析链路] 当前 PDF 使用 OCR fallback 提取文本。'
      : '';
    return { status: 'parsed', text: `${result.text}${methodNote}` };
  }

  if (ext === '.docx') {
    const { default: mammoth } = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return { status: 'parsed', text: result.value || '', parseMethod: 'mammoth' };
  }

  if (ext === '.pptx' || ext === '.pptm') {
    const archiveText = await deps.extractPptxTextFromArchive(filePath).catch(() => '');
    if (deps.normalizeText(archiveText)) {
      return { status: 'parsed', text: archiveText, parseMethod: 'pptx-ooxml' };
    }
    const fallback = await deps.extractPresentationTextViaPdf(filePath);
    if (deps.normalizeText(fallback.text)) {
      return { status: 'parsed', text: fallback.text, parseMethod: fallback.parseMethod };
    }
    return {
      status: 'error',
      text: `Presentation file: ${path.basename(filePath)}\n\nText was not extracted from this presentation.`,
      parseMethod: fallback.parseMethod,
    };
  }

  if (ext === '.ppt') {
    const fallback = await deps.extractPresentationTextViaPdf(filePath);
    if (deps.normalizeText(fallback.text)) {
      return { status: 'parsed', text: fallback.text, parseMethod: fallback.parseMethod };
    }
    return {
      status: 'error',
      text: `Presentation file: ${path.basename(filePath)}\n\nText was not extracted from this presentation.`,
      parseMethod: fallback.parseMethod,
    };
  }

  if (ext === '.xlsx' || ext === '.xls') {
    const xlsx = await import('xlsx');
    const workbook = xlsx.default?.readFile
      ? xlsx.default.readFile(filePath)
      : xlsx.read(await fs.readFile(filePath), { type: 'buffer', raw: false });
    const { utils } = xlsx;
    const sheetRows = workbook.SheetNames.map((sheetName) => ({
      name: sheetName,
      rows: utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false }) as unknown[][],
    }));
    const text = workbook.SheetNames
      .map((sheetName) => {
        const rows = sheetRows.find((entry) => entry.name === sheetName)?.rows || [];
        const body = deps.flattenSpreadsheetRows(rows.slice(0, 80));
        return [`# ${sheetName}`, body].filter(Boolean).join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
    return {
      status: 'parsed',
      text,
      parseMethod: 'xlsx-sheet-reader',
      tableSummary: deps.buildWorkbookTableSummary('xlsx', sheetRows),
    };
  }

  if (deps.imageExtensions.has(ext)) {
    const imageName = path.basename(filePath);
    const ocrText = await deps.extractImageTextWithTesseract(filePath);
    if (ocrText) {
      return {
        status: 'parsed',
        text: `Image file: ${imageName}\n\nOCR text:\n${ocrText}`,
        parseMethod: 'image-ocr',
      };
    }

    return {
      status: 'error',
      text: `Image file: ${imageName}\n\nOCR text was not extracted from this image.`,
      parseMethod: 'image-ocr-empty',
    };
  }

  return { status: 'unsupported', text: '', parseMethod: 'unsupported' };
}
