import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { isContractDocumentSignal, isPaperDocumentSignal } from './document-domain-signals.js';
import { REPO_ROOT, STORAGE_FILES_DIR } from './paths.js';

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

function isPlatformInternalDocumentPath(filePath: string) {
  const normalizedFilePath = path.resolve(String(filePath || '')).toLowerCase();
  const normalizedRepoRoot = path.resolve(REPO_ROOT).toLowerCase();
  const normalizedStorageFilesRoot = path.resolve(STORAGE_FILES_DIR).toLowerCase();
  return normalizedFilePath.startsWith(normalizedRepoRoot) && !normalizedFilePath.startsWith(normalizedStorageFilesRoot);
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

function collectStructuredAliasText(item: ParsedDocument) {
  const profile = item.structuredProfile && typeof item.structuredProfile === 'object'
    ? (item.structuredProfile as Record<string, unknown>)
    : null;
  if (!profile) return '';

  const parts: string[] = [];
  const fieldTemplate =
    profile.fieldTemplate && typeof profile.fieldTemplate === 'object'
      ? (profile.fieldTemplate as Record<string, unknown>)
      : null;
  const fieldAliases =
    fieldTemplate?.fieldAliases && typeof fieldTemplate.fieldAliases === 'object'
      ? (fieldTemplate.fieldAliases as Record<string, unknown>)
      : null;

  for (const [canonicalField, aliasName] of Object.entries(fieldAliases || {})) {
    const normalizedAliasName = String(aliasName || '').trim();
    const normalizedCanonicalValue = String(profile[canonicalField] || '').trim();
    if (normalizedAliasName) parts.push(normalizedAliasName);
    if (normalizedCanonicalValue) parts.push(normalizedCanonicalValue);
  }

  for (const aliasMap of [profile.focusedAliasFields, profile.aliasFields]) {
    if (!aliasMap || typeof aliasMap !== 'object') continue;
    for (const [aliasName, aliasValue] of Object.entries(aliasMap as Record<string, unknown>)) {
      const normalizedAliasName = String(aliasName || '').trim();
      const normalizedAliasValue = String(aliasValue || '').trim();
      if (normalizedAliasName) parts.push(normalizedAliasName);
      if (normalizedAliasValue) parts.push(normalizedAliasValue);
    }
  }

  return parts.join(' ').toLowerCase();
}

function scoreDocumentMatch(item: ParsedDocument, keywords: string[], promptIntent: 'contract' | 'paper' | 'mixed') {
  const name = item.name.toLowerCase();
  const summary = item.summary.toLowerCase();
  const excerpt = item.excerpt.toLowerCase();
  const tags = (item.topicTags || []).join(' ').toLowerCase();
  const aliasText = collectStructuredAliasText(item);
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
    score += scoreKeywordAgainstText(keyword, aliasText) * 3;
  }

  for (const keyword of CATEGORY_KEYWORDS[item.category] ?? []) {
    if (keywords.includes(keyword)) score += 3;
  }

  if (isContractDocumentSignal(item)) {
    for (const keyword of CATEGORY_KEYWORDS.contract) {
      if (keywords.includes(keyword)) score += 4;
    }
  }

  if (isPaperDocumentSignal(item)) {
    for (const keyword of CATEGORY_KEYWORDS.paper) {
      if (keywords.includes(keyword)) score += 4;
    }
  }

  if (promptIntent === 'contract') {
    if (isContractDocumentSignal(item)) score += 10;
    else if (item.category === 'technical' || isPaperDocumentSignal(item)) score -= 6;
  }

  if (promptIntent === 'paper') {
    if (item.category === 'technical' || isPaperDocumentSignal(item)) score += 10;
    else if (isContractDocumentSignal(item)) score -= 6;
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
  if ((haystack.match(/[,;:]/g) || []).length > 14 && !/[。？！?!]/.test(haystack)) score -= 3;
  if (haystack.length >= 120 && haystack.length <= 480) score += 2;
  if (haystack.length > 700) score -= 2;
  return score;
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

export function buildDocumentId(filePath: string) {
  return Buffer.from(filePath).toString('base64url');
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
