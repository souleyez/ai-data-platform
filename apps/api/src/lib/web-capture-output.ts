import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SCAN_DIR } from './document-store.js';
import { stripHtml, type DownloadResult, type PageResult } from './web-capture-page-fetch.js';

const OUTPUT_DIR = path.join(DEFAULT_SCAN_DIR, 'web-captures');
const STRUCTURED_DOWNLOAD_EXTENSIONS = new Set([
  '.xlsx',
  '.xls',
  '.csv',
]);
const DEFAULT_RAW_DELETE_AFTER_HOURS = 48;

type CaptureEntryLike = {
  title: string;
  url: string;
  summary: string;
  score: number;
};

type WebCaptureTaskLike = {
  id: string;
  url: string;
  focus: string;
  frequency: string;
  maxItems?: number;
  keepOriginalFiles?: boolean;
};

function normalizeMaxItems(value?: number) {
  const parsed = Number(value || 5);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(20, Math.max(1, Math.round(parsed)));
}

export function shouldKeepOriginalDownload(task: Pick<WebCaptureTaskLike, 'keepOriginalFiles'>, extension: string) {
  if (task.keepOriginalFiles) return true;
  const normalizedExtension = String(extension || '').toLowerCase();
  return STRUCTURED_DOWNLOAD_EXTENSIONS.has(normalizedExtension);
}

