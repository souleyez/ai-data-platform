import type { ParsedDocument } from './document-parser.js';
import { isOrderInventoryDocumentSignal } from './document-domain-signals.js';
import {
  buildGenericShellCards,
  buildGenericShellCharts,
  buildOrderPageCards,
  buildOrderPageCharts,
  buildOrderPageSummary,
  buildOrderPageTitle,
  buildOrderSectionBlueprints,
  buildStockShellCards,
  buildStockShellCharts,
  defaultOrderPageSections,
  mergeOrderPageSections,
} from './knowledge-output-order-page.js';
import type { ReportTemplateEnvelope } from './report-center.js';

export type OrderRequestView = 'generic' | 'platform' | 'category' | 'stock';

export type OrderOutputDeps = {
  normalizeText: (value: string) => string;
  sanitizeText: (value: unknown) => string;
  containsAny: (text: string, keywords: string[]) => boolean;
  toStringArray: (value: unknown) => string[];
  buildRankedLabelCounts: (values: string[], limit?: number) => Array<{ label: string; value: number }>;
  joinRankedLabels: (items: Array<{ label: string; value: number }>, limit?: number) => string;
  looksLikeJsonEchoText: (value: string) => boolean;
};

export type OrderPageStats = {
  documentCount: number;
  channels: Array<{ label: string; value: number }>;
  categories: Array<{ label: string; value: number }>;
  metrics: Array<{ label: string; value: number }>;
  replenishment: Array<{ label: string; value: number }>;
  anomalies: Array<{ label: string; value: number }>;
  supportingLines: string[];
  platformAmounts: Array<{ label: string; value: number }>;
  categoryAmounts: Array<{ label: string; value: number }>;
  riskHighlights: string[];
  actionHighlights: string[];
};

type OrderPage = {
  summary?: string;
  cards?: Array<{ label?: string; value?: string; note?: string }>;
  sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
  charts?: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>;
};

export type KnowledgePageOutput = {
  type: 'page';
  title: string;
  content: string;
  format: 'html';
  page: NonNullable<OrderPage>;
};

