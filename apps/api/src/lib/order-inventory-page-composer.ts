import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import type { ReportPlan } from './report-planner.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';

type JsonRecord = Record<string, unknown>;
type ComposerPromptMode = 'rich' | 'compact';
type OrderInventoryRequestView = 'generic' | 'platform' | 'category' | 'stock';

export type OrderInventoryPageComposerExecution = {
  content: string | null;
  error: string;
  attemptMode: ComposerPromptMode | '';
  attemptedModes: ComposerPromptMode[];
};

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

const CHANNEL_SIGNAL_MAP = new Map<string, string>([
  ['tmall', 'Tmall'],
  ['jd', 'JD'],
  ['douyin', 'Douyin'],
  ['pinduoduo', 'Pinduoduo'],
  ['amazon', 'Amazon'],
  ['shopify', 'Shopify'],
]);

const ORDER_SIGNAL_LABEL_MAP = new Map<string, string>([
  ['yoy', '同比'],
  ['mom', '环比'],
  ['inventory', '库存'],
  ['inventory index', '库存指数'],
  ['inventory-index', '库存指数'],
  ['sell through', '动销'],
  ['sell-through', '动销'],
  ['gmv', 'GMV'],
  ['forecast', '预测'],
  ['trend', '趋势'],
  ['planning', '规划'],
  ['replenishment', '补货'],
  ['restock', '补货'],
  ['safety stock', '安全库存'],
  ['safety-stock', '安全库存'],
  ['anomaly', '异常'],
  ['volatility', '波动'],
  ['alert', '预警'],
  ['operating review', '经营复盘'],
  ['operating-review', '经营复盘'],
  ['exception', '异常'],
]);

const IGNORED_CATEGORY_SIGNALS = new Set([
  '订单分析',
  '库存监控',
  '经营复盘',
  '销量预测',
  '备货建议',
  '订单',
  '库存',
  '电商',
  'report',
  'dashboard',
  'analysis',
  'platform',
  'category',
  'stock',
]);

function sanitizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function containsSignal(text: string, signals: string[]) {
  return signals.some((signal) => text.includes(signal));
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item, 80)).filter(Boolean);
}

function buildRankedCountList(values: string[], limit = 8) {
  const counts = new Map<string, { label: string; value: number }>();
  for (const raw of values) {
    const label = sanitizeText(raw, 80);
    if (!label) continue;
    const key = normalizeText(label);
    const next = counts.get(key);
    if (next) {
      next.value += 1;
      continue;
    }
    counts.set(key, { label, value: 1 });
  }

  return [...counts.values()]
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'zh-CN'))
    .slice(0, limit);
}

function formatSignalLabel(value: string) {
  const text = sanitizeText(value, 80);
  if (!text) return '';
  const normalized = normalizeText(text);
  return ORDER_SIGNAL_LABEL_MAP.get(normalized) || CHANNEL_SIGNAL_MAP.get(normalized) || text;
}

function getStructuredProfile(item: ParsedDocument) {
  return isObject(item.structuredProfile) ? item.structuredProfile : {};
}

function collectProfileStrings(item: ParsedDocument, keys: string[]) {
  const profile = getStructuredProfile(item);
  return keys.flatMap((key) => {
    if (!(key in profile)) return [];
    const value = profile[key];
    if (Array.isArray(value)) return toStringArray(value);
    return sanitizeText(value, 80) ? [sanitizeText(value, 80)] : [];
  });
}

function collectChannelSignals(item: ParsedDocument) {
  const base = collectProfileStrings(item, ['platforms', 'platformSignals']).map(formatSignalLabel);
  const text = normalizeText([item.title, item.summary, item.excerpt, item.name].join(' '));
  const inferred = [...CHANNEL_SIGNAL_MAP.entries()]
    .filter(([key]) => text.includes(key))
    .map(([, label]) => label);
  return [...base, ...inferred];
}

