import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildAugmentedEnv, getOcrMyPdfCommandCandidates, getPythonCommandCandidates } from './runtime-executables.js';

const execFileAsync = promisify(execFile);

export type PdfExtractionResult = {
  text: string;
  pageCount: number;
  method: 'pdf-parse' | 'pypdf' | 'ocrmypdf';
};

type PdfParserDeps = {
  normalizeText: (text: string) => string;
  withTemporaryAsciiCopy: <T>(filePath: string, run: (inputPath: string) => Promise<T>) => Promise<T>;
};

async function extractPdfTextWithPdfParse(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
  const result = await pdfParse(buffer);
  return String(result.text || '');
}

async function extractPdfInfoWithPyPdf(
  filePath: string,
  withTemporaryAsciiCopy: PdfParserDeps['withTemporaryAsciiCopy'],
) {
  const pythonScript = [
    'import json, sys',
    'if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")',
    'try:',
    '    from pypdf import PdfReader',
    'except Exception as exc:',
    '    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))',
    '    sys.exit(0)',
    'try:',
    '    reader = PdfReader(sys.argv[1])',
    '    text = "\\f".join((page.extract_text() or "") for page in reader.pages)',
    '    print(json.dumps({"ok": True, "text": text, "pageCount": len(reader.pages)}, ensure_ascii=False))',
    'except Exception as exc:',
    '    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))',
  ].join('\n');

  return withTemporaryAsciiCopy(filePath, async (inputPath) => {
    const inputCandidates = getPythonCommandCandidates().map((command) => ({
      command,
      args: ['-c', pythonScript, inputPath],
    }));

    for (const candidate of inputCandidates) {
      try {
        const { stdout } = await execFileAsync(candidate.command, candidate.args, {
          maxBuffer: 32 * 1024 * 1024,
          env: buildAugmentedEnv(),
        });
        const parsed = JSON.parse(String(stdout || '{}')) as { ok?: boolean; text?: string; pageCount?: number };
        if (parsed.ok) {
          return {
            text: String(parsed.text || ''),
            pageCount: Number(parsed.pageCount || 0),
          };
        }
      } catch {
        // try next interpreter
      }
    }

    return {
      text: '',
      pageCount: 0,
    };
  });
}

function isPdfTextLowQuality(text: string, pageCount: number, normalizeText: PdfParserDeps['normalizeText']) {
  const normalized = normalizeText(text);
  if (!normalized.length) return true;
  const charsPerPage = pageCount > 0 ? normalized.length / pageCount : normalized.length;
  const whitespaceRatio = text.length > 0 ? normalized.length / text.length : 0;
  return normalized.length < 120 || (pageCount >= 2 && charsPerPage < 80) || whitespaceRatio < 0.35;
}

