import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { detectBizCategoryFromConfig, type DocumentCategoryConfig } from './document-config.js';
import { buildStructuredProfile, deriveSchemaProfile, includesAnyText, inferSchemaType, isLikelyResumePersonName, refreshDerivedSchemaProfile } from './document-schema.js';
import { canonicalizeResumeFields } from './resume-canonicalizer.js';
import {
  buildAugmentedEnv,
  getOcrMyPdfCommandCandidates,
  getPythonCommandCandidates,
  getTesseractLanguageCandidates,
} from './runtime-executables.js';
import { extractWithUIEWorker } from './uie-process-client.js';

export { deriveSchemaProfile, refreshDerivedSchemaProfile } from './document-schema.js';

export type ParsedDocument = {
  path: string;
  name: string;
  ext: string;
  title: string;
  category: string;
  bizCategory: 'paper' | 'contract' | 'daily' | 'invoice' | 'order' | 'service' | 'inventory' | 'general';
  confirmedBizCategory?: 'paper' | 'contract' | 'daily' | 'invoice' | 'order' | 'service' | 'inventory' | 'general';
  categoryConfirmedAt?: string;
  parseStatus: 'parsed' | 'unsupported' | 'error';
  parseMethod?: string;
  summary: string;
  excerpt: string;
  fullText?: string;
  extractedChars: number;
  evidenceChunks?: EvidenceChunk[];
  entities?: StructuredEntity[];
  claims?: StructuredClaim[];
  intentSlots?: IntentSlots;
  resumeFields?: ResumeFields;
  riskLevel?: 'low' | 'medium' | 'high';
  topicTags?: string[];
  groups?: string[];
  confirmedGroups?: string[];
  suggestedGroups?: string[];
  ignored?: boolean;
  contractFields?: {
    contractNo?: string;
    amount?: string;
    paymentTerms?: string;
    duration?: string;
  };
  retentionStatus?: 'structured-only';
  retainedAt?: string;
  originalDeletedAt?: string;
  cloudStructuredAt?: string;
  cloudStructuredModel?: string;
  parseStage?: 'quick' | 'detailed';
  detailParseStatus?: 'queued' | 'processing' | 'succeeded' | 'failed';
  detailParseQueuedAt?: string;
  detailParsedAt?: string;
  detailParseAttempts?: number;
  detailParseError?: string;
  analysisEditedAt?: string;
  manualSummary?: boolean;
  manualStructuredProfile?: boolean;
  manualEvidenceChunks?: boolean;
  schemaType?: 'generic' | 'contract' | 'resume' | 'paper' | 'formula' | 'technical' | 'report';
  structuredProfile?: Record<string, unknown>;
};

export type EvidenceChunk = {
  id: string;
  order: number;
  text: string;
  charLength: number;
  title?: string;
};

export type StructuredEntity = {
  text: string;
  type: 'ingredient' | 'strain' | 'audience' | 'benefit' | 'dose' | 'organization' | 'metric' | 'identifier' | 'term';
  source: 'rule' | 'uie';
  confidence: number;
  evidenceChunkId?: string;
};

export type StructuredClaim = {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  evidenceChunkId?: string;
};

export type IntentSlots = {
  audiences?: string[];
  ingredients?: string[];
  strains?: string[];
  benefits?: string[];
  doses?: string[];
  organizations?: string[];
  metrics?: string[];
};

export type ResumeFields = {
  candidateName?: string;
  targetRole?: string;
  currentRole?: string;
  yearsOfExperience?: string;
  education?: string;
  major?: string;
  expectedCity?: string;
  expectedSalary?: string;
  latestCompany?: string;
  companies?: string[];
  skills?: string[];
  highlights?: string[];
  projectHighlights?: string[];
  itProjectHighlights?: string[];
};

export type ParseDocumentOptions = {
  stage?: 'quick' | 'detailed';
};

const CATEGORY_HINTS: Record<'contract' | 'technical' | 'paper' | 'report', string[]> = {
  contract: ['contract', '合同', '协议', '条款', '付款', '甲方', '乙方', '采购'],
  technical: ['技术', '方案', '需求', '架构', '系统', '接口', '部署', '采集', '智能化', '白皮书', '知识库'],
  paper: ['paper', 'study', 'research', 'trial', 'randomized', 'placebo', 'abstract', 'introduction', 'methods', 'results', 'conclusion', 'mouse model', 'mice', 'zebrafish', '文献', '研究', '实验', '随机', '双盲'],
  report: ['report', '日报', '周报', '月报', '复盘'],
};

const RESUME_HINTS = ['简历', '履历', '候选人', '应聘', '求职', '教育经历', '工作经历', '项目经历', '期望薪资', '目标岗位', 'resume', 'curriculum vitae', 'cv'];

type KeywordRule = string | RegExp;
const execFileAsync = promisify(execFile);
export const DOCUMENT_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'] as const;
export const DOCUMENT_PARSE_SUPPORTED_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.md',
  '.docx',
  '.csv',
  '.json',
  '.html',
  '.htm',
  '.xml',
  '.xlsx',
  '.xls',
  ...DOCUMENT_IMAGE_EXTENSIONS,
] as const;
const IMAGE_EXTENSIONS = new Set<string>(DOCUMENT_IMAGE_EXTENSIONS);
const UNSUPPORTED_PARSE_SUMMARY = '当前版本暂未支持该文件类型的正文提取。已支持 pdf、txt、md、docx、csv、json、html、xml、xlsx、xls、png、jpg、jpeg、webp、gif、bmp。';

type PdfExtractionResult = {
  text: string;
  pageCount: number;
  method: 'pdf-parse' | 'pypdf' | 'ocrmypdf';
};

const ENABLE_PADDLE_UIE = process.env.ENABLE_PADDLE_UIE === '1' || process.env.ENABLE_PADDLE_UIE_SERVICE === '1';
const UIE_SCHEMA_BASE = ['\u4eba\u7fa4', '\u6210\u5206', '\u83cc\u682a', '\u529f\u6548', '\u5242\u91cf', '\u673a\u6784', '\u6307\u6807'] as const;
const UIE_SCHEMA_TECHNICAL = ['\u529f\u6548', '\u673a\u6784', '\u6307\u6807'] as const;
const UIE_SCHEMA_CONTRACT = ['\u673a\u6784', '\u6307\u6807'] as const;

function getUIESchemaForCategory(category: string) {
  if (category === 'technical') return UIE_SCHEMA_TECHNICAL;
  if (category === 'contract') return UIE_SCHEMA_CONTRACT;
  return UIE_SCHEMA_BASE;
}

function mergeUIESlotMaps(slotMaps: Array<Record<string, string[]>>) {
  const merged = new Map<string, string[]>();

  for (const slotMap of slotMaps) {
    for (const [key, values] of Object.entries(slotMap || {})) {
      const existing = merged.get(key) || [];
      for (const value of values || []) {
        const normalized = String(value || '').trim();
        if (normalized && !existing.includes(normalized)) {
          existing.push(normalized);
        }
      }
      merged.set(key, existing);
    }
  }

  return Object.fromEntries(merged.entries());
}
const UIE_SCHEMA = ['人群', '成分', '菌株', '功效', '剂量', '机构', '指标'] as const;

function needsTemporaryAsciiPath(filePath: string) {
  return process.platform === 'win32' && /[^\x00-\x7F]/.test(filePath);
}

async function withTemporaryAsciiCopy<T>(filePath: string, run: (inputPath: string) => Promise<T>) {
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

function stripMarkdownSyntax(text: string) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}