function collectCategorySignals(item: ParsedDocument) {
  return [
    ...toStringArray(item.topicTags).filter((value) => !IGNORED_CATEGORY_SIGNALS.has(value.toLowerCase())),
    ...toStringArray(item.groups).filter((value) => !IGNORED_CATEGORY_SIGNALS.has(value.toLowerCase())),
    ...collectProfileStrings(item, ['categorySignals']).filter((value) => !IGNORED_CATEGORY_SIGNALS.has(value.toLowerCase())),
  ];
}

function collectMetricSignals(item: ParsedDocument) {
  return collectProfileStrings(item, ['metricSignals', 'keyMetrics']).map(formatSignalLabel);
}

function collectReplenishmentSignals(item: ParsedDocument) {
  return collectProfileStrings(item, ['replenishmentSignals', 'forecastSignals', 'operatingSignals']).map(formatSignalLabel);
}

function collectAnomalySignals(item: ParsedDocument) {
  return collectProfileStrings(item, ['anomalySignals']).map(formatSignalLabel);
}

function detectOrderInventoryRequestView(input: {
  requestText: string;
  envelope?: ReportTemplateEnvelope | null;
  reportPlan?: ReportPlan | null;
}): OrderInventoryRequestView {
  const text = normalizeText([
    input.requestText,
    input.envelope?.title,
    input.envelope?.outputHint,
    ...(input.envelope?.pageSections || []),
    input.reportPlan?.objective,
    ...(input.reportPlan?.sections || []).map((item) => item.title),
  ].join(' '));

  if (!text) return 'generic';
  const hasStock = /inventory|stock|replenishment|restock|库存|补货|缺货|周转/.test(text);
  const hasCategory = /category|sku|品类|类目|商品/.test(text);
  const hasPlatform = /platform|channel|tmall|jd|douyin|amazon|shopify|平台|渠道|天猫|京东|抖音/.test(text);
  const hasExplicitStockView = /inventory cockpit|stock cockpit|库存驾驶舱|库存与补货驾驶舱|补货驾驶舱/.test(text);
  const hasStockRiskFocus = /断货|滞销|高风险sku|高风险 sku|72小时|72 小时|周转/.test(text);
  if (hasExplicitStockView || (hasStock && !hasCategory && !hasPlatform) || (hasStock && hasStockRiskFocus && !hasPlatform)) {
    return 'stock';
  }
  if (hasCategory && hasPlatform) return 'generic';
  if (hasCategory) return 'category';
  if (hasPlatform) return 'platform';
  return 'generic';
}

function looksLikeDelimitedLine(value: string) {
  const text = sanitizeText(value, 240);
  if (!text) return false;
  return ((text.match(/,/g) || []).length >= 4) || ((text.match(/\|/g) || []).length >= 4);
}

function selectOrderComposerDocumentTitle(item: ParsedDocument) {
  const title = sanitizeText(item.title || '', 120);
  if (title && !looksLikeDelimitedLine(title)) return title;
  const fromName = sanitizeText(path.parse(item.name || path.basename(item.path)).name, 120);
  if (fromName) return fromName;
  return sanitizeText(path.basename(item.path), 120);
}

