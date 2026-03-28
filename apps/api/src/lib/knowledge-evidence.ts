import type { ParsedDocument } from './document-parser.js';
import type { RetrievalResult } from './document-retrieval.js';

type KnowledgeLibrary = { key: string; label: string };

type KnowledgeScope = {
  timeRange?: string;
  contentFocus?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toText(value: unknown) {
  return String(value || '').trim();
}

function formatStructuredProfile(profile: ParsedDocument['structuredProfile']) {
  if (!profile || typeof profile !== 'object') return '';

  return Object.entries(profile)
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        const compact = value.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 5);
        return compact.length ? [`${key}: ${compact.join('、')}`] : [];
      }
      if (value && typeof value === 'object') {
        const compact = Object.entries(value as Record<string, unknown>)
          .map(([entryKey, entryValue]) => `${entryKey}:${String(entryValue || '').trim()}`)
          .filter((entry) => !entry.endsWith(':'))
          .slice(0, 4);
        return compact.length ? [`${key}: ${compact.join('；')}`] : [];
      }
      const text = String(value || '').trim();
      return text ? [`${key}: ${text}`] : [];
    })
    .slice(0, 8)
    .join('\n');
}

function extractPathTimestamp(filePath: string) {
  const match = String(filePath || '').match(/(?:^|[\\/])(\d{13})(?:[-_.]|$)/);
  if (!match) return 0;
  const value = Number(match[1]);
  return value >= 1500000000000 && value <= 4102444800000 ? value : 0;
}

function extractDocumentTimestamp(item: ParsedDocument) {
  const candidates = [
    extractPathTimestamp(item.path || ''),
    extractPathTimestamp(item.name || ''),
    Date.parse(String(item.detailParsedAt || '')),
    Date.parse(String(item.cloudStructuredAt || '')),
    Date.parse(String(item.retainedAt || '')),
  ].filter((value) => Number.isFinite(value) && value > 0);

  return candidates.length ? Math.max(...candidates) : 0;
}

function sortDocumentsForKnowledgeContext(items: ParsedDocument[]) {
  return [...items].sort((left, right) => {
    const leftDetailed = left.parseStage === 'detailed' || left.detailParseStatus === 'succeeded' ? 1 : 0;
    const rightDetailed = right.parseStage === 'detailed' || right.detailParseStatus === 'succeeded' ? 1 : 0;
    if (rightDetailed !== leftDetailed) return rightDetailed - leftDetailed;
    return extractDocumentTimestamp(right) - extractDocumentTimestamp(left);
  });
}

function getWeekStart(now: Date) {
  const date = new Date(now);
  const day = date.getDay();
  const offset = day === 0 ? 6 : day - 1;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - offset);
  return date.getTime();
}

