import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { REPO_ROOT, STORAGE_FILES_DIR } from './paths.js';

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
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

export function isPlatformInternalDocumentPath(filePath: string) {
  const normalizedFilePath = path.resolve(String(filePath || '')).toLowerCase();
  const normalizedRepoRoot = path.resolve(REPO_ROOT).toLowerCase();
  const normalizedStorageFilesRoot = path.resolve(STORAGE_FILES_DIR).toLowerCase();
  return normalizedFilePath.startsWith(normalizedRepoRoot) && !normalizedFilePath.startsWith(normalizedStorageFilesRoot);
}

export function buildCanonicalDocKey(item: ParsedDocument) {
  return `${item.title || item.name}`
    .replace(/^\d{10,}-/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function buildDocumentId(filePath: string) {
  return Buffer.from(filePath).toString('base64url');
}

export function extractPromptKeywords(prompt: string) {
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

export function extractStrongKeywords(keywords: string[]) {
  const explicitIdKeywords = keywords.filter((keyword) => /[\d-]/.test(keyword) || /[a-z]/i.test(keyword));
  if (explicitIdKeywords.length) {
    return explicitIdKeywords;
  }

  return [];
}

export function containsAnyKeyword(text: string, keywords: string[]) {
  const haystack = String(text || '').toLowerCase();
  if (!haystack || !keywords.length) return false;
  return keywords.some((keyword) => haystack.includes(keyword));
}

export function extractExplicitIdentifiers(prompt: string) {
  const normalized = String(prompt || '').toLowerCase();
  const matches = normalized.match(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b|\b[a-z]+\d+[a-z0-9-]*\b|\b\d+[a-z]+[a-z0-9-]*\b/g) ?? [];
  return [...new Set(matches)];
}

export function detectPromptIntent(keywords: string[]): 'contract' | 'paper' | 'mixed' {
  const joined = keywords.join(' ');
  const contractIntent = CATEGORY_KEYWORDS.contract.some((keyword) => joined.includes(keyword));
  const paperIntent = CATEGORY_KEYWORDS.paper.some((keyword) => joined.includes(keyword));

  if (contractIntent && !paperIntent) return 'contract';
  if (paperIntent && !contractIntent) return 'paper';
  if (paperIntent) return 'paper';
  return 'mixed';
}

export function looksLikeResumeDocument(item: ParsedDocument) {
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