function buildOrderEvidenceText(item: ParsedDocument) {
  return normalizeText([
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
    collectProfileStrings(item, [
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
  if (containsSignal(evidenceText, ORDER_EVIDENCE_EXCLUDE_SIGNALS)) return false;
  if (/[\\/](skills|docs)[\\/]/i.test(String(item.path || ''))) return false;

  const bizCategory = String(item.bizCategory || '').toLowerCase();
  const schemaType = String(item.schemaType || '').toLowerCase();
  if (bizCategory === 'order' || bizCategory === 'inventory') return true;
  if (schemaType === 'order') return true;
  if (hasStructuredOrderSignals(item)) return true;
  if (schemaType === 'report' && containsSignal(evidenceText, ORDER_EVIDENCE_INCLUDE_SIGNALS)) return true;
  return false;
}

function scoreOrderInventoryEvidenceDocument(item: ParsedDocument) {
  const bizCategory = String(item.bizCategory || '').toLowerCase();
  const schemaType = String(item.schemaType || '').toLowerCase();
  let score = 0;

  if (bizCategory === 'order') score += 60;
  else if (bizCategory === 'inventory') score += 56;

  if (schemaType === 'order') score += 24;
  else if (schemaType === 'report') score += 18;

  if (item.ext === '.csv') score += 16;
  else if (item.ext === '.xlsx' || item.ext === '.xls') score += 14;
  else if (item.ext === '.md') score += 8;

  score += Math.min(12, collectProfileStrings(item, [
    'platformSignals',
    'categorySignals',
    'metricSignals',
    'replenishmentSignals',
    'anomalySignals',
  ]).length * 2);
  score += Math.min(6, (item.topicTags || []).length);

  const evidenceText = buildOrderEvidenceText(item);
  if (containsSignal(evidenceText, ['omni', 'multi channel', 'multi sku', 'snapshot', 'summary', 'notes'])) {
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
      scoreOrderInventoryEvidenceDocument(right) - scoreOrderInventoryEvidenceDocument(left)
      || sanitizeText(left.title || left.name).localeCompare(sanitizeText(right.title || right.name), 'zh-CN')
    ))
    .slice(0, maxDocuments);
}

function buildDocumentSnapshot(item: ParsedDocument, compact = false) {
  const profile = getStructuredProfile(item);
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
    name: sanitizeText(item.name, 120),
    title: selectOrderComposerDocumentTitle(item),
    bizCategory: sanitizeText(item.bizCategory, 40),
    summary: sanitizeText(item.summary || item.excerpt, compact ? 100 : 160),
    topicTags: toStringArray(item.topicTags).slice(0, compact ? 2 : 4),
    structuredSignals: keys.reduce<JsonRecord>((acc, key) => {
      const values = collectProfileStrings(item, [key]).map(formatSignalLabel).slice(0, compact ? 2 : 3);
      if (values.length) acc[key] = values;
      return acc;
    }, {}),
    parseStage: sanitizeText(item.parseStage, 40),
  };
}

function buildComposerContext(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
}, mode: ComposerPromptMode) {
  const compact = mode === 'compact';
  const view = detectOrderInventoryRequestView(input);
  const evidenceDocuments = selectOrderInventoryEvidenceDocuments(
    input.documents,
    { maxDocuments: compact ? 2 : 3 },
  );
  const channels = buildRankedCountList(evidenceDocuments.flatMap(collectChannelSignals), compact ? 3 : 4);
  const categories = buildRankedCountList(evidenceDocuments.flatMap(collectCategorySignals), compact ? 3 : 4);
  const metrics = buildRankedCountList(evidenceDocuments.flatMap(collectMetricSignals), compact ? 3 : 4);
  const replenishment = buildRankedCountList(evidenceDocuments.flatMap(collectReplenishmentSignals), compact ? 3 : 4);
  const anomalies = buildRankedCountList(evidenceDocuments.flatMap(collectAnomalySignals), compact ? 3 : 4);

  return {
    requestText: sanitizeText(input.requestText, 240),
    view,
    envelope: input.envelope ? {
      title: sanitizeText(input.envelope.title, 120),
      outputHint: sanitizeText(input.envelope.outputHint, compact ? 100 : 160),
      pageSections: (input.envelope.pageSections || []).slice(0, compact ? 5 : 6),
    } : null,
    reportPlan: input.reportPlan ? {
      objective: sanitizeText(input.reportPlan.objective, compact ? 120 : 180),
      stylePriorities: (input.reportPlan.stylePriorities || []).slice(0, compact ? 2 : 3),
      evidenceRules: (input.reportPlan.evidenceRules || []).slice(0, compact ? 2 : 3),
      completionRules: (input.reportPlan.completionRules || []).slice(0, compact ? 2 : 3),
      cards: (input.reportPlan.cards || []).slice(0, compact ? 3 : 4).map((item) => ({
        label: sanitizeText(item.label, 80),
        purpose: sanitizeText(item.purpose, compact ? 80 : 120),
      })),
      charts: (input.reportPlan.charts || []).slice(0, compact ? 2 : 3).map((item) => ({
        title: sanitizeText(item.title, 80),
        purpose: sanitizeText(item.purpose, compact ? 80 : 120),
      })),
      sections: (input.reportPlan.sections || []).slice(0, compact ? 4 : 5).map((item) => ({
        title: sanitizeText(item.title, 80),
        purpose: sanitizeText(item.purpose, compact ? 80 : 120),
        evidenceFocus: sanitizeText(item.evidenceFocus, compact ? 80 : 120),
      })),
    } : null,
    cockpit: {
      documentCount: evidenceDocuments.length,
      channels,
      categories,
      metrics,
      replenishment,
      anomalies,
    },
    documents: evidenceDocuments
      .map((item) => buildDocumentSnapshot(item, compact)),
  };
}

async function buildSystemPrompt() {
  const skillInstruction = await loadWorkspaceSkillBundle('order-inventory-page-composer', [
    'references/output-schema.md',
    'references/layout-guidance.md',
  ]);

  return [
    'You are an order and inventory visual-report page composer for a private enterprise knowledge-report system.',
    'Return strict JSON only. No markdown. No explanation.',
    'Compose a premium static page that reads like an operating cockpit, not a generic report export.',
    'Treat the supplied report plan and envelope as the structural contract.',
    'Treat the supplied cockpit aggregates and evidence snapshots as the evidence layer for channels, SKU/category focus, inventory health, replenishment priorities, and anomalies.',
    'Do not invent GMV, growth rates, sell-through, stockout days, or replenishment quantities when they are not explicitly supported.',
    'If evidence is weaker than the requested shell ambition, lower specificity and make uncertainty visible in warnings or section language.',
    skillInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildComposerPrompt(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
}, mode: ComposerPromptMode) {
  const modeInstruction = mode === 'compact'
    ? 'Retry in compact mode. Preserve the cockpit shell, keep the page concise, and use only the clearest evidence clusters.'
    : 'Compose one final order or inventory cockpit page from the following report-planning context and evidence aggregates.';

  return [
    `Request: ${sanitizeText(input.requestText, 240)}`,
    modeInstruction,
    JSON.stringify(buildComposerContext(input, mode)),
  ].join('\n\n');
}

export async function runOrderInventoryPageComposerDetailed(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
  sessionUser?: string;
}): Promise<OrderInventoryPageComposerExecution> {
  if (!isOpenClawGatewayConfigured()) {
    return {
      content: null,
      error: 'Cloud gateway is not configured',
      attemptMode: '',
      attemptedModes: [],
    };
  }

  if (!input.documents.length) {
    return {
      content: null,
      error: 'No order or inventory documents available for composer',
      attemptMode: '',
      attemptedModes: [],
    };
  }

  const systemPrompt = await buildSystemPrompt();
  const attemptedModes: ComposerPromptMode[] = [];
  let lastError = '';

  for (const mode of ['rich', 'compact'] as const) {
    attemptedModes.push(mode);
    try {
      const result = await runOpenClawChat({
        prompt: buildComposerPrompt(input, mode),
        systemPrompt,
        sessionUser: input.sessionUser,
      });
      if (sanitizeText(result.content, 120)) {
        return {
          content: result.content,
          error: '',
          attemptMode: mode,
          attemptedModes,
        };
      }
      lastError = `Composer returned empty content in ${mode} mode`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error || '');
    }
  }

  return {
    content: null,
    error: lastError || 'Composer returned empty content',
    attemptMode: '',
    attemptedModes,
  };
}

export async function runOrderInventoryPageComposer(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
  sessionUser?: string;
}) {
  const result = await runOrderInventoryPageComposerDetailed(input);
  return result.content;
}