function normalizeText(text: string) {
  return stripMarkdownSyntax(text).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isValidStrainCandidate(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^IL-\d+$/i.test(text)) return false;
  if (/^(IFN|TNF|TGF)-?[A-Z0-9]+$/i.test(text)) return false;
  if (/\b(?:interleukin|cytokine|transforming growth factor|interferon)\b/i.test(text)) return false;
  if (/\b(?:and|in|on|of|for)\b/i.test(text) && !/\b(?:Lactobacillus|Bifidobacterium|Bacillus|Streptococcus)\b/i.test(text)) return false;
  return true;
}

function isValidDoseCandidate(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^\d+(?:\.\d+)?\s?(?:mg|g|kg|ml|ug|IU|CFU)$/i.test(text)) return true;
  if (/^\d+(?:\.\d+)?\s?(?:x|×)\s?10\^?\d+\s?(?:CFU)?$/i.test(text)) return true;
  if (/^\d+(?:\.\d+)?e[+-]?\d{1,2}$/i.test(text)) return true;
  return false;
}

function filterSlotValues(values: string[] | undefined, type: StructuredEntity['type']) {
  const normalized = uniqStrings(values || []);
  if (type === 'strain') return normalized.filter(isValidStrainCandidate);
  if (type === 'dose') return normalized.filter(isStrictDoseCandidate);
  return normalized;
}

function isStrictDoseCandidate(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^\d+(?:\.\d+)?\s?(?:mg|g|kg|ml|ug|μg|IU)$/i.test(text)) return true;
  if (/^\d+(?:\.\d+)?\s?(?:x|×|脳)\s?10\^?\d+\s?(?:CFU)?$/i.test(text)) return true;
  const scientificMatch = text.match(/^(\d+(?:\.\d+)?)e([+-]?\d{1,2})$/i);
  if (!scientificMatch) return false;
  const mantissa = Number(scientificMatch[1]);
  const exponent = Number(scientificMatch[2]);
  return mantissa > 0 && mantissa <= 20 && exponent >= 6 && exponent <= 12;
}

function splitEvidenceChunks(text: string): EvidenceChunk[] {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n{2,}/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 40);

  const sourceBlocks = blocks.length ? blocks : normalized
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 40);

  const chunks: EvidenceChunk[] = [];
  const maxChunkLength = 420;

  for (const block of sourceBlocks) {
    if (block.length <= maxChunkLength) {
      chunks.push({
        id: `chunk-${chunks.length + 1}`,
        order: chunks.length,
        text: block,
        charLength: block.length,
      });
      continue;
    }

    let cursor = 0;
    while (cursor < block.length) {
      let next = Math.min(cursor + maxChunkLength, block.length);
      if (next < block.length) {
        const window = block.slice(cursor, next);
        const softCut = Math.max(
          window.lastIndexOf('。'),
          window.lastIndexOf('；'),
          window.lastIndexOf('. '),
          window.lastIndexOf('; '),
        );
        if (softCut >= 120) next = cursor + softCut + 1;
      }

      const piece = block.slice(cursor, next).trim();
      if (piece.length >= 40) {
        chunks.push({
          id: `chunk-${chunks.length + 1}`,
          order: chunks.length,
          text: piece,
          charLength: piece.length,
        });
      }
      cursor = next;
    }
  }

  return chunks.slice(0, 12);
}

function stripHtmlTags(text: string) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function flattenSpreadsheetRows(rows: unknown[][]) {
  return rows
    .map((row) => row.map((cell) => String(cell ?? '').trim()).filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

async function extractImageTextWithTesseract(filePath: string) {
  const env = buildAugmentedEnv();
  const candidates = [
    env.TESSERACT_BIN || '',
    process.platform === 'win32' ? 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe' : '',
    'tesseract',
  ].filter(Boolean);
  const languageCandidates = getTesseractLanguageCandidates();
  const psmCandidates = ['6', '3'];

  return withTemporaryAsciiCopy(filePath, async (inputPath) => {
    for (const command of candidates) {
      for (const language of languageCandidates) {
        for (const psm of psmCandidates) {
          try {
            const { stdout } = await execFileAsync(command, [inputPath, 'stdout', '--psm', psm, '-l', language], {
              maxBuffer: 16 * 1024 * 1024,
              env,
            });
            const text = normalizeText(String(stdout || ''));
            if (text) return text;
          } catch {
            // Try the next OCR configuration.
          }
        }
      }
    }

    return '';
  });
}

async function readUtf8Text(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return buffer.toString('utf8');
}

function hasUtf8Bom(buffer: Buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function hasUtf16LeBom(buffer: Buffer) {
  return buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
}

function hasUtf16BeBom(buffer: Buffer) {
  return buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff;
}

function isExactUtf8RoundTrip(buffer: Buffer) {
  try {
    return Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer);
  } catch {
    return false;
  }
}

function scoreDecodedText(text: string) {
  if (!text) return -1000;

  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  const nullCount = (text.match(/\u0000/g) || []).length;
  const controlCount = (text.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  const cjkCount = (text.match(/[\u4E00-\u9FFF]/g) || []).length;
  const asciiWordCount = (text.match(/[A-Za-z0-9]/g) || []).length;
  const whitespaceCount = (text.match(/\s/g) || []).length;
  const mojibakeChars = [0x951F, 0x9225, 0x935A, 0x93C2, 0x7EE0]
    .map((codePoint) => String.fromCodePoint(codePoint));
  const mojibakeCount = mojibakeChars.reduce(
    (count, char) => count + ((text.match(new RegExp(char, 'g')) || []).length),
    0,
  );

  return (cjkCount * 3)
    + asciiWordCount
    + whitespaceCount
    - (replacementCount * 40)
    - (nullCount * 30)
    - (controlCount * 20)
    - (mojibakeCount * 8);
}

async function readTextWithBestEffortEncoding(filePath: string) {
  const buffer = await fs.readFile(filePath);

  if (hasUtf8Bom(buffer)) {
    return { text: new TextDecoder('utf-8').decode(buffer), encoding: 'utf8-bom' };
  }

  if (hasUtf16LeBom(buffer)) {
    return { text: new TextDecoder('utf-16le').decode(buffer), encoding: 'utf16le' };
  }

  if (hasUtf16BeBom(buffer)) {
    return { text: new TextDecoder('utf-16be').decode(buffer), encoding: 'utf16be' };
  }

  // Prefer UTF-8 when the raw bytes round-trip exactly. This avoids misclassifying
  // mostly-ASCII CSV files with a small amount of Chinese text as gb18030.
  if (isExactUtf8RoundTrip(buffer)) {
    return { text: buffer.toString('utf8'), encoding: 'utf8' };
  }

  const candidates: Array<{ text: string; encoding: string }> = [
    { text: buffer.toString('utf8'), encoding: 'utf8' },
  ];

  try {
    candidates.push({ text: new TextDecoder('gb18030').decode(buffer), encoding: 'gb18030' });
  } catch {
    // ignore
  }

  try {
    candidates.push({ text: new TextDecoder('utf-16le').decode(buffer), encoding: 'utf16le' });
  } catch {
    // ignore
  }

  try {
    candidates.push({ text: new TextDecoder('utf-16be').decode(buffer), encoding: 'utf16be' });
  } catch {
    // ignore
  }

  const ranked = candidates
    .map((candidate) => ({ ...candidate, score: scoreDecodedText(candidate.text) }))
    .sort((left, right) => right.score - left.score);

  return ranked[0] || { text: buffer.toString('utf8'), encoding: 'utf8' };
}

async function extractPdfTextWithPdfParse(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
  const result = await pdfParse(buffer);
  return String(result.text || '');
}

async function extractPdfTextWithPyPdf(filePath: string) {
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
    '    text = "\\n".join((page.extract_text() or "") for page in reader.pages)',
    '    print(json.dumps({"ok": True, "text": text}, ensure_ascii=False))',
    'except Exception as exc:',
    '    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))',
  ].join('\n');

  const candidates = getPythonCommandCandidates().map((command) => ({
    command,
    args: ['-c', pythonScript, filePath],
  }));

  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(candidate.command, candidate.args, {
        maxBuffer: 16 * 1024 * 1024,
        env: buildAugmentedEnv(),
      });
      const parsed = JSON.parse(String(stdout || '{}')) as { ok?: boolean; text?: string };
      if (parsed.ok && parsed.text) return parsed.text;
    } catch {
      // Try the next interpreter.
    }
  }

  return '';
}

