import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseDocument, refreshDerivedSchemaProfile, type ParsedDocument } from './document-parser.js';
import { enhanceParsedDocumentsWithCloud } from './document-cloud-enrichment.js';
import { applyDetailedParseQueueMetadata, enqueueDetailedParse } from './document-deep-parse-queue.js';
import { loadDocumentCategoryConfig } from './document-config.js';
import { applyDocumentOverrides, loadDocumentOverrides } from './document-overrides.js';
import { upsertDocumentVectorIndex } from './document-vector-index.js';
import { REPO_ROOT, STORAGE_CACHE_DIR, STORAGE_FILES_DIR } from './paths.js';
import { canonicalizeResumeFields } from './resume-canonicalizer.js';
import { loadRetainedDocuments } from './retained-documents.js';
import { scheduleOpenClawMemoryCatalogSync } from './openclaw-memory-sync.js';

export const DEFAULT_SCAN_DIR = process.env.DOCUMENT_SCAN_DIR || STORAGE_FILES_DIR;
const CACHE_DIR = STORAGE_CACHE_DIR;
const CACHE_FILE = path.join(CACHE_DIR, 'documents-cache.json');
const SCANNABLE_DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.txt', '.md', '.docx', '.csv', '.json', '.html', '.htm', '.xml', '.xlsx', '.xls',
]);
const SKIPPED_DIRECTORY_NAMES = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'bin',
  'obj',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  'cache',
  'Cache',
  'Temp',
  'tmp',
]);

type CachePayload = {
  generatedAt: string;
  scanRoot: string;
  scanRoots?: string[];
  totalFiles: number;
  scanSignature: string;
  items: ParsedDocument[];
};

type LoadParsedDocumentsResult = {
  exists: boolean;
  files: string[];
  totalFiles?: number;
  items: ParsedDocument[];
  cacheHit: boolean;
};

let vectorSyncPromise: Promise<void> | null = null;
let lastVectorSyncAt = 0;
const VECTOR_SYNC_DEBOUNCE_MS = Math.max(30_000, Number(process.env.DOCUMENT_VECTOR_SYNC_DEBOUNCE_MS || 120_000));

function isPlatformInternalDocumentPath(filePath: string) {
  const normalizedFilePath = path.resolve(String(filePath || '')).toLowerCase();
  const normalizedRepoRoot = path.resolve(REPO_ROOT).toLowerCase();
  const normalizedStorageFilesRoot = path.resolve(STORAGE_FILES_DIR).toLowerCase();
  return normalizedFilePath.startsWith(normalizedRepoRoot) && !normalizedFilePath.startsWith(normalizedStorageFilesRoot);
}

