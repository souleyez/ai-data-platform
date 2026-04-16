import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import type { CatalogMemoryDetailLevel, OpenClawMemoryDocumentCard } from './openclaw-memory-catalog-types.js';

const SMALL_LIBRARY_DETAIL_LIMIT = Math.max(3, Number(process.env.OPENCLAW_MEMORY_SMALL_LIBRARY_DETAIL_LIMIT || 20));
const MEDIUM_LIBRARY_DETAIL_LIMIT = Math.max(
  SMALL_LIBRARY_DETAIL_LIMIT + 1,
  Number(process.env.OPENCLAW_MEMORY_MEDIUM_LIBRARY_DETAIL_LIMIT || 80),
);

export function sanitizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...` : text;
}

export function sanitizeList(values: unknown[], maxLength = 80, limit = 6) {
  return [...new Set(values.map((item) => sanitizeText(item, maxLength)).filter(Boolean))].slice(0, limit);
}

export function sanitizeFact(value: unknown, maxLength = 160) {
  return sanitizeText(value, maxLength).replace(/^[-:：\s]+/, '').trim();
}

export function extractDocumentUpdatedAt(item: ParsedDocument) {
  const candidates = [
    item.detailParsedAt,
    item.cloudStructuredAt,
    item.retainedAt,
    item.originalDeletedAt,
    item.groupConfirmedAt,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  const base = candidates.length ? Math.max(...candidates) : 0;
  return base > 0 ? new Date(base).toISOString() : '';
}

export function resolveAvailability(item: ParsedDocument) {
  if (item.ignored) return 'audit-excluded';
  if (item.retentionStatus === 'structured-only') return 'structured-only';
  if (item.parseStatus === 'error') return 'parse-error';
  if (item.parseStatus === 'unsupported') return 'unsupported';
  return 'available';
}

export function deriveSuggestedQuestionTypes(haystackSource: { key: string; label: string; description?: string }) {
  const haystack = `${haystackSource.key} ${haystackSource.label} ${haystackSource.description || ''}`.toLowerCase();
  if (/resume|简历|人才|候选/.test(haystack)) return ['latest resumes', 'candidate comparison', 'role matching'];
  if (/order|订单|inventory|库存|sku|erp/.test(haystack)) return ['order summary', 'inventory health', 'channel or sku comparison'];
  if (/bid|招标|投标|标书|tender/.test(haystack)) return ['qualification risk', 'bid comparison', 'evidence summary'];
  if (/iot|物联网|设备|网关/.test(haystack)) return ['solution overview', 'capability comparison', 'component summary'];
  return ['catalog lookup', 'detail answer', 'structured output'];
}

export function resolveCatalogMemoryDetailLevel(documentCount: number): CatalogMemoryDetailLevel {
  if (documentCount <= SMALL_LIBRARY_DETAIL_LIMIT) return 'deep';
  if (documentCount <= MEDIUM_LIBRARY_DETAIL_LIMIT) return 'medium';
  return 'shallow';
}

function looksLikeDelimitedLine(value: string) {
  const text = sanitizeText(value, 240);
  if (!text) return false;
  return ((text.match(/,/g) || []).length >= 4) || ((text.match(/\|/g) || []).length >= 4);
}

export function selectCatalogMemoryTitle(item: Pick<ParsedDocument, 'title' | 'name' | 'path'>) {
  const title = sanitizeText(item.title || '', 160);
  if (title && !looksLikeDelimitedLine(title)) return title;
  const fromName = sanitizeText(path.parse(item.name || path.basename(item.path)).name, 160);
  if (fromName) return fromName;
  return sanitizeText(path.basename(item.path), 160);
}

export function buildDocumentFingerprint(card: {
  libraryKeys: string[];
  title: string;
  summary: string;
  availability: string;
  updatedAt: string;
  parseStatus: string;
  parseStage: string;
  detailParseStatus: string;
  topicTags: string[];
  keyFacts: string[];
  evidenceHighlights: string[];
  detailLevel: CatalogMemoryDetailLevel;
}) {
  return JSON.stringify(card);
}

export function sortDocumentCards(cards: OpenClawMemoryDocumentCard[]) {
  return [...cards].sort((left, right) => (
    Date.parse(right.updatedAt || '') - Date.parse(left.updatedAt || '')
    || left.title.localeCompare(right.title, 'zh-CN')
  ));
}