const ORDER_CHANNEL_LABEL_MAP = new Map<string, string>([
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
  ['stock', '库存'],
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

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isOrderInventoryDocument(
  item: ParsedDocument,
  deps: Pick<OrderOutputDeps, 'normalizeText' | 'containsAny'>,
) {
  const schemaType = String(item.schemaType || '').toLowerCase();
  if (isOrderInventoryDocumentSignal(item)) return true;
  if (schemaType === 'order') return true;
  if (
    schemaType === 'report'
    && deps.containsAny(
      deps.normalizeText([
        item.title,
        item.summary,
        item.excerpt,
        ...(item.topicTags || []),
      ].join(' ')),
      ['order', 'inventory', 'replenishment', 'stock', '订单', '库存', '补货', '备货'],
    )
  ) {
    return true;
  }
  return false;
}

function hasOrderPlatformSignal(text: string, deps: Pick<OrderOutputDeps, 'containsAny'>) {
  return deps.containsAny(text, ['platform', 'channel', 'tmall', 'jd', 'douyin', 'amazon', 'shopify', '平台', '渠道', '天猫', '京东', '抖音']);
}

function hasOrderCategorySignal(text: string, deps: Pick<OrderOutputDeps, 'containsAny'>) {
  return deps.containsAny(text, ['category', 'categories', 'sku', '品类', '类目', '商品']);
}

function hasOrderStockSignal(text: string, deps: Pick<OrderOutputDeps, 'containsAny'>) {
  return deps.containsAny(text, ['inventory', 'stock', 'forecast', 'replenishment', 'restock', '库存', '补货', '备货', '缺货', '周转']);
}

export function resolveOrderRequestView(
  requestText: string,
  deps: Pick<OrderOutputDeps, 'normalizeText' | 'containsAny'>,
): OrderRequestView {
  const text = deps.normalizeText(requestText);
  const hasStock = hasOrderStockSignal(text, deps);
  const hasCategory = hasOrderCategorySignal(text, deps);
  const hasPlatform = hasOrderPlatformSignal(text, deps);
  const hasExplicitStockView = deps.containsAny(text, [
    'inventory cockpit',
    'stock cockpit',
    '库存驾驶舱',
    '库存与补货驾驶舱',
    '补货驾驶舱',
  ]);
  const hasStockRiskFocus = deps.containsAny(text, ['断货', '滞销', '高风险sku', '高风险 sku', '72小时', '72 小时', '周转']);
  if (hasExplicitStockView || (hasStock && !hasCategory && !hasPlatform) || (hasStock && hasStockRiskFocus && !hasPlatform)) {
    return 'stock';
  }
  if (hasCategory && hasPlatform) return 'generic';
  if (hasCategory) return 'category';
  if (hasPlatform) return 'platform';
  return 'generic';
}

function formatOrderSignalLabel(value: string, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText'>) {
  const text = deps.sanitizeText(value);
  if (!text) return '';
  const normalized = deps.normalizeText(text);
  return ORDER_SIGNAL_LABEL_MAP.get(normalized) || ORDER_CHANNEL_LABEL_MAP.get(normalized) || text;
}

function collectOrderProfileStrings(
  item: ParsedDocument,
  keys: string[],
  deps: Pick<OrderOutputDeps, 'toStringArray'>,
) {
  const profile = isObject(item.structuredProfile) ? item.structuredProfile : {};
  return keys.flatMap((key) => {
    if (!(key in profile)) return [];
    return deps.toStringArray(profile[key]);
  });
}

function extractOrderCsvTable(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'sanitizeText' | 'normalizeText'>, limit = 80) {
  const source = String(item.fullText || '')
    .replace(/\r/g, '')
    .trim();
  if (!source || !source.includes(',')) return null;

  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const headers = lines[0]
    .split(',')
    .map((cell) => deps.normalizeText(cell))
    .filter(Boolean);
  if (headers.length < 2) return null;

  const rows = lines
    .slice(1, limit + 1)
    .map((line) => line.split(',').map((cell) => deps.sanitizeText(cell)))
    .filter((row) => row.some(Boolean));
  if (!rows.length) return null;

  return { headers, rows };
}

function findOrderHeaderIndex(headers: string[], aliases: string[], deps: Pick<OrderOutputDeps, 'normalizeText'>) {
  const aliasSet = new Set(aliases.map((alias) => deps.normalizeText(alias)));
  for (let index = 0; index < headers.length; index += 1) {
    if (aliasSet.has(headers[index])) return index;
  }
  return -1;
}

function parseOrderNumericValue(value: unknown, deps: Pick<OrderOutputDeps, 'sanitizeText'>) {
  const text = deps.sanitizeText(value).replace(/,/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function addOrderAmount(target: Map<string, { label: string; value: number }>, label: string, value: number, deps: Pick<OrderOutputDeps, 'normalizeText'>) {
  const normalized = deps.normalizeText(label);
  if (!normalized || !Number.isFinite(value)) return;
  const existing = target.get(normalized);
  if (existing) {
    existing.value += value;
    return;
  }
  target.set(normalized, { label, value });
}

function rankOrderAmounts(target: Map<string, { label: string; value: number }>, limit = 8) {
  return [...target.values()]
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'zh-CN'))
    .slice(0, limit);
}

function normalizeOrderPriority(value: unknown, deps: Pick<OrderOutputDeps, 'sanitizeText'>) {
  const text = deps.sanitizeText(value).slice(0, 16).toUpperCase();
  const match = text.match(/P\d/);
  return match?.[0] || text;
}

function isHealthyOrderRisk(value: string, deps: Pick<OrderOutputDeps, 'normalizeText' | 'containsAny'>) {
  return deps.containsAny(deps.normalizeText(value), ['healthy', 'normal', 'stable', 'ok', '正常', '健康']);
}

function scoreOrderRiskHighlight(
  risk: string,
  priority: string,
  inventoryIndex: number | null,
  daysOfCover: number | null,
  deps: Pick<OrderOutputDeps, 'normalizeText' | 'containsAny'>,
) {
  let score = 0;
  const normalizedRisk = deps.normalizeText(risk);
  if (deps.containsAny(normalizedRisk, ['stockout', 'shortage', 'low stock', '缺货'])) score += 8;
  if (deps.containsAny(normalizedRisk, ['overstock', 'slow moving', '滞销', '积压'])) score += 6;
  if (deps.containsAny(normalizedRisk, ['risk', 'anomaly', '异常', '波动'])) score += 4;
  if (priority === 'P0') score += 7;
  else if (priority === 'P1') score += 5;
  else if (priority === 'P2') score += 3;
  if (inventoryIndex !== null) {
    if (inventoryIndex >= 1.4 || inventoryIndex <= 0.75) score += 4;
    else if (inventoryIndex >= 1.2 || inventoryIndex <= 0.9) score += 2;
  }
  if (daysOfCover !== null) {
    if (daysOfCover >= 120 || daysOfCover <= 15) score += 3;
    else if (daysOfCover >= 90 || daysOfCover <= 21) score += 1;
  }
  return score;
}

function shouldTreatOrderRiskAsMaterial(
  risk: string,
  priority: string,
  inventoryIndex: number | null,
  daysOfCover: number | null,
  deps: Pick<OrderOutputDeps, 'normalizeText' | 'containsAny'>,
) {
  if (risk && !isHealthyOrderRisk(risk, deps)) return true;
  if (priority === 'P0' || priority === 'P1') return true;
  if (inventoryIndex !== null && (inventoryIndex >= 1.2 || inventoryIndex <= 0.9)) return true;
  if (daysOfCover !== null && (daysOfCover >= 90 || daysOfCover <= 21)) return true;
  return false;
}

function pickTopOrderHighlights(items: Array<{ key?: string; text: string; score: number }>, deps: Pick<OrderOutputDeps, 'normalizeText'>, limit = 4) {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const item of items
    .filter((entry) => entry.text)
    .sort((left, right) => right.score - left.score || left.text.localeCompare(right.text, 'zh-CN'))) {
    const normalized = deps.normalizeText(item.key || item.text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    results.push(item.text);
    if (results.length >= limit) break;
  }
  return results;
}

function mergeOrderHighlightBullets(primary: string[], secondary: string[], deps: Pick<OrderOutputDeps, 'sanitizeText' | 'normalizeText'>, limit = 4) {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const value of [...primary, ...secondary]) {
    const text = deps.sanitizeText(value).slice(0, 120).trim();
    const normalized = deps.normalizeText(text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(text);
    if (merged.length >= limit) break;
  }
  return merged;
}

function collectOrderCsvValues(
  item: ParsedDocument,
  headerAliases: string[],
  deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText'>,
  limit = 24,
  dedupe = true,
) {
  const table = extractOrderCsvTable(item, deps, Math.max(limit * 4, 24));
  if (!table) return [];

  const aliases = new Set(headerAliases.map((alias) => deps.normalizeText(alias)));
  const indexes = table.headers.flatMap((header, index) => (aliases.has(header) ? [index] : []));
  if (!indexes.length) return [];

  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of table.rows) {
    for (const index of indexes) {
      const value = deps.sanitizeText(row[index]);
      if (!value) continue;
      const key = deps.normalizeText(value);
      if (dedupe && seen.has(key)) continue;
      if (dedupe) seen.add(key);
      values.push(value);
      if (values.length >= limit) return values;
    }
  }

  return values;
}

function collectOrderCsvMetricSignals(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText'>) {
  const table = extractOrderCsvTable(item, deps, 12);
  const csvSignals: string[] = [];
  if (table) {
    const headerSet = new Set(table.headers);
    const mappings = [
      { aliases: ['net_sales', 'net amount', 'net_amount'], label: '净销售额' },
      { aliases: ['gross_profit'], label: '毛利额' },
      { aliases: ['gross_margin'], label: '毛利率' },
      { aliases: ['avg_order_value'], label: '客单价' },
      { aliases: ['order_count'], label: '订单量' },
      { aliases: ['units_sold', 'quantity'], label: '销量' },
      { aliases: ['discount_total', 'discount_amount'], label: '折扣额' },
      { aliases: ['refund_total', 'refund_amount'], label: '退款额' },
      { aliases: ['inventory_index'], label: '库存指数' },
      { aliases: ['days_of_cover'], label: '库存覆盖天数' },
      { aliases: ['safety_stock'], label: '安全库存' },
      { aliases: ['inventory_before', 'inventory_after'], label: '库存水位' },
    ];
    for (const mapping of mappings) {
      if (mapping.aliases.some((alias) => headerSet.has(deps.normalizeText(alias)))) {
        csvSignals.push(mapping.label);
      }
    }
  }

  return csvSignals;
}

function collectOrderCsvSupportingLines(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText'>, limit = 3) {
  const table = extractOrderCsvTable(item, deps, Math.max(limit * 6, 12));
  if (!table) return [];

  const findValue = (row: string[], aliases: string[]) => {
    const aliasSet = new Set(aliases.map((alias) => deps.normalizeText(alias)));
    for (let index = 0; index < table.headers.length; index += 1) {
      if (!aliasSet.has(table.headers[index])) continue;
      const value = deps.sanitizeText(row[index]);
      if (value) return value;
    }
    return '';
  };

  const prioritizedRows = [...table.rows].sort((left, right) => {
    const leftScore = [
      findValue(left, ['risk_flag', 'risk', 'inventory_risk', 'anomaly_note']),
      findValue(left, ['replenishment_priority', 'recommendation']),
    ].filter(Boolean).length;
    const rightScore = [
      findValue(right, ['risk_flag', 'risk', 'inventory_risk', 'anomaly_note']),
      findValue(right, ['replenishment_priority', 'recommendation']),
    ].filter(Boolean).length;
    return rightScore - leftScore;
  });

  return prioritizedRows
    .slice(0, limit)
    .map((row) => {
      const platform = findValue(row, ['platform', 'platform_focus']) || '多渠道';
      const category = findValue(row, ['category']) || '重点品类';
      const sku = findValue(row, ['sku']) || '';
      const netSales = findValue(row, ['net_sales', 'net_amount']);
      const inventoryIndex = findValue(row, ['inventory_index', 'days_of_cover']);
      const risk = findValue(row, ['risk_flag', 'risk', 'inventory_risk', 'anomaly_note']);
      const action = findValue(row, ['replenishment_priority', 'recommendation']);
      return [
        platform,
        category,
        sku,
        netSales ? `净销售额 ${netSales}` : '',
        inventoryIndex ? `库存信号 ${inventoryIndex}` : '',
        risk ? `风险 ${risk}` : '',
        action ? `动作 ${action}` : '',
      ]
        .filter(Boolean)
        .join(' / ');
    })
    .filter(Boolean);
}

function buildOrderCsvDerivedFacts(documents: ParsedDocument[], deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText' | 'containsAny'>) {
  const platformAmounts = new Map<string, { label: string; value: number }>();
  const categoryAmounts = new Map<string, { label: string; value: number }>();
  const riskEntries: Array<{ key?: string; text: string; score: number }> = [];
  const actionEntries: Array<{ key?: string; text: string; score: number }> = [];

  for (const item of documents) {
    const table = extractOrderCsvTable(item, deps, 240);
    if (!table) continue;

    const platformIndex = findOrderHeaderIndex(table.headers, ['platform', 'platform_focus'], deps);
    const categoryIndex = findOrderHeaderIndex(table.headers, ['category'], deps);
    const skuIndex = findOrderHeaderIndex(table.headers, ['sku'], deps);
    const netSalesIndex = findOrderHeaderIndex(table.headers, ['net_sales', 'net_amount'], deps);
    const inventoryIndexIndex = findOrderHeaderIndex(table.headers, ['inventory_index'], deps);
    const daysOfCoverIndex = findOrderHeaderIndex(table.headers, ['days_of_cover'], deps);
    const riskIndex = findOrderHeaderIndex(table.headers, ['risk_flag', 'risk', 'inventory_risk'], deps);
    const priorityIndex = findOrderHeaderIndex(table.headers, ['replenishment_priority'], deps);
    const recommendationIndex = findOrderHeaderIndex(table.headers, ['recommendation'], deps);

    for (const row of table.rows) {
      const platform = platformIndex >= 0 ? formatOrderSignalLabel(row[platformIndex] || '', deps) : '';
      const category = categoryIndex >= 0 ? formatOrderSignalLabel(row[categoryIndex] || '', deps) : '';
      const sku = skuIndex >= 0 ? deps.sanitizeText(row[skuIndex]).slice(0, 60).trim() : '';
      const netSales = netSalesIndex >= 0 ? parseOrderNumericValue(row[netSalesIndex], deps) : null;
      const inventoryIndex = inventoryIndexIndex >= 0 ? parseOrderNumericValue(row[inventoryIndexIndex], deps) : null;
      const daysOfCover = daysOfCoverIndex >= 0 ? parseOrderNumericValue(row[daysOfCoverIndex], deps) : null;
      const risk = riskIndex >= 0 ? formatOrderSignalLabel(row[riskIndex] || '', deps) : '';
      const priority = priorityIndex >= 0 ? normalizeOrderPriority(row[priorityIndex], deps) : '';
      const recommendation = recommendationIndex >= 0 ? deps.sanitizeText(row[recommendationIndex]).slice(0, 80).trim() : '';

      if (platform && netSales !== null) addOrderAmount(platformAmounts, platform, netSales, deps);
      if (category && netSales !== null) addOrderAmount(categoryAmounts, category, netSales, deps);

      const subject = deps.sanitizeText(sku || category || platform).slice(0, 60).trim();
      if (!subject) continue;

      const score = scoreOrderRiskHighlight(risk, priority, inventoryIndex, daysOfCover, deps);
      const highlightKey = [deps.normalizeText(subject), deps.normalizeText(platform)].filter(Boolean).join('::');
      if (shouldTreatOrderRiskAsMaterial(risk, priority, inventoryIndex, daysOfCover, deps)) {
        const text = [
          subject,
          platform && subject !== platform ? platform : '',
          risk ? `风险 ${risk}` : '',
          inventoryIndex !== null ? `库存指数 ${inventoryIndex.toFixed(2).replace(/\.00$/, '')}` : '',
          daysOfCover !== null ? `覆盖 ${Math.round(daysOfCover)} 天` : '',
        ]
          .filter(Boolean)
          .join(' / ');
        riskEntries.push({ key: highlightKey, text, score });
      }

      if (priority || recommendation) {
        const text = [
          subject,
          platform && subject !== platform ? platform : '',
          priority ? `优先级 ${priority}` : '',
          recommendation ? `建议 ${recommendation}` : '',
        ]
          .filter(Boolean)
          .join(' / ');
        actionEntries.push({ key: highlightKey, text, score: score + (recommendation ? 1 : 0) });
      }
    }
  }

  return {
    platformAmounts: rankOrderAmounts(platformAmounts, 8),
    categoryAmounts: rankOrderAmounts(categoryAmounts, 8),
    riskHighlights: pickTopOrderHighlights(riskEntries, deps, 4),
    actionHighlights: pickTopOrderHighlights(actionEntries, deps, 4),
  };
}

function collectOrderChannelSignals(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText' | 'containsAny' | 'toStringArray'>) {
  const text = deps.normalizeText([item.title, item.summary, item.excerpt, item.name].join(' '));
  const inferred = [
    deps.containsAny(text, ['tmall', '天猫']) ? 'Tmall' : '',
    deps.containsAny(text, ['jd', '京东']) ? 'JD' : '',
    deps.containsAny(text, ['douyin', '抖音']) ? 'Douyin' : '',
    deps.containsAny(text, ['pinduoduo', '拼多多']) ? 'Pinduoduo' : '',
    deps.containsAny(text, ['amazon']) ? 'Amazon' : '',
    deps.containsAny(text, ['shopify']) ? 'Shopify' : '',
  ].filter(Boolean);

  return [
    ...collectOrderProfileStrings(item, ['platforms', 'platformSignals'], deps).map((value) => formatOrderSignalLabel(value, deps)),
    ...collectOrderCsvValues(item, ['platform', 'platform_focus'], deps, 48, false).map((value) => formatOrderSignalLabel(value, deps)),
    ...inferred,
  ];
}

function collectOrderCategorySignals(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText' | 'toStringArray'>) {
  const ignored = new Set(['订单分析', '库存监控', '经营复盘', '销量预测', '备货建议', 'order', 'inventory', 'report', 'dashboard']);

  return [
    ...deps.toStringArray(item.topicTags),
    ...deps.toStringArray(item.groups),
    ...collectOrderProfileStrings(item, ['categorySignals'], deps),
    ...collectOrderCsvValues(item, ['category'], deps, 48, false),
  ]
    .map((value) => deps.sanitizeText(value).slice(0, 60).trim())
    .filter((value) => value && !ignored.has(value.toLowerCase()));
}

function collectOrderMetricSignals(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText' | 'toStringArray'>) {
  return [
    ...collectOrderProfileStrings(item, ['metricSignals', 'keyMetrics'], deps).map((value) => formatOrderSignalLabel(value, deps)),
    ...collectOrderCsvMetricSignals(item, deps),
  ];
}

function collectOrderReplenishmentSignals(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText' | 'toStringArray'>) {
  return [
    ...collectOrderProfileStrings(item, ['replenishmentSignals', 'forecastSignals', 'operatingSignals'], deps).map((value) => formatOrderSignalLabel(value, deps)),
    ...collectOrderCsvValues(item, ['replenishment_priority', 'recommendation'], deps).map((value) => formatOrderSignalLabel(value, deps)),
  ];
}

function collectOrderAnomalySignals(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText' | 'toStringArray'>) {
  return [
    ...collectOrderProfileStrings(item, ['anomalySignals'], deps).map((value) => formatOrderSignalLabel(value, deps)),
    ...collectOrderCsvValues(item, ['risk_flag', 'risk', 'inventory_risk'], deps).map((value) => formatOrderSignalLabel(value, deps)),
  ];
}

function buildOrderSupportingLines(documents: ParsedDocument[], deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText'>) {
  const csvLines = documents.flatMap((item) => collectOrderCsvSupportingLines(item, deps, 2));
  if (csvLines.length) return csvLines.slice(0, 6);

  return documents
    .slice(0, 5)
    .map((item) => {
      const title = deps.sanitizeText(item.title || item.name || '订单/库存资料');
      const summary = deps.sanitizeText(item.summary || item.excerpt || '').slice(0, 80).trim();
      return summary ? `${title}：${summary}` : title;
    })
    .filter(Boolean);
}

function buildOrderPageStats(documents: ParsedDocument[], deps: OrderOutputDeps): OrderPageStats {
  const derived = buildOrderCsvDerivedFacts(documents, deps);
  return {
    documentCount: documents.length,
    channels: deps.buildRankedLabelCounts(documents.flatMap((item) => collectOrderChannelSignals(item, deps)), 8),
    categories: deps.buildRankedLabelCounts(documents.flatMap((item) => collectOrderCategorySignals(item, deps)), 8),
    metrics: deps.buildRankedLabelCounts(documents.flatMap((item) => collectOrderMetricSignals(item, deps)), 8),
    replenishment: deps.buildRankedLabelCounts(documents.flatMap((item) => collectOrderReplenishmentSignals(item, deps)), 8),
    anomalies: deps.buildRankedLabelCounts(documents.flatMap((item) => collectOrderAnomalySignals(item, deps)), 8),
    supportingLines: buildOrderSupportingLines(documents, deps),
    platformAmounts: derived.platformAmounts,
    categoryAmounts: derived.categoryAmounts,
    riskHighlights: derived.riskHighlights,
    actionHighlights: derived.actionHighlights,
  };
}

export function buildOrderPageOutput(
  view: OrderRequestView,
  documents: ParsedDocument[],
  envelope: ReportTemplateEnvelope | null | undefined,
  deps: OrderOutputDeps,
): KnowledgePageOutput {
  const stats = buildOrderPageStats(documents, deps);
  const summary = buildOrderPageSummary(view, stats, deps);
  const sectionTitles = envelope?.pageSections?.length ? envelope.pageSections : defaultOrderPageSections(view);
  const blueprints = buildOrderSectionBlueprints(view, summary, stats, deps);

  return {
    type: 'page',
    title: buildOrderPageTitle(view, envelope, deps),
    content: summary,
    format: 'html',
    page: {
      summary,
      cards: buildOrderPageCards(view, stats, deps),
      sections: sectionTitles.map((title, index) => {
        const section = blueprints[index] || { body: '', bullets: [] as string[] };
        return {
          title,
          body: section.body || (index === 0 ? summary : ''),
          bullets: section.bullets || [],
        };
      }),
      charts: buildOrderPageCharts(view, stats),
    },
  };
}

export function hydrateOrderPageVisualShell(
  view: OrderRequestView,
  documents: ParsedDocument[],
  envelope: ReportTemplateEnvelope | null | undefined,
  page: KnowledgePageOutput['page'],
  deps: OrderOutputDeps,
) {
  const fallbackPage = buildOrderPageOutput(view, documents, envelope, deps).page;
  const mergeCards = (
    primary: NonNullable<KnowledgePageOutput['page']['cards']>,
    fallback: NonNullable<KnowledgePageOutput['page']['cards']>,
    minCount: number,
  ) => {
    const merged = [...primary];
    const seen = new Set(merged.map((item) => deps.normalizeText(item.label || item.value || item.note || '')));
    for (const item of fallback) {
      if (merged.length >= minCount) break;
      const key = deps.normalizeText(item.label || item.value || item.note || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged.length ? merged : fallback;
  };
  const mergeCharts = (
    primary: NonNullable<KnowledgePageOutput['page']['charts']>,
    fallback: NonNullable<KnowledgePageOutput['page']['charts']>,
    minCount: number,
  ) => {
    const merged = [...primary];
    const seen = new Set(merged.map((item) => deps.normalizeText(item.title || '')));
    for (const item of fallback) {
      if (merged.length >= minCount) break;
      const key = deps.normalizeText(item.title || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged.length ? merged : fallback;
  };

  return {
    summary: deps.looksLikeJsonEchoText(page.summary || '') ? fallbackPage.summary : (page.summary || fallbackPage.summary),
    cards: view === 'stock'
      ? buildStockShellCards(page.cards || [], fallbackPage.cards || [], deps)
      : buildGenericShellCards(mergeCards(page.cards || [], fallbackPage.cards || [], 5), fallbackPage.cards || [], deps),
    sections: page.sections?.length ? mergeOrderPageSections(page.sections, fallbackPage.sections || [], deps) : fallbackPage.sections,
    charts: view === 'stock'
      ? buildStockShellCharts(mergeCharts(page.charts || [], fallbackPage.charts || [], 2), fallbackPage.charts || [], deps)
      : buildGenericShellCharts(mergeCharts(page.charts || [], fallbackPage.charts || [], 3), fallbackPage.charts || [], deps),
  };
}