async function extractPdfInfoWithPyPdf(filePath: string) {
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
    '    text = "\\n".join((page.extract_text() or "") for page in reader.pages)',
    '    print(json.dumps({"ok": True, "text": text, "pageCount": len(reader.pages)}, ensure_ascii=False))',
    'except Exception as exc:',
    '    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))',
  ].join('\n');

  const candidates = getPythonCommandCandidates().map((command) => ({
    command,
    args: ['-c', pythonScript, filePath],
  }));

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

function isPdfTextLowQuality(text: string, pageCount: number) {
  const normalized = normalizeText(text);
  if (!normalized.length) return true;
  const charsPerPage = pageCount > 0 ? normalized.length / pageCount : normalized.length;
  const whitespaceRatio = text.length > 0 ? normalized.length / text.length : 0;
  return normalized.length < 120 || (pageCount >= 2 && charsPerPage < 80) || whitespaceRatio < 0.35;
}

async function extractPdfTextWithOcrMyPdf(filePath: string) {
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
          if (normalizeText(text)) return text;
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

async function extractPdfTextWithTesseractRender(filePath: string) {
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
    '    print(json.dumps({"ok": True, "text": "\\n\\n".join(texts)}, ensure_ascii=False))',
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

async function extractPdfText(filePath: string) {
  let primaryText = '';
  try {
    primaryText = await extractPdfTextWithPdfParse(filePath);
  } catch {
    primaryText = '';
  }

  const primaryNormalized = normalizeText(primaryText);
  const fallbackInfo = await extractPdfInfoWithPyPdf(filePath);
  const fallbackNormalized = normalizeText(fallbackInfo.text);
  const bestText = fallbackNormalized.length > primaryNormalized.length ? fallbackInfo.text : primaryText;
  const bestNormalized = normalizeText(bestText);
  const pageCount = fallbackInfo.pageCount || 0;

  if (!isPdfTextLowQuality(bestText, pageCount)) {
    return {
      text: bestText,
      pageCount,
      method: fallbackNormalized.length > primaryNormalized.length ? 'pypdf' : 'pdf-parse',
    } satisfies PdfExtractionResult;
  }

  const ocrText = await extractPdfTextWithOcrMyPdf(filePath);
  const ocrNormalized = normalizeText(ocrText);
  if (ocrNormalized.length > bestNormalized.length) {
    return {
      text: ocrText,
      pageCount,
      method: 'ocrmypdf',
    } satisfies PdfExtractionResult;
  }

  const renderedOcrText = await extractPdfTextWithTesseractRender(filePath);
  const renderedOcrNormalized = normalizeText(renderedOcrText);
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

function summarize(text: string, fallback: string) {
  const normalized = normalizeText(text);
  if (!normalized) return fallback;
  return normalized.slice(0, 140) + (normalized.length > 140 ? '...' : '');
}

function excerpt(text: string, fallback: string) {
  const normalized = normalizeText(text);
  if (!normalized) return fallback;
  return normalized.slice(0, 360) + (normalized.length > 360 ? '...' : '');
}

function uniqStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function mergeStringArrays(...groups: Array<string[] | undefined>) {
  return uniqStrings(groups.flatMap((group) => group || []));
}

function uniqEntities(items: StructuredEntity[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findChunkIdForText(evidenceChunks: EvidenceChunk[] | undefined, text: string) {
  if (!text || !evidenceChunks?.length) return undefined;
  const lowered = text.toLowerCase();
  return evidenceChunks.find((chunk) => chunk.text.toLowerCase().includes(lowered))?.id;
}

function collectRegexMatches(text: string, patterns: RegExp[]) {
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = String(match[0] || '').trim();
      if (value) found.add(value);
    }
  }
  return [...found];
}

async function extractStructuredDataWithUIE(
  text: string,
  category: string,
  evidenceChunks: EvidenceChunk[],
): Promise<Partial<IntentSlots>> {
  if (!ENABLE_PADDLE_UIE) {
    return {};
  }

  try {
    const schema = getUIESchemaForCategory(category);
    const segments = [
      text.slice(0, 1200),
      ...evidenceChunks
        .slice(0, 6)
        .map((chunk) => chunk.text)
        .filter(Boolean),
    ]
      .map((item) => normalizeText(item))
      .filter((item, index, items) => item.length >= 40 && items.indexOf(item) === index);

    if (!segments.length) {
      return {};
    }

    const slotMaps = await Promise.all(
      segments.map((segment) => extractWithUIEWorker({
        text: segment.slice(0, 2000),
        model: process.env.PADDLE_UIE_MODEL || 'uie-base',
        schema,
      })),
    );

    const slots = mergeUIESlotMaps(slotMaps);

    return {
      audiences: slots['\u4eba\u7fa4'] || [],
      ingredients: slots['\u6210\u5206'] || [],
      strains: slots['\u83cc\u682a'] || [],
      benefits: slots['\u529f\u6548'] || [],
      doses: slots['\u5242\u91cf'] || [],
      organizations: slots['\u673a\u6784'] || [],
      metrics: slots['\u6307\u6807'] || [],
    };
  } catch {
    // ignore and fallback to rule extractor
  }

  return {};
}

async function extractStructuredData(
  text: string,
  category: string,
  evidenceChunks: EvidenceChunk[],
  topicTags: string[],
  contractFields: ParsedDocument['contractFields'],
) {
  const normalized = normalizeText(text);
  const lowered = normalized.toLowerCase();

  const ingredientMatches = uniqStrings(collectRegexMatches(normalized, [
    /\b(?:HMO|HMOs|DHA|ARA|FOS|GOS|MFGM|EPA|DPA)\b/gi,
    /(?:乳铁蛋白|叶黄素|胆碱|牛磺酸|低聚果糖|低聚半乳糖|核苷酸|后生元|益生元|益生菌|蛋白质|钙|铁|锌)/g,
  ]));
  const strainMatches = category === 'contract'
    ? []
    : collectRegexMatches(normalized, [
      /\b[A-Z]{1,5}-\d{1,5}\b/g,
      /\b(?:Lactobacillus|Bifidobacterium|Bacillus|Streptococcus)\s+[A-Za-z-]+\b/gi,
      /(?:鼠李糖乳杆菌|乳双歧杆菌|动物双歧杆菌|副干酪乳杆菌|嗜酸乳杆菌)/g,
    ]).filter(isValidStrainCandidate);
  const audienceMatches = uniqStrings([
    ...collectRegexMatches(normalized, [
      /(?:婴儿|婴幼儿|宝宝|儿童|青少年|成人|中老年|孕妇|老年人|幼猫|成猫|幼犬|成犬)/g,
    ]),
  ]);
  const benefitMatches = uniqStrings([
    ...topicTags,
    ...collectRegexMatches(normalized, [
      /(?:肠道健康|免疫支持|脑健康|认知支持|过敏免疫|体重管理|骨骼健康|睡眠舒缓|抗抑郁|消化吸收|皮毛健康|泌尿道健康)/g,
    ]),
  ]);
  const doseMatches = filterSlotValues(uniqStrings([
    ...collectRegexMatches(normalized, [
      /\b\d+(?:\.\d+)?\s?(?:mg|g|kg|ml|μg|ug|IU|CFU)\b/gi,
      /\b\d+(?:\.\d+)?\s?×\s?10\^?\d+\s?(?:CFU|cfu)\b/g,
      /\b\d+(?:\.\d+)?E[+-]?\d+\b/gi,
    ]),
  ]), 'dose');
  const organizationMatches = uniqStrings([
    ...collectRegexMatches(normalized, [
      /\b(?:WHO|FAO|EFSA|FDA|CDC|PMC|DOAJ|arXiv)\b/g,
      /(?:世界卫生组织|国家卫健委|欧盟食品安全局|美国食品药品监督管理局)/g,
    ]),
  ]);
  const metricMatches = uniqStrings([
    ...collectRegexMatches(normalized, [
      /\b(?:p\s?[<=>]\s?0\.\d+|OR\s?[=:]?\s?\d+(?:\.\d+)?|RR\s?[=:]?\s?\d+(?:\.\d+)?|CI\s?[=:]?\s?\d+(?:\.\d+)?)/gi,
    ]),
  ]);

  const ruleEntities: StructuredEntity[] = [
    ...ingredientMatches.map((item) => ({
      text: item,
      type: 'ingredient' as const,
      source: 'rule' as const,
      confidence: 0.72,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...strainMatches.map((item) => ({
      text: item,
      type: 'strain' as const,
      source: 'rule' as const,
      confidence: 0.8,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...audienceMatches.map((item) => ({
      text: item,
      type: 'audience' as const,
      source: 'rule' as const,
      confidence: 0.76,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...benefitMatches.map((item) => ({
      text: item,
      type: 'benefit' as const,
      source: 'rule' as const,
      confidence: 0.68,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...doseMatches.map((item) => ({
      text: item,
      type: 'dose' as const,
      source: 'rule' as const,
      confidence: 0.74,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...organizationMatches.map((item) => ({
      text: item,
      type: 'organization' as const,
      source: 'rule' as const,
      confidence: 0.7,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...metricMatches.map((item) => ({
      text: item,
      type: 'metric' as const,
      source: 'rule' as const,
      confidence: 0.64,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(contractFields?.contractNo ? [{
      text: contractFields.contractNo,
      type: 'identifier' as const,
      source: 'rule' as const,
      confidence: 0.9,
      evidenceChunkId: findChunkIdForText(evidenceChunks, contractFields.contractNo),
    }] : []),
  ];

  const claims: StructuredClaim[] = [];
  for (const benefit of benefitMatches.slice(0, 6)) {
    if (strainMatches.length) {
      for (const strain of strainMatches.slice(0, 3)) {
        claims.push({
          subject: strain,
          predicate: 'supports',
          object: benefit,
          confidence: 0.66,
          evidenceChunkId: findChunkIdForText(evidenceChunks, strain) || findChunkIdForText(evidenceChunks, benefit),
        });
      }
    } else if (ingredientMatches.length) {
      for (const ingredient of ingredientMatches.slice(0, 3)) {
        claims.push({
          subject: ingredient,
          predicate: 'related_to',
          object: benefit,
          confidence: 0.6,
          evidenceChunkId: findChunkIdForText(evidenceChunks, ingredient) || findChunkIdForText(evidenceChunks, benefit),
        });
      }
    }
  }

  if (contractFields?.contractNo) {
    claims.push({
      subject: contractFields.contractNo,
      predicate: 'contract_amount',
      object: contractFields.amount || '-',
      confidence: 0.84,
    });
  }

  const rawUieSlots = category === 'paper' || category === 'technical' || category === 'contract'
    ? await extractStructuredDataWithUIE(normalized, category, evidenceChunks)
    : {};
  const uieSlots: IntentSlots = {
    audiences: filterSlotValues(rawUieSlots.audiences, 'audience'),
    ingredients: filterSlotValues(rawUieSlots.ingredients, 'ingredient'),
    strains: filterSlotValues(rawUieSlots.strains, 'strain'),
    benefits: filterSlotValues(rawUieSlots.benefits, 'benefit'),
    doses: filterSlotValues(rawUieSlots.doses, 'dose'),
    organizations: filterSlotValues(rawUieSlots.organizations, 'organization'),
    metrics: filterSlotValues(rawUieSlots.metrics, 'metric'),
  };

  const uieEntities: StructuredEntity[] = [
    ...(uieSlots.audiences || []).map((item) => ({
      text: item,
      type: 'audience' as const,
      source: 'uie' as const,
      confidence: 0.86,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(uieSlots.ingredients || []).map((item) => ({
      text: item,
      type: 'ingredient' as const,
      source: 'uie' as const,
      confidence: 0.86,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(uieSlots.strains || []).map((item) => ({
      text: item,
      type: 'strain' as const,
      source: 'uie' as const,
      confidence: 0.88,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(uieSlots.benefits || []).map((item) => ({
      text: item,
      type: 'benefit' as const,
      source: 'uie' as const,
      confidence: 0.84,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(uieSlots.doses || []).map((item) => ({
      text: item,
      type: 'dose' as const,
      source: 'uie' as const,
      confidence: 0.82,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(uieSlots.organizations || []).map((item) => ({
      text: item,
      type: 'organization' as const,
      source: 'uie' as const,
      confidence: 0.82,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(uieSlots.metrics || []).map((item) => ({
      text: item,
      type: 'metric' as const,
      source: 'uie' as const,
      confidence: 0.8,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
  ];

  return {
    entities: uniqEntities([...uieEntities, ...ruleEntities]).slice(0, 40),
    claims: claims.slice(0, 20),
    intentSlots: {
      audiences: mergeStringArrays(audienceMatches, uieSlots.audiences),
      ingredients: mergeStringArrays(ingredientMatches, uieSlots.ingredients),
      strains: mergeStringArrays(strainMatches, uieSlots.strains),
      benefits: mergeStringArrays(benefitMatches, uieSlots.benefits),
      doses: mergeStringArrays(doseMatches, uieSlots.doses),
      organizations: mergeStringArrays(organizationMatches, uieSlots.organizations),
      metrics: mergeStringArrays(metricMatches, uieSlots.metrics),
    } satisfies IntentSlots,
  };
}

function cleanTitleCandidate(line: string) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/^[（(][^)）]{1,12}[)）]\s*/, '')
    .trim();
}

function inferTitle(text: string, fallbackName: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => cleanTitleCandidate(line.trim()))
    .filter(Boolean);

  const picked = lines.find((line) => line.length >= 4 && line.length <= 160 && !/^[\d\W_]+$/.test(line));
  if (picked) return picked;

  return path.parse(fallbackName).name;
}

function buildEvidence(filePath: string, text = '') {
  const name = path.basename(filePath);
  const normalizedText = normalizeText(text).slice(0, 8000);
  return `${filePath} ${name} ${normalizedText}`.toLowerCase();
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(text: string, rule: KeywordRule) {
  if (!text) return false;
  if (rule instanceof RegExp) return rule.test(text);

  const normalizedRule = rule.toLowerCase();
  if (!/[a-z]/.test(normalizedRule)) return text.includes(normalizedRule);

  return new RegExp(`\\b${escapeRegex(normalizedRule)}\\b`, 'i').test(text);
}

function scoreHints(evidence: string, hints: string[]) {
  return hints.reduce((score, hint) => score + (matchesKeyword(evidence, hint) ? (hint.length >= 6 ? 3 : 2) : 0), 0);
}

export function detectCategory(filePath: string, text = '') {
  const evidence = buildEvidence(filePath, text);
  if (RESUME_HINTS.some((hint) => evidence.includes(hint.toLowerCase()))) return 'resume';
  const scores = {
    contract: scoreHints(evidence, CATEGORY_HINTS.contract),
    technical: scoreHints(evidence, CATEGORY_HINTS.technical),
    paper: scoreHints(evidence, CATEGORY_HINTS.paper),
    report: scoreHints(evidence, CATEGORY_HINTS.report),
  };

  if (scores.contract >= 4 && scores.contract >= scores.paper) return 'contract';
  if (scores.paper >= 4 && scores.paper >= scores.technical) return 'paper';
  if (scores.report >= 4 && scores.report >= scores.technical) return 'report';
  if (scores.technical >= 3) return 'technical';

  const lower = filePath.toLowerCase();
  if (lower.includes('contract') || lower.includes('合同')) return 'contract';
  if (lower.includes('tech') || lower.includes('技术')) return 'technical';
  if (lower.includes('paper') || lower.includes('论文')) return 'paper';
  if (lower.includes('report') || lower.includes('日报') || lower.includes('周报')) return 'report';
  return 'general';
}

export function detectBizCategory(filePath: string, category: string, text = '', config?: DocumentCategoryConfig): ParsedDocument['bizCategory'] {
  if (config) {
    const matched = detectBizCategoryFromConfig(filePath, config);
    if (matched) return matched;
  }

  const evidence = buildEvidence(filePath, text);
  const hasOrderFieldSignal = /(order_id|order_count|units_sold|net_sales|gross_profit|gross_margin|avg_order_value|refund_total|discount_total|shop_name)/i.test(evidence);
  const hasInventoryFieldSignal = /(inventory_index|days_of_cover|safety_stock|replenishment_priority|risk_flag|platform_focus|warehouse|inbound_7d)/i.test(evidence);
  const hasOrderPathSignal = /(?:order|orders|sales)[-_/\\]/i.test(filePath);
  const hasInventoryPathSignal = /(?:inventory|stock|sku)[-_/\\]/i.test(filePath);
  if (category === 'resume' || RESUME_HINTS.some((hint) => evidence.includes(hint.toLowerCase()))) return 'general';
  if (scoreHints(evidence, ['发票', '票据', '凭据', 'invoice']) >= 4) return 'invoice';
  if (hasOrderFieldSignal) return 'order';
  if (hasInventoryFieldSignal) return 'inventory';
  if (hasInventoryPathSignal) return 'inventory';
  if (hasOrderPathSignal) return 'order';
  if (scoreHints(evidence, ['订单', '回款', '销售', 'order']) >= 4) return 'order';
  if (scoreHints(evidence, ['客服', '工单', '投诉', 'service']) >= 4) return 'service';
  if (scoreHints(evidence, ['库存', 'sku', '出入库', 'inventory']) >= 4) return 'inventory';
  if (category === 'contract' || scoreHints(evidence, CATEGORY_HINTS.contract) >= 4) return 'contract';
  if (category === 'report' || scoreHints(evidence, CATEGORY_HINTS.report) >= 4) return 'daily';
  if (category === 'paper' || scoreHints(evidence, CATEGORY_HINTS.paper) >= 5) return 'paper';
  return 'general';
}

function normalizeResumeTextValue(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function inferResumeNameFromTitle(title: string) {
  const normalized = String(title || '')
    .replace(/^\d{10,}-/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  const fromResumePattern = normalized.match(/简历[-\s(（]*([\u4e00-\u9fff·]{2,12})|([\u4e00-\u9fff·]{2,12})[-\s]*简历/);
  const candidate = fromResumePattern?.[1] || fromResumePattern?.[2] || '';
  if (isLikelyResumePersonName(candidate)) return candidate;
  const chineseName = normalized.match(/[\u4e00-\u9fff·]{2,12}/g)?.find(isLikelyResumePersonName);
  return chineseName || normalized;
}

function cutOffNextResumeLabel(value: string) {
  const normalized = normalizeResumeTextValue(value);
  return normalized.replace(/\s+(?:姓名|Name|候选人|应聘岗位|目标岗位|求职方向|当前职位|职位|岗位|工作经验|学历|专业|期望城市|意向城市|工作城市|地点|期望薪资|薪资要求|期望工资|最近工作经历|最近公司|现任公司|就职公司|核心技能|项目经历)[:：][\s\S]*$/i, '').trim();
}

function extractResumeLabelMap(text: string) {
  const map = new Map<string, string>();
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^([^:：]{1,20})[:：]\s*(.+)$/);
    if (!match) continue;
    map.set(normalizeResumeTextValue(match[1]), cutOffNextResumeLabel(match[2]));
  }

  return map;
}

function extractResumeValue(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] || match?.[2];
    if (value) return cutOffNextResumeLabel(value);
  }
  return '';
}

function collectResumeSkills(text: string) {
  const keywords = [
    'Java', 'Python', 'Go', 'C++', 'SQL', 'MySQL', 'PostgreSQL', 'Redis', 'Kafka',
    'React', 'Vue', 'Node.js', 'TypeScript', 'JavaScript', 'Spring Boot',
    '产品设计', '需求分析', '用户研究', 'Axure', 'Xmind', '数据分析', '项目管理',
    '微服务', '分布式', '机器学习', '品牌营销', '销售管理', '招聘',
  ];
  return [...new Set(keywords.filter((keyword) => new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)))].slice(0, 8);
}

function extractResumeHighlights(text: string) {
  const normalized = String(text || '').replace(/\r/g, '');
  const lines = normalized
    .split(/\n+/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 12);

  const priority = lines.filter((line) => /(负责|主导|参与|完成|推动|落地|优化|提升|增长|实现|设计|搭建|管理|项目)/.test(line));
  return [...new Set((priority.length ? priority : lines).slice(0, 4).map((item) => item.slice(0, 80)))];
}

function normalizeResumeCompanyValue(value: string) {
  return normalizeResumeTextValue(value)
    .replace(/^\d{4}[./-]?\d{0,2}\s*(?:至|-|~|—)?\s*\d{4}[./-]?\d{0,2}\s*/, '')
    .replace(/^\d{4}[./-]?\d{0,2}\s*(?:至今|现在|今)?\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function collectResumeCompanies(text: string, latestCompany?: string) {
  const normalizedLines = String(text || '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((item) => normalizeResumeCompanyValue(item))
    .filter((item) => item.length >= 2);

  const companyMatches = new Set<string>();
  const pushCompany = (value?: string) => {
    const normalized = normalizeResumeCompanyValue(String(value || ''));
    if (!normalized) return;
    if (
      /(联系电话|电话|手机|邮箱|email|education|skills|项目经历|工作经历|简历|候选人)/i.test(normalized)
      || /^[\d\-./~\s]+$/.test(normalized)
    ) return;
    if (
      /(?:有限公司|有限责任公司|股份有限公司|集团|科技|信息|网络|软件|电子|通信|银行|医院|研究院|大学|学院|实验室|事务所|公司)$/i.test(normalized)
      || /\b(?:inc|ltd|llc|corp|co\.?)\b/i.test(normalized)
    ) {
      companyMatches.add(normalized);
    }
  };

  pushCompany(latestCompany);

  const companyPattern = /([A-Za-z0-9\u4e00-\u9fff（）()·&\-. ]{2,60}(?:有限公司|有限责任公司|股份有限公司|集团|科技|信息|网络|软件|电子|通信|银行|医院|研究院|大学|学院|实验室|事务所|公司))/g;
  const englishCompanyPattern = /([A-Z][A-Za-z0-9 .,&\-]{2,60}\b(?:Inc|Ltd|LLC|Corp|Co\.?))/g;

  for (const line of normalizedLines) {
    pushCompany(line);
    for (const match of line.matchAll(companyPattern)) {
      pushCompany(match[1]);
    }
    for (const match of line.matchAll(englishCompanyPattern)) {
      pushCompany(match[1]);
    }
  }

  return [...companyMatches].slice(0, 8);
}

function extractResumeProjectHighlights(text: string) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((item) => normalizeResumeTextValue(item))
    .filter((item) => item.length >= 8);

  const projectLike = lines.filter((line) => /(项目|系统|平台|接口|架构|上线|实施|交付|开发|搭建|设计|优化|ERP|CRM|IoT|API|中台|管理系统|数据平台|小程序|App|网站)/i.test(line));
  const actionLike = lines.filter((line) => /(负责|主导|参与|完成|推动|落地|实现|优化|设计|搭建|管理)/.test(line));
  const selected = projectLike.length ? projectLike : actionLike;
  return [...new Set(selected.slice(0, 8).map((item) => item.slice(0, 120)))];
}

function extractResumeItProjectHighlights(text: string, skills: string[] = []) {
  const projectHighlights = extractResumeProjectHighlights(text);
  const skillHints = skills.map((item) => item.toLowerCase());
  const filtered = projectHighlights.filter((line) => (
    /(IT|信息化|系统|平台|接口|架构|开发|实施|交付|运维|数据库|微服务|云|网络|安全|ERP|CRM|MES|WMS|IoT|API|Java|Python|Go|Node|React|Vue)/i.test(line)
    || skillHints.some((skill) => line.toLowerCase().includes(skill))
  ));
  return [...new Set((filtered.length ? filtered : projectHighlights).slice(0, 6))];
}

function extractResumeFields(text: string, title: string, entities: StructuredEntity[] = [], claims: StructuredClaim[] = []): ResumeFields | undefined {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const titleText = String(title || '').trim();
  const evidence = `${titleText} ${normalized}`.toLowerCase();
  const looksLikeResume = RESUME_HINTS.some((hint) => evidence.includes(hint.toLowerCase()));
  if (!looksLikeResume) return undefined;
  const labelMap = extractResumeLabelMap(text);
  const byLabel = (...labels: string[]) => {
    for (const label of labels) {
      const value = labelMap.get(label);
      if (value) return value;
    }
    return '';
  };

  const skillsFromEntities = entities
    .filter((item) => item.type === 'ingredient' || item.type === 'term')
    .map((item) => normalizeResumeTextValue(item.text))
    .filter(Boolean);
  const highlightsFromClaims = claims
    .map((claim) => `${claim.subject} ${claim.predicate} ${claim.object}`.trim())
    .filter(Boolean);

  const skills = [...new Set([...collectResumeSkills(normalized), ...skillsFromEntities])].slice(0, 8);
  const latestCompany = byLabel('最近工作经历', '最近公司', '现任公司', '就职公司') || extractResumeValue(normalized, [
    /(?:最近工作经历|最近公司|现任公司|就职公司)[:：]?\s*([^，。；;\n]{2,60})/i,
  ]);
  const projectHighlights = extractResumeProjectHighlights(text);
  const itProjectHighlights = extractResumeItProjectHighlights(text, skills);

  const fields: ResumeFields = {
    candidateName: byLabel('姓名', 'Name', '候选人') || extractResumeValue(normalized, [
      /(?:姓名|name)[:：]?\s*([A-Za-z\u4e00-\u9fff·]{2,20})/i,
      /(?:候选人)[:：]?\s*([A-Za-z\u4e00-\u9fff·]{2,20})/i,
    ]) || inferResumeNameFromTitle(titleText),
    targetRole: byLabel('应聘岗位', '目标岗位', '求职方向') || extractResumeValue(normalized, [
      /(?:应聘岗位|目标岗位|求职方向)[:：]?\s*([^，。；;\n]{2,40})/i,
    ]),
    currentRole: byLabel('当前职位', '现任职位'),
    yearsOfExperience: byLabel('工作经验') || extractResumeValue(normalized, [
      /(\d{1,2}\+?\s*年(?:工作经验)?)/i,
      /(工作经验[^，。；;\n]{0,12}\d{1,2}\+?\s*年)/i,
    ]),
    education: byLabel('学历') || extractResumeValue(normalized, [
      /(博士|硕士|本科|大专|中专|MBA|EMBA|研究生)/i,
    ]),
    major: byLabel('专业') || extractResumeValue(normalized, [
      /(?:专业)[:：]?\s*([^，。；;\n]{2,40})/i,
    ]),
    expectedCity: byLabel('期望城市', '意向城市', '工作城市', '地点') || extractResumeValue(normalized, [
      /(?:期望城市|意向城市|工作城市|地点)[:：]?\s*([^，。；;\n]{2,30})/i,
    ]),
    expectedSalary: byLabel('期望薪资', '薪资要求', '期望工资') || extractResumeValue(normalized, [
      /(?:期望薪资|薪资要求|期望工资)[:：]?\s*([^，。；;\n]{2,30})/i,
    ]),
    latestCompany,
    companies: collectResumeCompanies(text, latestCompany),
    skills,
    highlights: [...new Set([...highlightsFromClaims, ...extractResumeHighlights(text)])].slice(0, 4),
    projectHighlights,
    itProjectHighlights,
  };

  const hasAnyValue = Object.values(fields).some((value) => Array.isArray(value) ? value.length : Boolean(value));
  if (fields.candidateName && !isLikelyResumePersonName(fields.candidateName)) {
    fields.candidateName = inferResumeNameFromTitle(titleText);
  }
  return hasAnyValue
    ? canonicalizeResumeFields(fields, {
      title,
      sourceName: title,
      fullText: text,
    })
    : undefined;
}

function detectRiskLevel(text: string, category: string): 'low' | 'medium' | 'high' | undefined {
  if (category !== 'contract') return undefined;
  const normalized = text.toLowerCase();
  if (normalized.includes('违约') || normalized.includes('罚则') || normalized.includes('未约定')) return 'high';
  if (normalized.includes('付款') || normalized.includes('账期') || normalized.includes('期限')) return 'medium';
  return 'low';
}

function detectTopicTags(text: string, category: string, bizCategory: ParsedDocument['bizCategory']) {
  if (category === 'resume') {
    const normalized = text.toLowerCase();
    const tags = ['人才简历'];
    if (/(java|spring|backend|后端)/i.test(normalized)) tags.push('Java后端');
    if (/(产品经理|product manager|axure|xmind)/i.test(normalized)) tags.push('产品经理');
    if (/(算法|machine learning|deep learning)/i.test(normalized)) tags.push('算法工程师');
    if (/(前端|frontend|react|vue)/i.test(normalized)) tags.push('前端开发');
    if (/(技术总监|技术负责人|cto)/i.test(normalized)) tags.push('技术管理');
    return tags;
  }

  if (bizCategory === 'order' || bizCategory === 'inventory') {
    const normalized = text.toLowerCase();
    const tags = [bizCategory === 'inventory' ? '库存监控' : '订单分析'];
    if (/(tmall|jd|douyin|pinduoduo|kuaishou|wechatmall|天猫|京东|抖音|拼多多|快手|小程序)/i.test(normalized)) {
      tags.push('渠道经营');
    }
    if (/(sku|category|品类|类目|耳机|智能穿戴|智能家居|平板周边|手机配件|电脑外设)/i.test(normalized)) {
      tags.push('SKU结构');
    }
    if (/(inventory|stock|inventory_index|days_of_cover|safety_stock|库存|周转|安全库存)/i.test(normalized)) {
      tags.push('库存管理');
    }
    if (/(replenishment|restock|备货|补货|调拨|priority|优先级)/i.test(normalized)) {
      tags.push('备货建议');
    }
    if (/(yoy|mom|forecast|gmv|net_sales|gross_margin|同比|环比|预测|净销售额|毛利)/i.test(normalized)) {
      tags.push('经营复盘');
    }
    if (/(risk_flag|anomaly|warning|异常|风险|波动|overstock|stockout)/i.test(normalized)) {
      tags.push('异常波动');
    }
    return [...new Set(tags)];
  }

  if (category !== 'technical' && category !== 'paper' && bizCategory !== 'paper') return [];

  const normalized = text.toLowerCase();
  const tagRules: Array<[string, KeywordRule[]]> = [
    ['设备接入', ['接入', /\bdevice\b/i, '协议']],
    ['边缘计算', ['边缘', /\bedge\b/i]],
    ['数据采集', ['采集', /\bcollector\b/i]],
    ['告警联动', ['告警', '报警']],
    ['部署规范', ['部署', /\binstall\b/i]],
    ['接口设计', ['接口', /\bapi\b/i]],
    ['肠道健康', [/\bgut\b/i, /\bintestinal\b/i, '肠道', /\bibs\b/i, /\bflora\b/i, /\bmicrobiome\b/i]],
    ['过敏免疫', [/\ballergic\b/i, /\brhinitis\b/i, '过敏', '鼻炎', /\bimmune\b/i]],
    ['脑健康', [/\bbrain\b/i, '脑', '认知', /\balzheimer/i]],
    ['运动代谢', [/\bexercise\b/i, '减脂', '运动', /\bmetabolism\b/i, /weight loss/i]],
    ['奶粉配方', ['奶粉', '配方', '乳粉', '婴配粉', /\bformula\b/i, /\binfant\b/i, /\bpediatric\b/i]],
    ['益生菌', [/\bprobiotic\b/i, /\bprebiotic\b/i, /\bsynbiotic\b/i, /\blactobacillus\b/i, /\bbifidobacterium\b/i, '益生菌', '益生元', '菌株']],
    ['营养强化', [/\bnutrition\b/i, /\bnutritional\b/i, /\bhmo\b/i, /\bhmos\b/i, '营养', '强化']],
    ['白皮书', [/white\s*paper/i, '白皮书']],
    ['随机对照', [/\brandomized\b/i, /\bplacebo\b/i, /double-blind/i, '双盲', '随机']],
  ];

  return tagRules
    .filter(([, keywords]) => keywords.some((keyword) => matchesKeyword(normalized, keyword)))
    .map(([label]) => label);
}

function detectGroups(filePath: string, text: string, topicTags: string[], config?: DocumentCategoryConfig) {
  if (!config?.customCategories?.length) return [];
  const evidence = buildEvidence(filePath, `${text} ${(topicTags || []).join(' ')}`);
  return config.customCategories
    .filter((group) => (group.keywords || [group.label]).some((keyword) => matchesKeyword(evidence, String(keyword).toLowerCase())))
    .map((group) => group.key);
}

function extractContractFields(text: string, category: string) {
  if (category !== 'contract') return undefined;
  const normalized = text.replace(/\s+/g, ' ');
  const contractNo = normalized.match(/(合同编号|编号)[:：]?\s*([A-Za-z0-9-]+)/)?.[2];
  const amount = normalized.match(/(金额|合同金额)[:：]?\s*([￥¥]?[0-9,.]+[万千元]*)/)?.[2];
  const paymentTerms = normalized.match(/(付款方式|付款条款)[:：]?\s*([^。；;]+)/)?.[2];
  const duration = normalized.match(/(期限|服务期|合同期)[:：]?\s*(.*?)(?:违约责任|备注|付款条款|$|[。；;])/ )?.[2]?.trim();
  return { contractNo, amount, paymentTerms, duration };
}

async function extractText(filePath: string, ext: string) {
  if (ext === '.txt' || ext === '.md' || ext === '.csv') {
    const { text: content, encoding } = await readTextWithBestEffortEncoding(filePath);
    const parseMethod = ext === '.txt'
      ? `text-${encoding}`
      : ext === '.md'
        ? `markdown-${encoding}`
        : `csv-${encoding}`;
    return { status: 'parsed' as const, text: content, parseMethod };
  }

  if (ext === '.json') {
    const { text: content, encoding } = await readTextWithBestEffortEncoding(filePath);
    const parsed = JSON.parse(content);
    return { status: 'parsed' as const, text: JSON.stringify(parsed, null, 2), parseMethod: `json-${encoding}` };
  }

  if (ext === '.html' || ext === '.htm' || ext === '.xml') {
    const { text: content, encoding } = await readTextWithBestEffortEncoding(filePath);
    return { status: 'parsed' as const, text: stripHtmlTags(content), parseMethod: `html-${encoding}` };
  }

  if (ext === '.pdf') {
    const result = await extractPdfText(filePath);
    const methodNote = result.method === 'ocrmypdf'
      ? '\n\n[解析链路] 当前 PDF 使用 OCR fallback 提取文本。'
      : '';
    return { status: 'parsed' as const, text: `${result.text}${methodNote}` };
  }

  if (ext === '.docx') {
    const { default: mammoth } = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return { status: 'parsed' as const, text: result.value || '', parseMethod: 'mammoth' };
  }

  if (ext === '.xlsx' || ext === '.xls') {
    const { readFile, utils } = await import('xlsx');
    const workbook = readFile(filePath);
    const text = workbook.SheetNames
      .map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];
        const body = flattenSpreadsheetRows(rows.slice(0, 80));
        return [`# ${sheetName}`, body].filter(Boolean).join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
    return { status: 'parsed' as const, text, parseMethod: 'xlsx-sheet-reader' };
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    const imageName = path.basename(filePath);
    const ocrText = await extractImageTextWithTesseract(filePath);
    if (ocrText) {
      return {
        status: 'parsed' as const,
        text: `Image file: ${imageName}\n\nOCR text:\n${ocrText}`,
        parseMethod: 'image-ocr',
      };
    }

    return {
      status: 'error' as const,
      text: `Image file: ${imageName}\n\nOCR text was not extracted from this image.`,
      parseMethod: 'image-ocr-empty',
    };
  }

  return { status: 'unsupported' as const, text: '', parseMethod: 'unsupported' };
}

function inferParseMethod(ext: string, text: string, hintedMethod?: string) {
  if (hintedMethod) return hintedMethod;
  if (ext === '.txt') return 'text-utf8';
  if (ext === '.md') return 'markdown-utf8';
  if (ext === '.csv') return 'csv-utf8';
  if (ext === '.json') return 'json-utf8';
  if (ext === '.html' || ext === '.htm' || ext === '.xml') return 'html-utf8';
  if (ext === '.docx') return 'mammoth';
  if (ext === '.xlsx' || ext === '.xls') return 'xlsx-sheet-reader';
  if (IMAGE_EXTENSIONS.has(ext)) return text.includes('OCR text:') ? 'image-ocr' : 'image-metadata';
  if (ext === '.pdf') {
    return text.includes('OCR fallback') || text.includes('[瑙ｆ瀽閾捐矾]')
      ? 'ocr-fallback'
      : 'pdf-auto';
  }
  return 'unsupported';
}

export async function parseDocument(
  filePath: string,
  config?: DocumentCategoryConfig,
  options?: ParseDocumentOptions,
): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase() || 'unknown';
  const name = path.basename(filePath);
  const parseStage = options?.stage === 'quick' ? 'quick' : 'detailed';
  const now = new Date().toISOString();
  const defaultDetailParseStatus = parseStage === 'quick' ? 'queued' : 'succeeded';
  const defaultDetailQueuedAt = parseStage === 'quick' ? now : undefined;
  const defaultDetailParsedAt = parseStage === 'detailed' ? now : undefined;
  const defaultDetailAttempts = parseStage === 'detailed' ? 1 : 0;

  try {
    const { status, text, parseMethod: hintedMethod } = await extractText(filePath, ext);
    const parseMethod = inferParseMethod(ext, text, hintedMethod);
    const normalizedText = normalizeText(text);
    const category = detectCategory(filePath, normalizedText);
    const bizCategory = detectBizCategory(filePath, category, normalizedText, config);
    const unsupportedSummary = UNSUPPORTED_PARSE_SUMMARY;

    if (status === 'unsupported') {
      const topicTags = detectTopicTags(buildEvidence(filePath), category, bizCategory);
      const groups = detectGroups(filePath, '', topicTags, config);
      const schemaType = inferSchemaType(category, bizCategory, undefined, topicTags);
      return {
        path: filePath,
        name,
        ext,
        title: path.parse(name).name,
        category,
        bizCategory,
        parseStatus: 'unsupported',
        parseMethod,
        summary: unsupportedSummary,
        excerpt: unsupportedSummary,
        fullText: '',
        extractedChars: 0,
        evidenceChunks: [],
        entities: [],
        claims: [],
        intentSlots: {},
        topicTags,
        groups,
        parseStage,
        detailParseStatus: defaultDetailParseStatus,
        detailParseQueuedAt: defaultDetailQueuedAt,
        detailParsedAt: defaultDetailParsedAt,
        detailParseAttempts: defaultDetailAttempts,
        schemaType,
        structuredProfile: buildStructuredProfile({
          schemaType,
          title: path.parse(name).name,
          topicTags,
          summary: unsupportedSummary,
        }),
      };
    }

    if (status === 'error') {
      const topicTags = detectTopicTags(buildEvidence(filePath), category, bizCategory);
      const groups = detectGroups(filePath, '', topicTags, config);
      const schemaType = inferSchemaType(category, bizCategory, undefined, topicTags);
      const fallbackSummary = IMAGE_EXTENSIONS.has(ext)
        ? '图片 OCR 解析失败，当前未提取到可用文本；修复 OCR 环境或调整图片后可手动重新解析。'
        : (topicTags.length
          ? `文档解析失败，但已从文件名识别到主题线索：${topicTags.join('、')}。`
          : '文档解析失败，后续可补充依赖后手动重新解析。');

      return {
        path: filePath,
        name,
        ext,
        title: path.parse(name).name,
        category,
        bizCategory,
        parseStatus: 'error',
        parseMethod,
        summary: fallbackSummary,
        excerpt: fallbackSummary,
        fullText: text,
        extractedChars: 0,
        evidenceChunks: [],
        entities: [],
        claims: [],
        intentSlots: {},
        topicTags,
        groups,
        parseStage,
        detailParseStatus: parseStage === 'quick' ? 'queued' : 'failed',
        detailParseQueuedAt: defaultDetailQueuedAt,
        detailParsedAt: defaultDetailParsedAt,
        detailParseAttempts: defaultDetailAttempts,
        detailParseError: IMAGE_EXTENSIONS.has(ext) ? 'ocr-text-not-extracted' : 'parse-error',
        schemaType,
        structuredProfile: buildStructuredProfile({
          schemaType,
          title: path.parse(name).name,
          topicTags,
          summary: fallbackSummary,
        }),
      };
    }

    const topicTags = detectTopicTags(`${name} ${normalizedText}`, category, bizCategory);
    const groups = detectGroups(filePath, normalizedText, topicTags, config);
    const summary = summarize(normalizedText, '文档内容为空或暂未提取到文本。');
    const excerptText = excerpt(normalizedText, '文档内容为空或暂未提取到文本。');
    const inferredTitle = inferTitle(text, name);

    if (parseStage === 'quick') {
      const resumeFields = extractResumeFields(text.slice(0, 2400), inferredTitle);
      const schemaType = inferSchemaType(category, bizCategory, resumeFields, topicTags, inferredTitle, summary);
      return {
        path: filePath,
        name,
        ext,
        title: inferredTitle,
        category,
        bizCategory,
        parseStatus: 'parsed',
        parseMethod,
        summary,
        excerpt: excerptText,
        fullText: text,
        extractedChars: normalizedText.length,
        evidenceChunks: [],
        entities: [],
        claims: [],
        intentSlots: {},
        resumeFields,
        riskLevel: detectRiskLevel(normalizedText, category),
        topicTags,
        groups,
        parseStage,
        detailParseStatus: defaultDetailParseStatus,
        detailParseQueuedAt: defaultDetailQueuedAt,
        detailParsedAt: defaultDetailParsedAt,
        detailParseAttempts: defaultDetailAttempts,
        schemaType,
        structuredProfile: buildStructuredProfile({
          schemaType,
          title: inferredTitle,
          topicTags,
          summary,
          resumeFields,
        }),
      };
    }

    const evidenceChunks = splitEvidenceChunks(text);
    const contractFields = extractContractFields(normalizedText, category);
    const structured = await extractStructuredData(normalizedText, category, evidenceChunks, topicTags, contractFields);
    const resumeFields = extractResumeFields(text, inferredTitle, structured.entities, structured.claims);
    const schemaType = inferSchemaType(category, bizCategory, resumeFields, topicTags, inferredTitle, summary);

    return {
      path: filePath,
      name,
      ext,
      title: inferredTitle,
      category,
      bizCategory,
      parseStatus: 'parsed',
      parseMethod,
      summary: summarize(normalizedText, '文档内容为空或暂未提取到文本。'),
      excerpt: excerpt(normalizedText, '文档内容为空或暂未提取到文本。'),
      fullText: text,
      extractedChars: normalizedText.length,
      evidenceChunks,
      entities: structured.entities,
      claims: structured.claims,
      intentSlots: structured.intentSlots,
      resumeFields,
      riskLevel: detectRiskLevel(normalizedText, category),
      topicTags,
      groups,
      contractFields,
      parseStage,
      detailParseStatus: defaultDetailParseStatus,
      detailParseQueuedAt: defaultDetailQueuedAt,
      detailParsedAt: defaultDetailParsedAt,
      detailParseAttempts: defaultDetailAttempts,
      schemaType,
      structuredProfile: buildStructuredProfile({
        schemaType,
        title: inferredTitle,
        topicTags,
        summary,
        contractFields,
        resumeFields,
      }),
    };
  } catch {
    const category = detectCategory(filePath);
    const bizCategory = detectBizCategory(filePath, category, '', config);
    const topicTags = detectTopicTags(buildEvidence(filePath), category, bizCategory);
    const groups = detectGroups(filePath, '', topicTags, config);
    const schemaType = inferSchemaType(category, bizCategory, undefined, topicTags);
    const fallbackSummary = topicTags.length
      ? `文档解析失败，但已从文件名识别到主题线索：${topicTags.join('、')}。`
      : '文档解析失败，后续可增加 OCR、编码识别或更稳定的解析链路。';

    return {
      path: filePath,
      name,
      ext,
      title: path.parse(name).name,
      category,
      bizCategory,
      parseStatus: 'error',
      parseMethod: 'error',
      summary: fallbackSummary,
      excerpt: fallbackSummary,
      fullText: '',
      extractedChars: 0,
      evidenceChunks: [],
      entities: [],
      claims: [],
      intentSlots: {},
      topicTags,
      groups,
      parseStage,
      detailParseStatus: parseStage === 'quick' ? 'queued' : 'failed',
      detailParseQueuedAt: defaultDetailQueuedAt,
      detailParsedAt: defaultDetailParsedAt,
      detailParseAttempts: defaultDetailAttempts,
      detailParseError: parseStage === 'detailed' ? 'parse-error' : undefined,
      schemaType,
      structuredProfile: buildStructuredProfile({
        schemaType,
        title: path.parse(name).name,
        topicTags,
        summary: fallbackSummary,
      }),
    };
  }
}