function uniqStrings(values?: Array<string | undefined>) {
  return [...new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function isValidStrainCandidate(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^IL-\d+$/i.test(text)) return false;
  if (/^(IFN|TNF|TGF)-?[A-Z0-9]+$/i.test(text)) return false;
  if (/\b(?:interleukin|cytokine|transforming growth factor|interferon)\b/i.test(text)) return false;
  if (/\b(?:and|in|on|of|for|strains?)\b/i.test(text) && !/\b(?:Lactobacillus|Bifidobacterium|Bacillus|Streptococcus)\b/i.test(text)) return false;
  if (/\b(?:Lactobacillus|Bifidobacterium|Bacillus|Streptococcus)\s+(?:and|in|on|of|for|strains?)\b/i.test(text)) return false;
  return true;
}

function isValidDoseCandidate(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^\d+(?:\.\d+)?\s?(?:mg|g|kg|ml|ug|μg|IU|CFU)$/i.test(text)) return true;
  if (/^\d+(?:\.\d+)?\s?(?:x|×)\s?10\^?\d+\s?(?:CFU)?$/i.test(text)) return true;
  if (/^\d+(?:\.\d+)?e[+-]?\d{1,2}$/i.test(text)) return true;
  return false;
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

function normalizeStrainLabel(value: string) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.replace(/\b(lactobacillus|bifidobacterium|bacillus|streptococcus)\b/gi, (match) => {
    const lower = match.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

function normalizeDoseLabel(value: string) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  const numberUnit = text.match(/^(\d+(?:\.\d+)?)(mg|g|kg|ml|ug|μg|iu|cfu)$/i);
  if (numberUnit) return `${numberUnit[1]} ${numberUnit[2].toUpperCase()}`;
  const sci = text.match(/^(\d+(?:\.\d+)?)e([+-]?\d{1,2})$/i);
  if (sci) return `${sci[1]}e${sci[2]}`;
  return text.replace(/\bcfu\b/gi, 'CFU').replace(/\biu\b/gi, 'IU');
}

function sanitizeParsedDocument(item: ParsedDocument): ParsedDocument {
  const allowedStrains = uniqStrings(item.intentSlots?.strains).filter(isValidStrainCandidate).map(normalizeStrainLabel).filter(Boolean);
  const allowedDoses = uniqStrings(item.intentSlots?.doses)
    .filter(isStrictDoseCandidate)
    .map(normalizeDoseLabel)
    .map((value) => value.replace(/^(\d+(?:\.\d+)?)\s*(MG|G|KG|ML|UG|\?G|IU|CFU)$/i, '$1 $2'))
    .filter(Boolean);
  const allowedStrainSet = new Set(allowedStrains.map((value) => value.toLowerCase()));
  const entityBlocklist = new Set<string>([
    ...uniqStrings(item.intentSlots?.strains).filter((value) => !isValidStrainCandidate(value)).map((value) => `strain:${value.toLowerCase()}`),
    ...uniqStrings(item.intentSlots?.doses).filter((value) => !isStrictDoseCandidate(value)).map((value) => `dose:${value.toLowerCase()}`),
  ]);

  const lowerPath = String(item.path || '').toLowerCase();
  const lowerName = String(item.name || '').toLowerCase();
  const forceGenericNoise =
    lowerPath.includes('\\ai-data-platform\\docs\\')
    || lowerPath.includes('\\packages\\')
    || lowerPath.includes('\\node_modules\\')
    || lowerName === 'readme.md'
    || lowerName === 'prd.md'
    || /(?:小说|大纲|剧情|设定|人物小传)/.test(item.name || '');
  const schemaType = forceGenericNoise ? 'generic' : item.schemaType;
  const category = forceGenericNoise && (item.category === 'report' || item.category === 'technical' || item.category === 'contract')
    ? 'general'
    : item.category;
  const bizCategory = forceGenericNoise ? 'general' : item.bizCategory;

  return refreshDerivedSchemaProfile({
    ...item,
    schemaType,
    category,
    bizCategory,
    claims: (item.claims || [])
      .map((claim) => ({
        ...claim,
        subject: normalizeStrainLabel(claim.subject),
      }))
      .filter((claim) => !claim.subject || !/[A-Za-z]/.test(claim.subject) || allowedStrainSet.has(claim.subject.toLowerCase())),
    entities: (item.entities || [])
      .filter((entity) => !entityBlocklist.has(`${entity.type}:${entity.text.toLowerCase()}`))
      .map((entity) => ({
        ...entity,
        text: entity.type === 'strain'
          ? normalizeStrainLabel(entity.text)
          : entity.type === 'dose'
            ? normalizeDoseLabel(entity.text)
            : entity.text,
      }))
      .filter((entity) => Boolean(entity.text)),
    intentSlots: {
      ...item.intentSlots,
      audiences: uniqStrings(item.intentSlots?.audiences),
      ingredients: uniqStrings(item.intentSlots?.ingredients),
      strains: allowedStrains,
      benefits: uniqStrings(item.intentSlots?.benefits),
      doses: allowedDoses,
      organizations: uniqStrings(item.intentSlots?.organizations),
      metrics: uniqStrings(item.intentSlots?.metrics),
    },
    resumeFields: schemaType === 'resume'
      ? canonicalizeResumeFields(item.resumeFields, {
        title: item.title || item.name,
        sourceName: item.name,
        summary: item.summary,
        excerpt: item.excerpt,
        fullText: item.fullText,
      })
      : undefined,
  });
}

export type DocumentEvidenceMatch = {
  item: ParsedDocument;
  chunkId: string;
  chunkText: string;
  score: number;
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  contract: ['合同', '付款', '回款', '违约', '条款', '风险', '审查', '法务'],
  technical: ['技术', '文档', '接入', '部署', '接口', '告警', '采集', '边缘', 'api', '知识库', '摘要', '白皮书', '需求', '方案'],
  paper: ['论文', '研究', '实验', '方法', '文献', 'study', 'trial', 'randomized', 'placebo', 'abstract', 'results', 'conclusion'],
  report: ['日报', '周报', '月报', 'report'],
  general: ['文档', '资料'],
};

const GENERIC_STOPWORDS = new Set([
  '根据',
  '那篇',
  '这篇',
  '资料',
  '文档',
  '总结',
  '核心',
  '结论',
  '内容',
  '分析',
  '归纳',
  '说明',
  '问题',
  '请问',
  '请',
]);

export async function listFilesRecursive(dir: string): Promise<string[]> {
  const results: string[] = [];
  const stack = [dir];

  while (stack.length) {
    const current = stack.pop() as string;
    let entries: Awaited<ReturnType<typeof fs.readdir>> = [];

    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) continue;
      if (!SCANNABLE_DOCUMENT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      results.push(fullPath);
    }
  }

  return results;
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

function sameScanRoots(left?: string[], right?: string[]) {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}

async function writeCache(payload: CachePayload) {
  await ensureCacheDir();
  await fs.writeFile(CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  scheduleOpenClawMemoryCatalogSync('document-cache-write');
}

export async function removeDocumentsFromCache(filePaths: string[]) {
  const targets = new Set(filePaths.filter(Boolean));
  if (!targets.size) return;

  const cache = await readCache();
  if (!cache) return;

  const nextItems = cache.items.filter((item) => !targets.has(item.path));
  const removedCount = cache.items.length - nextItems.length;
  if (removedCount <= 0) return;

  await writeCache({
    ...cache,
    totalFiles: Math.max(0, (cache.totalFiles || cache.items.length) - removedCount),
    items: nextItems,
  });
}

export async function upsertDocumentsInCache(items: ParsedDocument[], scanRoot?: string | string[]) {
  if (!items.length) return;

  const cache = await readCache();
  if (!cache) {
    return;
  }

  const byPath = new Map(cache.items.map((item) => [item.path, item]));
  for (const item of items) {
    byPath.set(item.path, item);
  }

  const nextItems = dedupeDocuments(sortDocumentsByRecency([...byPath.values()]));
  await writeCache({
    ...cache,
    items: nextItems,
    totalFiles: Math.max(cache.totalFiles || cache.items.length, nextItems.length),
  });
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

function extractPathTimestamp(filePath: string) {
  const baseName = path.basename(String(filePath || ''));
  const match = baseName.match(/^(\d{13})(?:[-_.]|$)/);
  if (!match) return 0;
  const value = Number(match[1]);
  return value >= 1500000000000 && value <= 4102444800000 ? value : 0;
}

async function sortFilesByRecency(filePaths: string[]) {
  const ranked = await Promise.all(
    filePaths.map(async (filePath) => {
      const pathTimestamp = extractPathTimestamp(filePath);
      if (pathTimestamp > 0) {
        return { filePath, score: pathTimestamp };
      }

      try {
        const stat = await fs.stat(filePath);
        return { filePath, score: Math.floor(stat.mtimeMs) || 0 };
      } catch {
        return { filePath, score: 0 };
      }
    }),
  );

  return ranked
    .sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))
    .map((item) => item.filePath);
}

function sortDocumentsByRecency<T extends { path?: string; name?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const left = Math.max(extractPathTimestamp(a.path || ''), extractPathTimestamp(a.name || ''));
    const right = Math.max(extractPathTimestamp(b.path || ''), extractPathTimestamp(b.name || ''));
    return right - left || String(a.path || a.name || '').localeCompare(String(b.path || b.name || ''));
  });
}