async function extractPdfTextWithOcrMyPdf(
  filePath: string,
  withTemporaryAsciiCopy: PdfParserDeps['withTemporaryAsciiCopy'],
) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-ocr-'));
  const sidecarPath = path.join(tempDir, 'sidecar.txt');
  const outputPdfPath = path.join(tempDir, 'ocr-output.pdf');

  try {
    return withTemporaryAsciiCopy(filePath, async (inputPath) => {
      for (const command of getOcrMyPdfCommandCandidates()) {
        try {
          await execFileAsync(command, [
            '--force-ocr',
            '--skip-big',
            '50',
            '--sidecar',
            sidecarPath,
            inputPath,
            outputPdfPath,
          ], {
            maxBuffer: 32 * 1024 * 1024,
            env: buildAugmentedEnv(),
          });

          const text = await fs.readFile(sidecarPath, 'utf8').catch(() => '');
          if (text.trim()) return text;
        } catch {
          // try next OCRmyPDF location
        }
      }

      return '';
    });
  } catch {
    return '';
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extractPdfTextWithTesseractRender(
  filePath: string,
  { normalizeText, withTemporaryAsciiCopy }: PdfParserDeps,
) {
  const pythonScript = [
    'import json, os, shutil, subprocess, sys, tempfile',
    'if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")',
    'from pathlib import Path',
    'try:',
    '    import pypdfium2 as pdfium',
    'except Exception as exc:',
    '    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))',
    '    sys.exit(0)',
    'texts = []',
    'work = tempfile.mkdtemp(prefix="aidp-ocr-render-")',
    'try:',
    '    pdf = pdfium.PdfDocument(sys.argv[1])',
    '    page_count = len(pdf)',
    '    for index in range(min(page_count, 20)):',
    '        page = pdf[index]',
    '        bitmap = page.render(scale=2)',
    '        image = bitmap.to_pil()',
    '        image_path = Path(work) / f"page-{index + 1}.png"',
    '        image.save(image_path)',
    '        tesseract_bin = os.environ.get("TESSERACT_BIN", "tesseract")',
    '        command = [tesseract_bin, str(image_path), "stdout", "--psm", "3"]',
    '        result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="ignore")',
    '        if result.returncode == 0 and result.stdout.strip():',
    '            texts.append(result.stdout.strip())',
    '    print(json.dumps({"ok": True, "text": "\\f".join(texts)}, ensure_ascii=False))',
    'except Exception as exc:',
    '    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))',
    'finally:',
    '    shutil.rmtree(work, ignore_errors=True)',
  ].join('\n');

  return withTemporaryAsciiCopy(filePath, async (inputPath) => {
    const candidates = getPythonCommandCandidates().map((command) => ({
      command,
      args: ['-c', pythonScript, inputPath],
    }));

    for (const candidate of candidates) {
      try {
        const { stdout } = await execFileAsync(candidate.command, candidate.args, {
          maxBuffer: 64 * 1024 * 1024,
          env: buildAugmentedEnv(),
        });
        const parsed = JSON.parse(String(stdout || '{}')) as { ok?: boolean; text?: string };
        if (parsed.ok && normalizeText(String(parsed.text || ''))) {
          return String(parsed.text || '');
        }
      } catch {
        // try next interpreter
      }
    }

    return '';
  });
}

export async function extractPdfText(filePath: string, deps: PdfParserDeps) {
  let primaryText = '';
  try {
    primaryText = await extractPdfTextWithPdfParse(filePath);
  } catch {
    primaryText = '';
  }

  const primaryNormalized = deps.normalizeText(primaryText);
  const fallbackInfo = await extractPdfInfoWithPyPdf(filePath, deps.withTemporaryAsciiCopy);
  const fallbackNormalized = deps.normalizeText(fallbackInfo.text);
  const bestText = fallbackNormalized.length > primaryNormalized.length ? fallbackInfo.text : primaryText;
  const bestNormalized = deps.normalizeText(bestText);
  const pageCount = fallbackInfo.pageCount || 0;

  if (!isPdfTextLowQuality(bestText, pageCount, deps.normalizeText)) {
    return {
      text: bestText,
      pageCount,
      method: fallbackNormalized.length > primaryNormalized.length ? 'pypdf' : 'pdf-parse',
    } satisfies PdfExtractionResult;
  }

  const ocrText = await extractPdfTextWithOcrMyPdf(filePath, deps.withTemporaryAsciiCopy);
  const ocrNormalized = deps.normalizeText(ocrText);
  if (ocrNormalized.length > bestNormalized.length) {
    return {
      text: ocrText,
      pageCount,
      method: 'ocrmypdf',
    } satisfies PdfExtractionResult;
  }

  const renderedOcrText = await extractPdfTextWithTesseractRender(filePath, deps);
  const renderedOcrNormalized = deps.normalizeText(renderedOcrText);
  if (renderedOcrNormalized.length > bestNormalized.length) {
    return {
      text: renderedOcrText,
      pageCount,
      method: 'ocrmypdf',
    } satisfies PdfExtractionResult;
  }

  if (bestNormalized.length > 0) {
    return {
      text: bestText,
      pageCount,
      method: fallbackNormalized.length > primaryNormalized.length ? 'pypdf' : 'pdf-parse',
    } satisfies PdfExtractionResult;
  }

  throw new Error('PDF text extraction returned empty content');
}

export async function renderPdfPagesToImages(filePath: string, maxPages = 12) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-presentation-render-'));
  const pythonScript = [
    'import json, sys',
    'if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")',
    'from pathlib import Path',
    'try:',
    '    import pypdfium2 as pdfium',
    'except Exception as exc:',
    '    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))',
    '    sys.exit(0)',
    'pdf_path = sys.argv[1]',
    'work_dir = Path(sys.argv[2])',
    'max_pages = max(1, int(sys.argv[3]))',
    'work_dir.mkdir(parents=True, exist_ok=True)',
    'images = []',
    'try:',
    '    pdf = pdfium.PdfDocument(pdf_path)',
    '    page_count = len(pdf)',
    '    for index in range(min(page_count, max_pages)):',
    '        page = pdf[index]',
    '        bitmap = page.render(scale=2)',
    '        image = bitmap.to_pil()',
    '        image_path = work_dir / f"page-{index + 1}.png"',
    '        image.save(image_path)',
    '        images.append({"pageNumber": index + 1, "imagePath": str(image_path)})',
    '    print(json.dumps({"ok": True, "images": images}, ensure_ascii=False))',
    'except Exception as exc:',
    '    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))',
  ].join('\n');

  try {
    for (const candidate of getPythonCommandCandidates()) {
      try {
        const { stdout } = await execFileAsync(candidate, ['-c', pythonScript, filePath, workDir, String(Math.max(1, maxPages))], {
          maxBuffer: 64 * 1024 * 1024,
          timeout: 120000,
          env: buildAugmentedEnv(),
        });
        const parsed = JSON.parse(String(stdout || '{}')) as {
          ok?: boolean;
          images?: Array<{ pageNumber?: number; imagePath?: string }>;
        };
        if (!parsed.ok || !Array.isArray(parsed.images) || !parsed.images.length) continue;
        const images = parsed.images
          .map((entry) => ({
            pageNumber: Number(entry.pageNumber || 0) || 0,
            imagePath: String(entry.imagePath || '').trim(),
          }))
          .filter((entry) => entry.pageNumber > 0 && entry.imagePath);
        if (images.length) {
          return { images, workDir };
        }
      } catch {
        // try next python candidate
      }
    }

    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    return null;
  } catch {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    return null;
  }
}

export async function renderPdfDocumentToImages(filePath: string, options?: { maxPages?: number }) {
  const rendered = await renderPdfPagesToImages(filePath, Math.max(1, Number(options?.maxPages || 12)));
  if (!rendered) return null;

  return {
    images: rendered.images,
    cleanup: async () => {
      await fs.rm(rendered.workDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
