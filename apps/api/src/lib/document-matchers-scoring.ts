import type { ParsedDocument } from './document-parser.js';
import { isContractDocumentSignal, isPaperDocumentSignal } from './document-domain-signals.js';
import { CATEGORY_KEYWORDS } from './document-matchers-support.js';

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

export function scoreDocumentMatch(item: ParsedDocument, keywords: string[], promptIntent: 'contract' | 'paper' | 'mixed') {
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

export function scoreChunkMatch(text: string, keywords: string[]) {
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