function buildDeduplicationKey(item: ParsedDocument) {
  const normalizedName = path.basename(String(item.name || item.path || ''))
    .replace(/^~\$/, '')
    .replace(/^\d{13}[-_.]/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const normalizedTitle = String(item.title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const normalizedSummary = String(item.summary || '')
    .slice(0, 120)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${item.category || 'general'}|${normalizedName}|${normalizedTitle || normalizedSummary}`;
}

function dedupeDocuments(items: ParsedDocument[]) {
  const deduped: ParsedDocument[] = [];
  const seen = new Set<string>();

  for (const item of sortDocumentsByRecency(items)) {
    const key = buildDeduplicationKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

async function resolveScanRoot(scanRoot?: string) {
  if (scanRoot) return scanRoot;
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  return config.scanRoot || DEFAULT_SCAN_DIR;
}

async function resolveScanRoots(scanRoot?: string | string[]) {
  if (Array.isArray(scanRoot) && scanRoot.length) return [...new Set(scanRoot)];
  if (typeof scanRoot === 'string' && scanRoot) return [scanRoot];
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  return (config.scanRoots?.length ? config.scanRoots : [config.scanRoot || DEFAULT_SCAN_DIR]).filter(Boolean);
}

async function getCurrentFiles(scanRoot?: string | string[]): Promise<{ exists: boolean; files: string[]; scanRoot: string; scanRoots: string[] }> {
  const activeScanRoots = await resolveScanRoots(scanRoot);
  const fileGroups = await Promise.all(
    activeScanRoots.map(async (root) => {
      try {
        return await listFilesRecursive(root);
      } catch {
        return [];
      }
    }),
  );
  const files = await sortFilesByRecency(Array.from(new Set(fileGroups.flat())));
  return {
    exists: files.length > 0,
    files,
    scanRoot: activeScanRoots[0] || await resolveScanRoot(),
    scanRoots: activeScanRoots,
  };
}

async function parseFiles(
  filePaths: string[],
  scanRoot?: string | string[],
  options?: { cloudEnhancement?: boolean; parseStage?: 'quick' | 'detailed' },
) {
  const activeScanRoot = Array.isArray(scanRoot) ? scanRoot[0] : await resolveScanRoot(scanRoot);
  const categoryConfig = await loadDocumentCategoryConfig(activeScanRoot);
  const overrides = await loadDocumentOverrides();
  const parsedItems = await Promise.all(
    filePaths.map((filePath) => parseDocument(filePath, categoryConfig, { stage: options?.parseStage || 'detailed' })),
  );
  const cloudEnhancedItems = options?.cloudEnhancement === false
    ? parsedItems
    : await enhanceParsedDocumentsWithCloud(parsedItems);
  const overriddenItems = applyDocumentOverrides(cloudEnhancedItems, overrides)
    .map((item) => refreshDerivedSchemaProfile(item))
    .map(sanitizeParsedDocument);
  return applyDetailedParseQueueMetadata(overriddenItems);
}

async function mergeWithRetainedDocuments(items: ParsedDocument[]) {
  const retained = await loadRetainedDocuments();
  if (!retained.length) return items.map(sanitizeParsedDocument);

  const byPath = new Map<string, ParsedDocument>();
  for (const item of items.map(sanitizeParsedDocument)) byPath.set(item.path, item);
  for (const retainedItem of retained) {
    if (!byPath.has(retainedItem.path)) {
      byPath.set(retainedItem.path, sanitizeParsedDocument(retainedItem));
    }
  }

  return Array.from(byPath.values());
}

function scheduleVectorIndexSync(items: ParsedDocument[]) {
  const now = Date.now();
  if (vectorSyncPromise || now - lastVectorSyncAt < VECTOR_SYNC_DEBOUNCE_MS) {
    return;
  }

  const candidates = items.filter((item) => item.parseStatus === 'parsed' && item.parseStage === 'detailed');
  if (!candidates.length) return;

  lastVectorSyncAt = now;
  vectorSyncPromise = upsertDocumentVectorIndex(candidates)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      vectorSyncPromise = null;
    });
}

export async function loadParsedDocuments(limit = 200, forceRefresh = false, scanRoot?: string | string[]): Promise<LoadParsedDocumentsResult> {
  const activeScanRoots = await resolveScanRoots(scanRoot);
  const cache = !forceRefresh ? await readCache() : null;

  if (cache) {
    await enqueueDetailedParse(
      cache.items
        .filter((item) => item.parseStatus === 'parsed' && item.parseStage !== 'detailed')
        .map((item) => item.path),
    );
    const overrides = await loadDocumentOverrides();
    const mergedItems = dedupeDocuments(sortDocumentsByRecency(
      await mergeWithRetainedDocuments(
        await applyDetailedParseQueueMetadata(
          applyDocumentOverrides(cache.items, overrides)
            .map((item) => refreshDerivedSchemaProfile(item))
            .map(sanitizeParsedDocument),
        ),
      ),
    ));
    scheduleVectorIndexSync(mergedItems);
    return {
      exists: true,
      files: [],
      totalFiles: cache.totalFiles || cache.items.length,
      items: mergedItems.slice(0, limit),
      cacheHit: sameScanRoots(cache.scanRoots || [cache.scanRoot], activeScanRoots),
    };
  }

  const { exists, files, scanRoot: activeScanRoot, scanRoots: resolvedScanRoots } = await getCurrentFiles(activeScanRoots);

  if (!exists) {
    return { exists, files, totalFiles: 0, items: [], cacheHit: false };
  }

  const scanSignature = await buildScanSignature(files);

  const items = await parseFiles(files.slice(0, limit), resolvedScanRoots, {
    parseStage: 'quick',
    cloudEnhancement: false,
  });
  await enqueueDetailedParse(items.filter((item) => item.parseStatus === 'parsed').map((item) => item.path));
  await writeCache({
    generatedAt: new Date().toISOString(),
    scanRoot: activeScanRoot,
    scanRoots: resolvedScanRoots,
    totalFiles: files.length,
    scanSignature,
    items,
  });

  const mergedItems = dedupeDocuments(sortDocumentsByRecency(await mergeWithRetainedDocuments(items)));
  scheduleVectorIndexSync(mergedItems);
  return { exists, files, totalFiles: files.length, items: mergedItems, cacheHit: false };
}

export async function mergeParsedDocumentsForPaths(
  filePaths: string[],
  limit = 200,
  scanRoot?: string | string[],
  options?: { parseStage?: 'quick' | 'detailed'; cloudEnhancement?: boolean },
): Promise<LoadParsedDocumentsResult> {
  const { exists, files, scanRoot: activeScanRoot, scanRoots: activeScanRoots } = await getCurrentFiles(scanRoot);

  if (!exists) {
    return { exists, files, totalFiles: 0, items: [], cacheHit: false };
  }

  const normalizedPaths = [...new Set(filePaths)];
  const cache = await readCache();

  if (!cache || JSON.stringify(cache.scanRoots || [cache.scanRoot]) !== JSON.stringify(activeScanRoots)) {
    return loadParsedDocuments(limit, true, activeScanRoots);
  }

  const reparsedItems = await parseFiles(
    normalizedPaths.filter((filePath) => files.includes(filePath)),
    activeScanRoots,
    {
      cloudEnhancement: options?.cloudEnhancement ?? false,
      parseStage: options?.parseStage || 'detailed',
    },
  );

  const mergedByPath = new Map(cache.items.map((item) => [item.path, refreshDerivedSchemaProfile(item)]));
  for (const item of reparsedItems) {
    mergedByPath.set(item.path, item);
  }

  const items = dedupeDocuments(
    sortDocumentsByRecency(
      [...mergedByPath.values()].filter((item) => files.includes(item.path)),
    ),
  );

  const scanSignature = await buildScanSignature(files);
  await writeCache({
    generatedAt: new Date().toISOString(),
    scanRoot: activeScanRoot,
    scanRoots: activeScanRoots,
    totalFiles: files.length,
    scanSignature,
    items,
  });

  const mergedItems = dedupeDocuments(sortDocumentsByRecency(await mergeWithRetainedDocuments(items)));
  scheduleVectorIndexSync(mergedItems);
  return { exists, files, totalFiles: files.length, items: mergedItems, cacheHit: false };
}

export function buildDocumentId(filePath: string) {
  return Buffer.from(filePath).toString('base64url');
}

function buildCanonicalDocKey(item: ParsedDocument) {
  return `${item.title || item.name}`
    .replace(/^\d{10,}-/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractPromptKeywords(prompt: string) {
  const normalized = prompt.toLowerCase();
  const asciiTokens = normalized.match(/[a-z0-9][a-z0-9-]{1,}/g) ?? [];
  const chineseTokens = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const keywordSet = new Set<string>();

  for (const token of [...asciiTokens, ...chineseTokens]) {
    if (GENERIC_STOPWORDS.has(token)) continue;
    keywordSet.add(token);
    if (token.length >= 4) {
      for (let i = 0; i <= token.length - 2; i += 1) keywordSet.add(token.slice(i, i + 2));
      for (let i = 0; i <= token.length - 3; i += 1) keywordSet.add(token.slice(i, i + 3));
    }
  }

  return [...keywordSet];
}

function extractStrongKeywords(keywords: string[]) {
  const explicitIdKeywords = keywords.filter((keyword) => /[\d-]/.test(keyword) || /[a-z]/i.test(keyword));
  if (explicitIdKeywords.length) {
    return explicitIdKeywords;
  }

  // Chinese natural-language prompts can produce long mojibake-like tokens after ingestion
  // or terminal round-trips. Using them as hard filters drops every candidate before scoring.
  // Keep strong gating only for explicit identifiers / stable ASCII keywords.
  return [];
}

function containsAnyKeyword(text: string, keywords: string[]) {
  const haystack = String(text || '').toLowerCase();
  if (!haystack || !keywords.length) return false;
  return keywords.some((keyword) => haystack.includes(keyword));
}

function extractExplicitIdentifiers(prompt: string) {
  const normalized = String(prompt || '').toLowerCase();
  const matches = normalized.match(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b|\b[a-z]+\d+[a-z0-9-]*\b|\b\d+[a-z]+[a-z0-9-]*\b/g) ?? [];
  return [...new Set(matches)];
}

function detectPromptIntent(keywords: string[]): 'contract' | 'paper' | 'mixed' {
  const joined = keywords.join(' ');
  const contractIntent = CATEGORY_KEYWORDS.contract.some((keyword) => joined.includes(keyword));
  const paperIntent = CATEGORY_KEYWORDS.paper.some((keyword) => joined.includes(keyword));

  if (contractIntent && !paperIntent) return 'contract';
  if (paperIntent && !contractIntent) return 'paper';
  if (paperIntent) return 'paper';
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

function scoreDocumentMatch(item: ParsedDocument, keywords: string[], promptIntent: 'contract' | 'paper' | 'mixed') {
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
    else if (item.category === 'technical' || item.category === 'paper' || item.bizCategory === 'paper') score -= 6;
  }

  if (promptIntent === 'paper') {
    if (item.category === 'technical' || item.category === 'paper' || item.bizCategory === 'paper') score += 10;
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

function scoreChunkMatch(text: string, keywords: string[]) {
  const haystack = String(text || '').toLowerCase();
  if (!haystack) return 0;

  let score = 0;
  for (const keyword of keywords) {
    score += scoreKeywordAgainstText(keyword, haystack) * 2;
  }

  if (/(abstract|summary|results?|conclusions?|discussion|findings?|结论|结果|摘要|研究发现|主要发现)/i.test(haystack)) score += 10;
  if (/(methods?|materials?|introduction|background|author information|correspondence|doi|received|accepted|affiliations?)/i.test(haystack)) score -= 4;
  if (/@/.test(haystack)) score -= 6;
  if ((haystack.match(/\d/g) || []).length > Math.max(20, haystack.length * 0.18)) score -= 4;
  if ((haystack.match(/[,;:]/g) || []).length > 14 && !/[。！？.!?]/.test(haystack)) score -= 3;
  if (haystack.length >= 120 && haystack.length <= 480) score += 2;
  if (haystack.length > 700) score -= 2;
  return score;
}

export function matchDocumentsByPrompt(items: ParsedDocument[], prompt: string, limit = Number.POSITIVE_INFINITY) {
  const keywords = extractPromptKeywords(prompt);
  if (!keywords.length) return [];
  const promptIntent = detectPromptIntent(keywords);
  const strongKeywords = extractStrongKeywords(keywords);
  const explicitIdentifiers = extractExplicitIdentifiers(prompt);

  return items
    .filter((item) => !isPlatformInternalDocumentPath(item.path))
    .map((item) => {
      const searchable = [item.name, item.title, item.summary, item.excerpt, (item.topicTags || []).join(' ')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const blockedByIdentifier = explicitIdentifiers.length > 0 && !containsAnyKeyword(searchable, explicitIdentifiers);
      const blockedByStrongKeyword = strongKeywords.length > 0 && !containsAnyKeyword(searchable, strongKeywords);
      return { item, score: (blockedByIdentifier || blockedByStrongKeyword) ? 0 : scoreDocumentMatch(item, keywords, promptIntent) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Number.isFinite(limit) ? limit : undefined)
    .map((entry) => entry.item);
}

export function matchDocumentEvidenceByPrompt(items: ParsedDocument[], prompt: string, limit = Number.POSITIVE_INFINITY) {
  const keywords = extractPromptKeywords(prompt);
  if (!keywords.length) return [] as DocumentEvidenceMatch[];
  const promptIntent = detectPromptIntent(keywords);
  const strongKeywords = extractStrongKeywords(keywords);
  const explicitIdentifiers = extractExplicitIdentifiers(prompt);

  const ranked = items
    .filter((item) => !isPlatformInternalDocumentPath(item.path))
    .flatMap((item) => {
      const docScore = scoreDocumentMatch(item, keywords, promptIntent);
      const searchable = [item.name, item.title, item.summary, item.excerpt, (item.topicTags || []).join(' ')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (explicitIdentifiers.length > 0 && !containsAnyKeyword(searchable, explicitIdentifiers)) {
        return [];
      }
      if (strongKeywords.length > 0 && !containsAnyKeyword(searchable, strongKeywords)) {
        return [];
      }
      const chunks = item.evidenceChunks?.length
        ? item.evidenceChunks
        : [{ id: 'excerpt', text: item.excerpt || item.summary || '', charLength: (item.excerpt || item.summary || '').length, order: 0 }];

      return chunks
        .map((chunk) => ({
          item,
          chunkId: chunk.id,
          chunkText: chunk.text,
          score: docScore + scoreChunkMatch(chunk.text, keywords) - Math.min(chunk.order, 6),
        }))
        .filter((entry) => entry.score > 0);
    })
    .sort((a, b) => b.score - a.score);

  const deduped: DocumentEvidenceMatch[] = [];
  const seenDocKeys = new Set<string>();
  for (const entry of ranked) {
    const docKey = buildCanonicalDocKey(entry.item);
    if (seenDocKeys.has(docKey)) continue;
    seenDocKeys.add(docKey);
    deduped.push(entry);
    if (Number.isFinite(limit) && deduped.length >= limit) break;
  }

  return deduped;
}

function looksLikeResumeDocument(item: ParsedDocument) {
  const evidence = [
    item.name,
    item.title,
    item.category,
    item.summary,
    item.excerpt,
    (item.topicTags || []).join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return item.parseStatus === 'parsed'
    && (
      item.category === 'resume'
      || evidence.includes('简历')
      || evidence.includes('resume')
      || evidence.includes('cv')
      || evidence.includes('候选人')
      || evidence.includes('人才简历')
    );
}

export function matchResumeDocuments(items: ParsedDocument[], prompt: string, limit = 30) {
  const keywords = extractPromptKeywords(prompt);
  return items
    .filter((item) => looksLikeResumeDocument(item))
    .map((item) => ({
      item,
      score: scoreDocumentMatch(item, keywords, 'mixed') + (item.resumeFields ? 12 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}
