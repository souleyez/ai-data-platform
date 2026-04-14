import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildAugmentedEnv, getSofficeCommandCandidates } from './runtime-executables.js';
import { extractPdfText, renderPdfPagesToImages } from './document-parser-pdf.js';

const execFileAsync = promisify(execFile);

type PresentationParserDeps = {
  normalizeText: (text: string) => string;
  withTemporaryAsciiCopy: <T>(filePath: string, run: (inputPath: string) => Promise<T>) => Promise<T>;
};

function decodeXmlEntities(input: string) {
  return String(input || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'');
}

function extractPresentationXmlText(xml: string) {
  const values = Array.from(String(xml || '').matchAll(/<(?:a:)?t\b[^>]*>([\s\S]*?)<\/(?:a:)?t>/gi))
    .map((match) => decodeXmlEntities(match[1] || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return [...new Set(values)].join('\n');
}

function extractPresentationSequenceNumber(entryPath: string) {
  const match = path.basename(entryPath).match(/(\d+)/);
  return Number.parseInt(match?.[1] || '0', 10) || 0;
}

function toLocalFileUri(filePath: string) {
  const resolved = path.resolve(filePath).replace(/\\/g, '/');
  return process.platform === 'win32'
    ? `file:///${resolved}`
    : `file://${resolved}`;
}

export async function extractPptxTextFromArchive(filePath: string) {
  const { default: JSZip } = await import('jszip');
  const buffer = await fs.readFile(filePath);
  const archive = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(archive.files)
    .filter((entryPath) => /^ppt\/slides\/slide\d+\.xml$/i.test(entryPath))
    .sort((left, right) => extractPresentationSequenceNumber(left) - extractPresentationSequenceNumber(right));

  if (!slidePaths.length) return '';

  const noteTexts = new Map<number, string>();
  const notePaths = Object.keys(archive.files)
    .filter((entryPath) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(entryPath))
    .sort((left, right) => extractPresentationSequenceNumber(left) - extractPresentationSequenceNumber(right));

  for (const notePath of notePaths) {
    const noteXml = await archive.file(notePath)?.async('text');
    const noteText = extractPresentationXmlText(noteXml || '');
    if (noteText) {
      noteTexts.set(extractPresentationSequenceNumber(notePath), noteText);
    }
  }

  const blocks: string[] = [];
  for (const slidePath of slidePaths) {
    const slideNumber = extractPresentationSequenceNumber(slidePath);
    const slideXml = await archive.file(slidePath)?.async('text');
    const slideText = extractPresentationXmlText(slideXml || '');
    const noteText = noteTexts.get(slideNumber) || '';
    if (!slideText && !noteText) continue;
    blocks.push([
      `# Slide ${slideNumber || blocks.length + 1}`,
      slideText,
      noteText ? `Speaker notes:\n${noteText}` : '',
    ].filter(Boolean).join('\n\n'));
  }

  return blocks.join('\n\n');
}

async function convertPresentationToPdf(
  filePath: string,
  withTemporaryAsciiCopy: PresentationParserDeps['withTemporaryAsciiCopy'],
) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-presentation-'));
  const profileDir = path.join(workDir, 'libreoffice-profile');
  await fs.mkdir(profileDir, { recursive: true });

  try {
    const converted = await withTemporaryAsciiCopy(filePath, async (inputPath) => {
      const outputName = `${path.parse(inputPath).name}.pdf`;
      for (const command of getSofficeCommandCandidates()) {
        try {
          await execFileAsync(command, [
            '--headless',
            `-env:UserInstallation=${toLocalFileUri(profileDir)}`,
            '--convert-to',
            'pdf',
            '--outdir',
            workDir,
            inputPath,
          ], {
            maxBuffer: 32 * 1024 * 1024,
            timeout: 120000,
            env: buildAugmentedEnv(),
          });

          const pdfPath = path.join(workDir, outputName);
          const stat = await fs.stat(pdfPath).catch(() => null);
          if (stat?.isFile() && stat.size > 0) {
            return pdfPath;
          }
        } catch {
          // try next soffice candidate
        }
      }
      return '';
    });

    if (!converted) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      return null;
    }

    return { pdfPath: converted, workDir };
  } catch {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    return null;
  }
}

export async function extractPresentationTextViaPdf(filePath: string, deps: PresentationParserDeps) {
  const converted = await convertPresentationToPdf(filePath, deps.withTemporaryAsciiCopy);
  if (!converted) {
    return { text: '', parseMethod: 'presentation-pdf-convert-unavailable' };
  }

  try {
    const result = await extractPdfText(converted.pdfPath, deps);
    return {
      text: result.text,
      parseMethod: result.method === 'ocrmypdf'
        ? 'presentation-pdf-ocr'
        : 'presentation-pdf-convert',
    };
  } finally {
    await fs.rm(converted.workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function renderPresentationDocumentToImages(filePath: string, options?: { maxSlides?: number }, deps?: Pick<PresentationParserDeps, 'withTemporaryAsciiCopy'>) {
  if (!deps?.withTemporaryAsciiCopy) {
    throw new Error('withTemporaryAsciiCopy dependency is required');
  }

  const converted = await convertPresentationToPdf(filePath, deps.withTemporaryAsciiCopy);
  if (!converted) return null;

  const rendered = await renderPdfPagesToImages(converted.pdfPath, Math.max(1, Number(options?.maxSlides || 12)));
  if (!rendered) {
    await fs.rm(converted.workDir, { recursive: true, force: true }).catch(() => undefined);
    return null;
  }

  return {
    images: rendered.images,
    cleanup: async () => {
      await fs.rm(rendered.workDir, { recursive: true, force: true }).catch(() => undefined);
      await fs.rm(converted.workDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