function getMonthStart(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function getQuarterStart(now: Date) {
  const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
  return new Date(now.getFullYear(), quarterMonth, 1).getTime();
}

function normalizeTimeRangeLabel(timeRange?: string) {
  const text = toText(timeRange).toLowerCase();
  if (!text) return '';
  if (/\u5168\u90e8\u65f6\u95f4|\u5168\u65f6\u95f4|\u6240\u6709\u65f6\u95f4|\u5168\u91cf|\u5168\u90e8|\u5168\u5e93|all time|full range/.test(text)) return 'all-time';
  if (/\u6700\u8fd1\u4e0a\u4f20|\u521a\u4e0a\u4f20|recent upload|latest upload/.test(text)) return 'recent-upload';
  if (/\u4eca\u5929|today/.test(text)) return 'today';
  if (/\u6628\u5929|\u6628\u65e5|yesterday/.test(text)) return 'yesterday';
  if (/\u672c\u5468|this week/.test(text)) return 'this-week';
  if (/\u4e0a\u5468|last week/.test(text)) return 'last-week';
  if (/\u672c\u6708|this month/.test(text)) return 'this-month';
  if (/\u4e0a\u4e2a\u6708|last month/.test(text)) return 'last-month';
  if (/\u6700\u8fd1\u4e00\u4e2a\u6708|\u8fd1\u4e00\u4e2a\u6708|recent month|last month/.test(text)) return 'recent-30d';
  if (/\u6700\u8fd1\u4e09\u4e2a\u6708|\u8fd1\u4e09\u4e2a\u6708|recent 3 months|last 3 months/.test(text)) return 'recent-90d';
  if (/\u6700\u8fd1\u534a\u5e74|\u8fd1\u534a\u5e74|recent 6 months|last 6 months/.test(text)) return 'recent-180d';
  if (/\u6700\u8fd1\u4e00\u5e74|\u8fd1\u4e00\u5e74|recent year|last year/.test(text)) return 'recent-365d';
  if (/\u672c\u5b63\u5ea6|this quarter/.test(text)) return 'this-quarter';
  return '';
}

function resolveTimeWindow(label: string, now = new Date()) {
  const end = now.getTime();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  switch (label) {
    case 'recent-upload':
      return { min: end - 7 * DAY_MS, max: end + DAY_MS };
    case 'today':
      return { min: todayStart, max: todayStart + DAY_MS };
    case 'yesterday':
      return { min: todayStart - DAY_MS, max: todayStart };
    case 'this-week':
      return { min: getWeekStart(now), max: end + DAY_MS };
    case 'last-week': {
      const currentWeekStart = getWeekStart(now);
      return { min: currentWeekStart - 7 * DAY_MS, max: currentWeekStart };
    }
    case 'this-month':
      return { min: getMonthStart(now), max: end + DAY_MS };
    case 'last-month': {
      const currentMonthStart = getMonthStart(now);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      return { min: lastMonth, max: currentMonthStart };
    }
    case 'recent-30d':
      return { min: end - 30 * DAY_MS, max: end + DAY_MS };
    case 'recent-90d':
      return { min: end - 90 * DAY_MS, max: end + DAY_MS };
    case 'recent-180d':
      return { min: end - 180 * DAY_MS, max: end + DAY_MS };
    case 'recent-365d':
      return { min: end - 365 * DAY_MS, max: end + DAY_MS };
    case 'this-quarter':
      return { min: getQuarterStart(now), max: end + DAY_MS };
    default:
      return null;
  }
}

export function filterDocumentsByTimeRange(items: ParsedDocument[], timeRange?: string) {
  const label = normalizeTimeRangeLabel(timeRange);
  if (!label || !items.length) return items;
  if (label === 'all-time') return items;

  const window = resolveTimeWindow(label);
  if (!window) return items;

  const ranked = items.map((item) => ({ item, timestamp: extractDocumentTimestamp(item) }));
  const matched = ranked
    .filter((entry) => entry.timestamp && entry.timestamp >= window.min && entry.timestamp < window.max)
    .sort((left, right) => right.timestamp - left.timestamp)
    .map((entry) => entry.item);

  return matched.length ? matched : items;
}

function tokenizeContentFocus(contentFocus?: string) {
  const text = toText(contentFocus).toLowerCase();
  if (!text) return [];
  const asciiTokens = text.split(/[^a-z0-9]+/i).filter((entry) => entry.length >= 2);
  const cjkTokens = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
  return [...new Set([...asciiTokens, ...cjkTokens])].slice(0, 16);
}

function scoreContentFocus(item: ParsedDocument, tokens: string[]) {
  if (!tokens.length) return 0;
  const haystack = [
    item.title || item.name || '',
    item.summary || '',
    item.excerpt || '',
    ...(item.topicTags || []),
    ...(item.groups || []),
    ...(item.confirmedGroups || []),
    JSON.stringify(item.structuredProfile || {}),
  ]
    .join(' ')
    .toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (!haystack.includes(token)) continue;
    score += token.length >= 4 ? 3 : 2;
  }
  return score;
}