function buildRawDeleteAfterAt(nowIso: string) {
  const baseMs = Date.parse(nowIso);
  if (Number.isNaN(baseMs)) return '';
  return new Date(baseMs + DEFAULT_RAW_DELETE_AFTER_HOURS * 60 * 60 * 1000).toISOString();
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

function formatExtractionMethod(method?: PageResult['extractionMethod']) {
  return method === 'trafilatura' ? 'Trafilatura 正文提取' : '基础清洗 fallback';
}

function normalizeCaptureNoiseKey(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCapturedText(text: string, maxChars = 8000) {
  const rawLines = String(text || '')
    .replace(/\u0000/g, ' ')
    .replace(/(?:^|\s)(?:第\s*\d+\s*页(?:\s*共\s*\d+\s*页)?|page\s*\d+(?:\s*of\s*\d+)?)(?=\s|$)/gi, ' ')
    .replace(/\r/g, '')
    .split('\n');
  const lineFrequencies = new Map<string, number>();

  for (const line of rawLines) {
    const normalized = normalizeCaptureNoiseKey(line);
    if (!normalized || normalized.length > 60) continue;
    lineFrequencies.set(normalized, (lineFrequencies.get(normalized) || 0) + 1);
  }

  const cleanedLines: string[] = [];
  let previousBlank = true;
  for (const line of rawLines) {
    const normalized = String(line || '').replace(/\s+/g, ' ').trim();
    const noiseKey = normalizeCaptureNoiseKey(normalized);

    if (!normalized) {
      if (!previousBlank) cleanedLines.push('');
      previousBlank = true;
      continue;
    }

    if (
      /^(?:page\s*\d+(?:\s*of\s*\d+)?|第\s*\d+\s*页(?:\s*\/\s*共?\s*\d+\s*页)?|页眉|页脚|header|footer)$/i.test(normalized)
      || /^[#=*_~\-|·•]{3,}$/.test(normalized)
      || /^\|?\s*:?-{2,}:?(?:\s*\|\s*:?-{2,}:?)*\s*\|?$/.test(normalized)
      || (/^(?:copyright|版权所有)$/i.test(normalized) && normalized.length <= 20)
      || (noiseKey && (lineFrequencies.get(noiseKey) || 0) >= 3 && normalized.length <= 60)
    ) {
      continue;
    }

    cleanedLines.push(normalized);
    previousBlank = false;
  }

  return cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxChars);
}

function decodeDownloadTextBuffer(data: Buffer) {
  const utf8 = data.toString('utf8').replace(/\u0000/g, '').trim();
  const utf16 = data.toString('utf16le').replace(/\u0000/g, '').trim();

  if (!utf8) return utf16;
  if (!utf16) return utf8;

  const utf8ReplacementCount = (utf8.match(/�/g) || []).length;
  const utf16ReplacementCount = (utf16.match(/�/g) || []).length;
  if (utf16ReplacementCount < utf8ReplacementCount) return utf16;
  return utf8;
}

function renderMarkdownTable(rows: string[][]) {
  if (!rows.length) return '';
  const width = Math.max(...rows.map((row) => row.length), 1);
  const normalizedRows = rows
    .map((row) => Array.from({ length: width }, (_, index) => String(row[index] || '').replace(/\|/g, '/').trim()))
    .filter((row) => row.some(Boolean));
  if (!normalizedRows.length) return '';

  const header = normalizedRows[0].map((cell, index) => cell || `列${index + 1}`);
  const body = normalizedRows.slice(1).map((row) => row.map((cell) => cell || '-'));
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

async function extractDownloadMarkdownBody(file: DownloadResult) {
  const extension = String(file.extension || '').toLowerCase();

  if (extension === '.xlsx' || extension === '.xls' || extension === '.csv') {
    const xlsx = await import('xlsx');
    const workbook = xlsx.default?.read
      ? xlsx.default.read(file.data, { type: 'buffer', raw: false })
      : xlsx.read(file.data, { type: 'buffer', raw: false });
    const { utils } = xlsx;
    return workbook.SheetNames
      .slice(0, 4)
      .flatMap((sheetName) => {
        const rows = utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false }) as unknown[][];
        const normalizedRows = rows
          .slice(0, 20)
          .map((row) => row.map((cell) => String(cell ?? '').trim()));
        const table = renderMarkdownTable(normalizedRows);
        if (!table) return [] as string[];
        return [`### 工作表：${sheetName}`, '', table, ''];
      })
      .join('\n')
      .trim();
  }

  if (extension === '.json') {
    const rawText = decodeDownloadTextBuffer(file.data);
    try {
      return `\`\`\`json\n${JSON.stringify(JSON.parse(rawText), null, 2)}\n\`\`\``;
    } catch {
      return cleanCapturedText(rawText);
    }
  }

  if (extension === '.html' || extension === '.htm' || extension === '.xml') {
    return cleanCapturedText(stripHtml(decodeDownloadTextBuffer(file.data)));
  }

  if (extension === '.txt' || extension === '.md') {
    return cleanCapturedText(decodeDownloadTextBuffer(file.data));
  }

  return cleanCapturedText(file.text || '');
}

function toMarkdown(
  task: WebCaptureTaskLike,
  title: string,
  summary: string,
  entries: CaptureEntryLike[],
  landingText: string,
  extractionMethod?: PageResult['extractionMethod'],
) {
  const landingSnippet = cleanCapturedText(landingText, 6000);
  const normalizedSummary = cleanCapturedText(summary, 2000);
  return [
    `# ${title || '网页采集结果'}`,
    '',
    '## 采集元数据',
    `- 来源链接：${task.url}`,
    `- 采集焦点：${task.focus || '网页正文与关键信息'}`,
    `- 采集频率：${task.frequency}`,
    `- 最大条数：${normalizeMaxItems(task.maxItems)} 条`,
    `- 正文提取：${formatExtractionMethod(extractionMethod)}`,
    '- 输出说明：当前文件为网页采集后的标准 Markdown 镜像。',
    `- 采集时间：${new Date().toISOString()}`,
    '',
    '## 采集摘要',
    normalizedSummary || summary,
    '',
    '## 候选条目',
    ...(entries.length
      ? entries.flatMap((entry, index) => [
        `### ${index + 1}. ${entry.title}`,
        `- 链接：${entry.url}`,
        `- 评分：${entry.score}`,
        `- 摘要：${entry.summary}`,
        '',
      ])
      : ['当前未命中更多候选条目，已保留落地页正文。', '']),
    '## 页面正文',
    landingSnippet || '当前页面正文较少，未提取到稳定文本。',
    '',
  ].join('\n');
}

export async function writeCaptureDocument(
  task: WebCaptureTaskLike,
  title: string,
  summary: string,
  entries: CaptureEntryLike[],
  landingText: string,
  extractionMethod?: PageResult['extractionMethod'],
) {
  await ensureOutputDir();
  const safeName = (title || task.url)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  const filePath = path.join(OUTPUT_DIR, `${task.id}-${safeName || 'capture'}.md`);
  await fs.writeFile(filePath, toMarkdown(task, title, summary, entries, landingText, extractionMethod), 'utf8');
  return filePath;
}

export async function writeDownloadedCapture(task: WebCaptureTaskLike, file: DownloadResult) {
  await ensureOutputDir();
  const baseName = path.basename(file.fileName, file.extension)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  const safeBase = baseName || 'capture';
  const filePath = path.join(OUTPUT_DIR, `${task.id}-${safeBase}${file.extension}`);
  await fs.writeFile(filePath, file.data);
  const markdownPath = path.join(OUTPUT_DIR, `${task.id}-${safeBase}-normalized.md`);
  const markdownBody = await extractDownloadMarkdownBody(file);
  const markdownContent = [
    `# ${file.title || safeBase || '网页下载内容'}`,
    '',
    '## 采集元数据',
    `- 来源链接：${file.url || task.url}`,
    `- 原始文件：${path.basename(filePath)}`,
    `- 内容类型：${file.contentType || 'unknown'}`,
    `- 采集焦点：${task.focus || '网页采集内容'}`,
    `- 采集时间：${new Date().toISOString()}`,
    '',
    '## 提取摘要',
    markdownBody || '当前原始文件已保存，暂未生成更详细的 Markdown 摘要。',
    '',
  ].join('\n');
  await fs.writeFile(markdownPath, markdownContent, 'utf8');
  const keepOriginal = shouldKeepOriginalDownload(task, file.extension);
  return {
    documentPath: keepOriginal ? filePath : markdownPath,
    markdownPath,
    rawDocumentPath: keepOriginal ? '' : filePath,
    rawDeleteAfterAt: keepOriginal ? '' : buildRawDeleteAfterAt(new Date().toISOString()),
  };
}
