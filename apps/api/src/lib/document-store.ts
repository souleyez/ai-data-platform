import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseDocument, type ParsedDocument } from './document-parser.js';
import { loadDocumentCategoryConfig } from './document-config.js';
import { applyDocumentOverrides, loadDocumentOverrides } from './document-overrides.js';
import { STORAGE_CACHE_DIR, STORAGE_FILES_DIR } from './paths.js';
import { loadRetainedDocuments } from './retained-documents.js';

export const DEFAULT_SCAN_DIR = process.env.DOCUMENT_SCAN_DIR || STORAGE_FILES_DIR;
const CACHE_DIR = STORAGE_CACHE_DIR;
const CACHE_FILE = path.join(CACHE_DIR, 'documents-cache.json');

type CachePayload = {
  generatedAt: string;
  scanRoot: string;
  totalFiles: number;
  scanSignature: string;
  items: ParsedDocument[];
};

type LoadParsedDocumentsResult = {
  exists: boolean;
  files: string[];
  items: ParsedDocument[];
  cacheHit: boolean;
};

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

function sanitizeResumeFields(fields: ParsedDocument['resumeFields']) {
  if (!fields) return undefined;
  const normalize = (value?: string) => String(value || '').replace(/\s+/g, ' ').trim();
  const isGoodName = (value?: string) => {
    const text = normalize(value);
    if (!text) return false;
    if (/@/.test(text) || /\d{5,}/.test(text)) return false;
    if (/联系电话|电话|手机|邮箱|email/i.test(text)) return false;
    return true;
  };
  const normalizeList = (values?: string[]) => uniqStrings(values).map(normalize).filter(Boolean);
  const sanitized = {
    candidateName: isGoodName(fields.candidateName) ? normalize(fields.candidateName) : '',
    targetRole: normalize(fields.targetRole),
    currentRole: normalize(fields.currentRole),
    yearsOfExperience: normalize(fields.yearsOfExperience),
    education: normalize(fields.education),
    major: normalize(fields.major),
    expectedCity: normalize(fields.expectedCity),
    expectedSalary: normalize(fields.expectedSalary),
    latestCompany: normalize(fields.latestCompany),
    skills: normalizeList(fields.skills),
    highlights: normalizeList(fields.highlights),
  };
  return Object.values(sanitized).some((value) => Array.isArray(value) ? value.length : Boolean(value)) ? sanitized : undefined;
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

  return {
    ...item,
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
    resumeFields: sanitizeResumeFields(item.resumeFields),
  };
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

async function getCurrentFiles(): Promise<{ exists: boolean; files: string[] }> {
  try {
    const files = await listFilesRecursive(DEFAULT_SCAN_DIR);
    return { exists: true, files };
  } catch {
    return { exists: false, files: [] };
  }
}

async function parseFiles(filePaths: string[]) {
  const categoryConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const overrides = await loadDocumentOverrides();
  const parsedItems = await Promise.all(filePaths.map((filePath) => parseDocument(filePath, categoryConfig)));
  return applyDocumentOverrides(parsedItems, overrides).map(sanitizeParsedDocument);
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

export async function loadParsedDocuments(limit = 200, forceRefresh = false): Promise<LoadParsedDocumentsResult> {
  const { exists, files } = await getCurrentFiles();

  if (!exists) {
    return { exists, files, items: [], cacheHit: false };
  }

  const scanSignature = await buildScanSignature(files);

  if (!forceRefresh) {
    const cache = await readCache();
    const overrides = await loadDocumentOverrides();
    if (
      cache
      && cache.scanRoot === DEFAULT_SCAN_DIR
      && cache.totalFiles === files.length
      && cache.scanSignature === scanSignature
    ) {
      const mergedItems = await mergeWithRetainedDocuments(applyDocumentOverrides(cache.items, overrides).map(sanitizeParsedDocument));
      return { exists, files, items: mergedItems.slice(0, limit), cacheHit: true };
    }
  }

  const items = await parseFiles(files.slice(0, limit));
  await writeCache({
    generatedAt: new Date().toISOString(),
    scanRoot: DEFAULT_SCAN_DIR,
    totalFiles: files.length,
    scanSignature,
    items,
  });

  const mergedItems = await mergeWithRetainedDocuments(items);
  return { exists, files, items: mergedItems, cacheHit: false };
}

export async function mergeParsedDocumentsForPaths(filePaths: string[], limit = 200): Promise<LoadParsedDocumentsResult> {
  const { exists, files } = await getCurrentFiles();

  if (!exists) {
    return { exists, files, items: [], cacheHit: false };
  }

  const normalizedPaths = [...new Set(filePaths)];
  const targetPaths = files.slice(0, limit);
  const cache = await readCache();

  if (!cache || cache.scanRoot !== DEFAULT_SCAN_DIR) {
    return loadParsedDocuments(limit, true);
  }

  const cachedByPath = new Map(cache.items.map((item) => [item.path, item]));
  const missingTargetPath = targetPaths.some((filePath) => !normalizedPaths.includes(filePath) && !cachedByPath.has(filePath));
  if (missingTargetPath) {
    return loadParsedDocuments(limit, true);
  }

  const reparsedItems = await parseFiles(normalizedPaths.filter((filePath) => targetPaths.includes(filePath)));
  const reparsedByPath = new Map(reparsedItems.map((item) => [item.path, item]));
  const items = targetPaths
    .map((filePath) => reparsedByPath.get(filePath) || cachedByPath.get(filePath))
    .filter(Boolean) as ParsedDocument[];

  const scanSignature = await buildScanSignature(files);
  await writeCache({
    generatedAt: new Date().toISOString(),
    scanRoot: DEFAULT_SCAN_DIR,
    totalFiles: files.length,
    scanSignature,
    items,
  });

  const mergedItems = await mergeWithRetainedDocuments(items);
  return { exists, files, items: mergedItems, cacheHit: false };
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

  return keywords.filter((keyword) => {
    if (GENERIC_STOPWORDS.has(keyword)) return false;
    return keyword.length >= 4;
  });
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

export function matchDocumentsByPrompt(items: ParsedDocument[], prompt: string) {
  const keywords = extractPromptKeywords(prompt);
  if (!keywords.length) return [];
  const promptIntent = detectPromptIntent(keywords);
  const strongKeywords = extractStrongKeywords(keywords);
  const explicitIdentifiers = extractExplicitIdentifiers(prompt);

  return items
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
    .slice(0, 3)
    .map((entry) => entry.item);
}

export function matchDocumentEvidenceByPrompt(items: ParsedDocument[], prompt: string) {
  const keywords = extractPromptKeywords(prompt);
  if (!keywords.length) return [] as DocumentEvidenceMatch[];
  const promptIntent = detectPromptIntent(keywords);
  const strongKeywords = extractStrongKeywords(keywords);
  const explicitIdentifiers = extractExplicitIdentifiers(prompt);

  const ranked = items
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
    if (deduped.length >= 8) break;
  }

  return deduped;
}
