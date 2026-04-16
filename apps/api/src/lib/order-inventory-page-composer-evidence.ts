import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import {
  isInventoryDocumentSignal,
  isOrderDocumentSignal,
  isOrderInventoryDocumentSignal,
} from './document-domain-signals.js';
import type { ComposerPromptMode, JsonRecord } from './order-inventory-page-composer-types.js';
import {
  buildOrderComposerRankedCountList,
  collectOrderComposerAnomalySignals,
  collectOrderComposerCategorySignals,
  collectOrderComposerChannelSignals,
  collectOrderComposerMetricSignals,
  collectOrderComposerProfileStrings,
  collectOrderComposerReplenishmentSignals,
  containsOrderComposerSignal,
  formatOrderComposerSignalLabel,
  getOrderComposerStructuredProfile,
  looksLikeOrderComposerDelimitedLine,
  normalizeOrderComposerText,
  sanitizeOrderComposerText,
} from './order-inventory-page-composer-support.js';

const ORDER_EVIDENCE_EXCLUDE_SIGNALS = [
  'layout guidance',
  'output schema',
  'planning contract',
  'supply contract',
  'prompt contract',
  'proposal',
  'divoom',
];

const ORDER_EVIDENCE_INCLUDE_SIGNALS = [
  'order',
  'inventory',
  'sku',
  'platform',
  'channel',
  'category',
  'gmv',
  'net sales',
  'gross margin',
  'inventory index',
  'days of cover',
  'replenishment',
  'restock',
  'risk flag',
  'stock',
  'forecast',
  'cockpit',
  'dashboard',
  'snapshot',
];

export function selectOrderComposerDocumentTitle(item: ParsedDocument) {
  const title = sanitizeOrderComposerText(item.title || '', 120);
  if (title && !looksLikeOrderComposerDelimitedLine(title)) return title;
  const fromName = sanitizeOrderComposerText(path.parse(item.name || path.basename(item.path)).name, 120);
  if (fromName) return fromName;
  return sanitizeOrderComposerText(path.basename(item.path), 120);
}

function buildOrderEvidenceText(item: ParsedDocument) {
  return normalizeOrderComposerText([
    item.path,
    item.name,
    item.title,
    item.summary,
    item.excerpt,
    ...(item.topicTags || []),
    ...(item.groups || []),
  ].join(' '));
}

function hasStructuredOrderSignals(item: ParsedDocument) {
  return Boolean(
    collectOrderComposerProfileStrings(item, [
      'platforms',
      'platformSignals',
      'categorySignals',
      'metricSignals',
      'keyMetrics',
      'replenishmentSignals',
      'forecastSignals',
      'anomalySignals',
      'operatingSignals',
    ]).length,
  );
}

export function isOrderInventoryEvidenceDocument(item: ParsedDocument) {
  const evidenceText = buildOrderEvidenceText(item);
  if (!evidenceText) return false;
  if (containsOrderComposerSignal(evidenceText, ORDER_EVIDENCE_EXCLUDE_SIGNALS)) return false;
  if (/[\\/](skills|docs)[\\/]/i.test(String(item.path || ''))) return false;

  const schemaType = String(item.schemaType || '').toLowerCase();
  if (isOrderInventoryDocumentSignal(item)) return true;
  if (schemaType === 'order') return true;
  if (hasStructuredOrderSignals(item)) return true;
  if (schemaType === 'report' && containsOrderComposerSignal(evidenceText, ORDER_EVIDENCE_INCLUDE_SIGNALS)) return true;
  return false;
}

function scoreOrderInventoryEvidenceDocument(item: ParsedDocument) {
  const schemaType = String(item.schemaType || '').toLowerCase();
  let score = 0;

  if (isOrderDocumentSignal(item)) score += 60;
  else if (isInventoryDocumentSignal(item)) score += 56;

  if (schemaType === 'order') score += 24;
  else if (schemaType === 'report') score += 18;

  if (item.ext === '.csv') score += 16;
  else if (item.ext === '.xlsx' || item.ext === '.xls') score += 14;
  else if (item.ext === '.md') score += 8;

  score += Math.min(12, collectOrderComposerProfileStrings(item, [
    'platformSignals',
    'categorySignals',
    'metricSignals',
    'replenishmentSignals',
    'anomalySignals',
  ]).length * 2);
  score += Math.min(6, (item.topicTags || []).length);

  const evidenceText = buildOrderEvidenceText(item);
  if (containsOrderComposerSignal(evidenceText, ['omni', 'multi channel', 'multi sku', 'snapshot', 'summary', 'notes'])) {
    score += 6;
  }

  return score;
}

