import type { ParsedDocument } from './document-parser.js';
import type { ReportPlan } from './report-planner.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import type { ComposerPromptMode, JsonRecord, OrderInventoryRequestView } from './order-inventory-page-composer-types.js';

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

export function sanitizeOrderComposerText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

export function normalizeOrderComposerText(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isOrderComposerObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function containsOrderComposerSignal(text: string, signals: string[]) {
  return signals.some((signal) => text.includes(signal));
}

export function toOrderComposerStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeOrderComposerText(item, 80)).filter(Boolean);
}

export function buildOrderComposerRankedCountList(values: string[], limit = 8) {
  const counts = new Map<string, { label: string; value: number }>();
  for (const raw of values) {
    const label = sanitizeOrderComposerText(raw, 80);
    if (!label) continue;
    const key = normalizeOrderComposerText(label);
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

export function formatOrderComposerSignalLabel(value: string) {
  const text = sanitizeOrderComposerText(value, 80);
  if (!text) return '';
  const normalized = normalizeOrderComposerText(text);
  return ORDER_SIGNAL_LABEL_MAP.get(normalized) || CHANNEL_SIGNAL_MAP.get(normalized) || text;
}

export function getOrderComposerStructuredProfile(item: ParsedDocument) {
  return isOrderComposerObject(item.structuredProfile) ? item.structuredProfile : {};
}

export function collectOrderComposerProfileStrings(item: ParsedDocument, keys: string[]) {
  const profile = getOrderComposerStructuredProfile(item);
  return keys.flatMap((key) => {
    if (!(key in profile)) return [];
    const value = profile[key];
    if (Array.isArray(value)) return toOrderComposerStringArray(value);
    return sanitizeOrderComposerText(value, 80) ? [sanitizeOrderComposerText(value, 80)] : [];
  });
}

export function collectOrderComposerChannelSignals(item: ParsedDocument) {
  const base = collectOrderComposerProfileStrings(item, ['platforms', 'platformSignals']).map(formatOrderComposerSignalLabel);
  const text = normalizeOrderComposerText([item.title, item.summary, item.excerpt, item.name].join(' '));
  const inferred = [...CHANNEL_SIGNAL_MAP.entries()]
    .filter(([key]) => text.includes(key))
    .map(([, label]) => label);
  return [...base, ...inferred];
}

export function collectOrderComposerCategorySignals(item: ParsedDocument) {
  return [
    ...toOrderComposerStringArray(item.topicTags).filter((value) => !IGNORED_CATEGORY_SIGNALS.has(value.toLowerCase())),
    ...toOrderComposerStringArray(item.groups).filter((value) => !IGNORED_CATEGORY_SIGNALS.has(value.toLowerCase())),
    ...collectOrderComposerProfileStrings(item, ['categorySignals']).filter((value) => !IGNORED_CATEGORY_SIGNALS.has(value.toLowerCase())),
  ];
}

export function collectOrderComposerMetricSignals(item: ParsedDocument) {
  return collectOrderComposerProfileStrings(item, ['metricSignals', 'keyMetrics']).map(formatOrderComposerSignalLabel);
}

export function collectOrderComposerReplenishmentSignals(item: ParsedDocument) {
  return collectOrderComposerProfileStrings(item, ['replenishmentSignals', 'forecastSignals', 'operatingSignals']).map(formatOrderComposerSignalLabel);
}

export function collectOrderComposerAnomalySignals(item: ParsedDocument) {
  return collectOrderComposerProfileStrings(item, ['anomalySignals']).map(formatOrderComposerSignalLabel);
}

export function detectOrderInventoryRequestView(input: {
  requestText: string;
  envelope?: ReportTemplateEnvelope | null;
  reportPlan?: ReportPlan | null;
}): OrderInventoryRequestView {
  const text = normalizeOrderComposerText([
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

export function resolveOrderInventoryComposerAttemptModes(view: OrderInventoryRequestView): ComposerPromptMode[] {
  if (view === 'stock') return ['compact'];
  return ['compact', 'rich'];
}

export function looksLikeOrderComposerDelimitedLine(value: string) {
  const text = sanitizeOrderComposerText(value, 240);
  if (!text) return false;
  return ((text.match(/,/g) || []).length >= 4) || ((text.match(/\|/g) || []).length >= 4);
}
