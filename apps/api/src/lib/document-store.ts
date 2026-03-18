import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseDocument, type ParsedDocument } from './document-parser.js';
import { loadDocumentCategoryConfig } from './document-config.js';
import { applyDocumentOverrides, loadDocumentOverrides } from './document-overrides.js';

export const DEFAULT_SCAN_DIR = process.env.DOCUMENT_SCAN_DIR || path.resolve(process.cwd(), '../../storage/files');
const CACHE_DIR = path.resolve(process.cwd(), '../../storage/cache');
const CACHE_FILE = path.join(CACHE_DIR, 'documents-cache.json');

type CachePayload = {
  generatedAt: string;
  scanRoot: string;
  totalFiles: number;
  scanSignature: string;
  items: ParsedDocument[];
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  contract: ['合同', '付款', '回款', '违约', '条款', '风险', '审查', '法务'],
  technical: ['技术', '文档', '接入', '部署', '接口', '告警', '采集', '边缘', 'api', '知识库', '摘要', '白皮书', '需求', '方案'],
  paper: ['论文', '研究', '实验', '方法', '文献', 'study', 'trial', 'randomized', 'placebo', 'abstract', 'results', 'conclusion'],
  report: ['日报', '周报', '月报', 'report'],
  general: ['文档', '资料'],
};

export async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFilesRecursive(fullPath);
      return [fullPath];
    }),
  );
  return nested.flat();
}

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function readCache(): Promise<CachePayload | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(raw) as CachePayload;
  } catch {
    return null;
  }
}

async function writeCache(payload: CachePayload) {
  await ensureCacheDir();
  await fs.writeFile(CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

async function buildScanSignature(files: string[]) {
  const stats = await Promise.all(
    files.map(async (filePath) => {
      const stat = await fs.stat(filePath);
      return `${filePath}:${stat.size}:${Math.floor(stat.mtimeMs)}`;
    }),
  );
  return stats.sort().join('|');
}

export async function loadParsedDocuments(limit = 200, forceRefresh = false): Promise<{ exists: boolean; files: string[]; items: ParsedDocument[]; cacheHit: boolean }> {
  let files: string[] = [];
  let exists = true;

  try {
    files = await listFilesRecursive(DEFAULT_SCAN_DIR);
  } catch {
    exists = false;
  }

  if (!exists) {
    return { exists, files, items: [], cacheHit: false };
  }

  const scanSignature = await buildScanSignature(files);

  if (!forceRefresh) {
    const cache = await readCache();
    if (
      cache
      && cache.scanRoot === DEFAULT_SCAN_DIR
      && cache.totalFiles === files.length
      && cache.scanSignature === scanSignature
    ) {
      return { exists, files, items: cache.items.slice(0, limit), cacheHit: true };
    }
  }

  const categoryConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const overrides = await loadDocumentOverrides();
  const parsedItems = await Promise.all(files.slice(0, limit).map((filePath) => parseDocument(filePath, categoryConfig)));
  const items = applyDocumentOverrides(parsedItems, overrides);
  await writeCache({
    generatedAt: new Date().toISOString(),
    scanRoot: DEFAULT_SCAN_DIR,
    totalFiles: files.length,
    scanSignature,
    items,
  });

  return { exists, files, items, cacheHit: false };
}

export function buildDocumentId(filePath: string) {
  return Buffer.from(filePath).toString('base64url');
}

function extractPromptKeywords(prompt: string) {
  const normalized = prompt.toLowerCase();
  const asciiTokens = normalized.match(/[a-z0-9][a-z0-9-]{1,}/g) ?? [];
  const chineseTokens = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const keywordSet = new Set<string>();

  for (const token of [...asciiTokens, ...chineseTokens]) {
    keywordSet.add(token);
    if (token.length >= 4) {
      for (let i = 0; i <= token.length - 2; i += 1) keywordSet.add(token.slice(i, i + 2));
      for (let i = 0; i <= token.length - 3; i += 1) keywordSet.add(token.slice(i, i + 3));
    }
  }

  return [...keywordSet];
}

function detectPromptIntent(keywords: string[]) {
  const joined = keywords.join(' ');
  const contractIntent = CATEGORY_KEYWORDS.contract.some((keyword) => joined.includes(keyword));
  const technicalIntent = [...CATEGORY_KEYWORDS.technical, ...CATEGORY_KEYWORDS.paper].some((keyword) => joined.includes(keyword));

  if (contractIntent && !technicalIntent) return 'contract';
  if (technicalIntent && !contractIntent) return 'technical';
  if (technicalIntent) return 'technical';
  return 'mixed';
}

function scoreKeywordAgainstText(keyword: string, text: string) {
  if (!text || !keyword || !text.includes(keyword)) return 0;
  if (keyword.length >= 8) return 8;
  if (keyword.length >= 6) return 6;
  if (keyword.length >= 4) return 4;
  if (keyword.length === 3) return 2;
  return 1;
}

function scoreDocumentMatch(item: ParsedDocument, keywords: string[], promptIntent: 'contract' | 'technical' | 'mixed') {
  const name = item.name.toLowerCase();
  const summary = item.summary.toLowerCase();
  const excerpt = item.excerpt.toLowerCase();
  const tags = (item.topicTags || []).join(' ').toLowerCase();
  const fieldText = [
    item.contractFields?.contractNo,
    item.contractFields?.paymentTerms,
    item.contractFields?.duration,
    item.contractFields?.amount,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let score = 0;

  for (const keyword of keywords) {
    score += scoreKeywordAgainstText(keyword, name) * 3;
    score += scoreKeywordAgainstText(keyword, summary) * 2;
    score += scoreKeywordAgainstText(keyword, excerpt);
    score += scoreKeywordAgainstText(keyword, tags) * 2;
    score += scoreKeywordAgainstText(keyword, fieldText) * 2;
  }

  for (const keyword of CATEGORY_KEYWORDS[item.category] ?? []) {
    if (keywords.includes(keyword)) score += 3;
  }

  for (const keyword of CATEGORY_KEYWORDS[item.bizCategory] ?? []) {
    if (keywords.includes(keyword)) score += 4;
  }

  if (promptIntent === 'contract') {
    if (item.category === 'contract' || item.bizCategory === 'contract') score += 10;
    else if (item.category === 'technical' || item.category === 'paper' || item.bizCategory === 'technical' || item.bizCategory === 'paper') score -= 6;
  }

  if (promptIntent === 'technical') {
    if (item.category === 'technical' || item.category === 'paper' || item.bizCategory === 'technical' || item.bizCategory === 'paper') score += 10;
    else if (item.category === 'contract' || item.bizCategory === 'contract') score -= 6;
  }

  if (item.parseStatus === 'unsupported') score -= 18;
  if (item.parseStatus === 'error') score -= 14;
  if (item.extractedChars < 80) score -= 12;
  else if (item.extractedChars < 400) score -= 6;
  else if (item.extractedChars > 4000) score += 2;

  const lowSignalSummary = ['当前版本尚未支持该文件类型的内容提取。', '文档内容为空或暂未提取到文本。', '文档解析失败'];
  if (lowSignalSummary.some((text) => item.summary.includes(text))) score -= 10;

  return score;
}

export function matchDocumentsByPrompt(items: ParsedDocument[], prompt: string) {
  const keywords = extractPromptKeywords(prompt);
  if (!keywords.length) return [];
  const promptIntent = detectPromptIntent(keywords);

  return items
    .map((item) => ({ item, score: scoreDocumentMatch(item, keywords, promptIntent) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.item);
}