export function selectOrderInventoryEvidenceDocuments(
  documents: ParsedDocument[],
  options?: { maxDocuments?: number },
) {
  const maxDocuments = Math.max(1, Math.min(Number(options?.maxDocuments || 6), 12));
  const filtered = documents.filter(isOrderInventoryEvidenceDocument);
  const effective = filtered.length ? filtered : documents;

  return [...effective]
    .sort((left, right) => (
      Number(isOrderDocumentSignal(right)) - Number(isOrderDocumentSignal(left))
      || scoreOrderInventoryEvidenceDocument(right) - scoreOrderInventoryEvidenceDocument(left)
      || Number(isInventoryDocumentSignal(right)) - Number(isInventoryDocumentSignal(left))
      || sanitizeOrderComposerText(left.title || left.name).localeCompare(sanitizeOrderComposerText(right.title || right.name), 'zh-CN')
    ))
    .slice(0, maxDocuments);
}

export function buildOrderComposerDocumentSnapshot(item: ParsedDocument, compact = false) {
  const profile = getOrderComposerStructuredProfile(item);
  const keys = [
    'platforms',
    'platformSignals',
    'categorySignals',
    'metricSignals',
    'keyMetrics',
    'replenishmentSignals',
    'forecastSignals',
    'anomalySignals',
    'operatingSignals',
  ];

  return {
    name: sanitizeOrderComposerText(item.name, 120),
    title: selectOrderComposerDocumentTitle(item),
    summary: sanitizeOrderComposerText(item.summary || item.excerpt, compact ? 100 : 160),
    topicTags: (Array.isArray(item.topicTags) ? item.topicTags : []).map((entry) => sanitizeOrderComposerText(entry, 80)).filter(Boolean).slice(0, compact ? 2 : 4),
    structuredSignals: keys.reduce<JsonRecord>((acc, key) => {
      const values = collectOrderComposerProfileStrings(item, [key]).map(formatOrderComposerSignalLabel).slice(0, compact ? 2 : 3);
      if (values.length) acc[key] = values;
      return acc;
    }, {}),
    parseStage: sanitizeOrderComposerText(item.parseStage, 40),
  };
}

export function buildOrderComposerEvidenceSummary(
  input: { documents: ParsedDocument[] },
  mode: ComposerPromptMode,
  view: 'generic' | 'platform' | 'category' | 'stock',
) {
  const compact = mode === 'compact';
  const stockView = view === 'stock';
  const evidenceDocuments = selectOrderInventoryEvidenceDocuments(
    input.documents,
    { maxDocuments: stockView ? 1 : (compact ? 2 : 3) },
  );
  const rankedLimit = stockView ? 2 : (compact ? 3 : 4);
  const channels = buildOrderComposerRankedCountList(evidenceDocuments.flatMap(collectOrderComposerChannelSignals), rankedLimit);
  const categories = buildOrderComposerRankedCountList(evidenceDocuments.flatMap(collectOrderComposerCategorySignals), rankedLimit);
  const metrics = buildOrderComposerRankedCountList(evidenceDocuments.flatMap(collectOrderComposerMetricSignals), rankedLimit);
  const replenishment = buildOrderComposerRankedCountList(evidenceDocuments.flatMap(collectOrderComposerReplenishmentSignals), rankedLimit);
  const anomalies = buildOrderComposerRankedCountList(evidenceDocuments.flatMap(collectOrderComposerAnomalySignals), rankedLimit);

  return {
    evidenceDocuments,
    cockpit: {
      documentCount: evidenceDocuments.length,
      channels,
      categories,
      metrics,
      replenishment,
      anomalies,
    },
    documents: evidenceDocuments.map((item) => buildOrderComposerDocumentSnapshot(item, compact)),
  };
}