export function filterDocumentsByContentFocus(items: ParsedDocument[], contentFocus?: string) {
  const tokens = tokenizeContentFocus(contentFocus);
  if (!tokens.length || !items.length) return items;

  const ranked = items
    .map((item) => ({ item, score: scoreContentFocus(item, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked.length ? ranked.map((entry) => entry.item) : items;
}

export function buildKnowledgeRetrievalQuery(
  requestText: string,
  libraries: KnowledgeLibrary[],
  scope?: KnowledgeScope,
) {
  const cleaned = String(requestText || '')
    .replace(/based on|according to|around|focus on|please/gi, ' ')
    .replace(/\u8bf7\u6309|\u6309\u7167|\u57fa\u4e8e|\u6839\u636e|\u56f4\u7ed5|\u9488\u5bf9/g, ' ')
    .replace(/\u77e5\u8bc6\u5e93|\u8d44\u6599\u5e93|\u6587\u6863\u5e93|\u5e93\u5185\u5185\u5bb9/g, ' ')
    .replace(/\u8f93\u51fa|\u751f\u6210|\u505a\u4e00\u4efd|\u7ed9\u6211\u4e00\u4efd/g, ' ')
    .replace(/\u8868\u683c\u62a5\u8868|\u8868\u683c|\u62a5\u8868|\u9759\u6001\u9875|\u53ef\u89c6\u5316\u9875|\u5206\u6790\u9875|\u62a5\u544a|pdf|ppt/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const libraryHint = libraries.map((item) => item.label).join(' ');
  const scopeParts = [
    toText(scope?.contentFocus),
    toText(scope?.timeRange),
  ].filter(Boolean);

  return [cleaned, ...scopeParts, libraryHint].filter(Boolean).join(' ').trim();
}

export function buildKnowledgeContext(
  requestText: string,
  libraries: KnowledgeLibrary[],
  retrieval: RetrievalResult | { documents: any[]; evidenceMatches: any[] },
  scope?: KnowledgeScope,
) {
  const documents = sortDocumentsForKnowledgeContext(retrieval.documents).slice(0, 6);
  const evidence = retrieval.evidenceMatches.slice(0, 8);
  const documentBlocks = documents.map((item: ParsedDocument, index: number) => {
    const evidenceChunks = (item.evidenceChunks || [])
      .slice(0, 2)
      .map((chunk) => String(chunk?.text || '').trim())
      .filter(Boolean);
    const claims = (item.claims || [])
      .slice(0, 2)
      .map((claim) => [claim.subject, claim.predicate, claim.object].filter(Boolean).join(' '))
      .filter(Boolean);
    const profile = formatStructuredProfile(item.structuredProfile);

    return [
      `文档 ${index + 1}: ${item.title || item.name}`,
      `类型：${item.schemaType || item.category || 'generic'}`,
      `摘要：${item.summary || item.excerpt || '无摘要'}`,
      profile ? `结构化重点：\n${profile}` : '',
      claims.length ? `关键结论：\n${claims.map((text, claimIndex) => `${claimIndex + 1}. ${text}`).join('\n')}` : '',
      evidenceChunks.length
        ? `关键证据：\n${evidenceChunks.map((text, evidenceIndex) => `${evidenceIndex + 1}. ${text}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  });

  return [
    `用户需求：${requestText}`,
    `优先知识库：${libraries.map((item) => item.label).join('、') || '未明确'}`,
    scope?.timeRange ? `时间范围：${scope.timeRange}` : '',
    scope?.contentFocus ? `内容范围：${scope.contentFocus}` : '',
    '',
    '优先参考的详细解析文档：',
    ...documentBlocks,
    '',
    '高相关证据：',
    ...evidence.map(
      (item: any, index: number) =>
        `${index + 1}. ${item.item.title || item.item.name}\n证据：${String(item.chunkText || '').trim()}`,
    ),
  ].filter(Boolean).join('\n\n');
}

export function buildLibraryFallbackRetrieval(scopedItems: ParsedDocument[]) {
  const documents = scopedItems.slice(0, 6).map((item) => ({
    ...item,
    title: item.title || item.name || '未命名文档',
  }));

  const evidenceMatches = scopedItems
    .flatMap((item) =>
      (item.evidenceChunks || [])
        .slice(0, 2)
        .map((chunk) => ({
          item,
          chunkText: toText(typeof chunk === 'string' ? chunk : chunk?.text),
          score: 1,
        })),
    )
    .filter((entry) => entry.chunkText)
    .slice(0, 8);

  return { documents, evidenceMatches };
}
