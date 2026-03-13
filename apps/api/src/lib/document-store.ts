import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseDocument, type ParsedDocument } from './document-parser.js';

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
  contract: ['合同', '付款', '回款', '违约', '条款', '风险'],
  technical: ['技术', '文档', '论文', '接入', '部署', '接口', '告警', '采集', '边缘', 'api'],
  paper: ['论文', '研究', '实验', '方法'],
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

  const items = await Promise.all(files.slice(0, limit).map((filePath) => parseDocument(filePath)));
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

function scoreDocumentMatch(item: ParsedDocument, keywords: string[]) {
  const haystack = [
    item.name,
    item.category,
    item.summary,
    item.excerpt,
    item.riskLevel,
    item.topicTags?.join(' '),
    item.contractFields?.contractNo,
    item.contractFields?.paymentTerms,
    item.contractFields?.duration,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let score = 0;
  for (const keyword of keywords) {
    if (!haystack.includes(keyword)) continue;
    if (keyword.length >= 4) score += 3;
    else if (keyword.length === 3) score += 2;
    else score += 1;
  }

  for (const keyword of CATEGORY_KEYWORDS[item.category] ?? []) {
    if (keywords.includes(keyword)) {
      score += 2;
    }
  }

  return score;
}

export function matchDocumentsByPrompt(items: ParsedDocument[], prompt: string) {
  const keywords = extractPromptKeywords(prompt);
  if (!keywords.length) return [];

  return items
    .map((item) => ({ item, score: scoreDocumentMatch(item, keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.item);
}
