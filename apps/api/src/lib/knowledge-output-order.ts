import type { ParsedDocument } from './document-parser.js';
import { isOrderInventoryDocumentSignal } from './document-domain-signals.js';
import type { ReportTemplateEnvelope } from './report-center.js';

export type OrderRequestView = 'generic' | 'platform' | 'category' | 'stock';

type OrderOutputDeps = {
  normalizeText: (value: string) => string;
  sanitizeText: (value: unknown) => string;
  containsAny: (text: string, keywords: string[]) => boolean;
  toStringArray: (value: unknown) => string[];
  buildRankedLabelCounts: (values: string[], limit?: number) => Array<{ label: string; value: number }>;
  joinRankedLabels: (items: Array<{ label: string; value: number }>, limit?: number) => string;
  looksLikeJsonEchoText: (value: string) => boolean;
};

type OrderPageStats = {
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

type KnowledgePageOutput = {
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

function formatOrderAmount(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(1).replace(/\.0$/, '')} 亿`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, '')} 万`;
  return Math.round(value).toLocaleString('zh-CN');
}

function joinOrderAmountLabels(items: Array<{ label: string; value: number }>, limit = 4) {
  return items
    .slice(0, limit)
    .map((item) => `${item.label}(${formatOrderAmount(item.value)})`)
    .join('、');
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

function defaultOrderPageSections(view: OrderRequestView) {
  if (view === 'platform') return ['经营总览', '渠道结构', '平台角色与增量来源', 'SKU动销焦点', '库存与补货', '异常波动解释', 'AI综合分析'];
  if (view === 'category') return ['经营总览', '品类梯队', 'SKU集中度', '动销与毛利焦点', '库存与补货', '异常波动解释', 'AI综合分析'];
  if (view === 'stock') return ['经营总览', '库存健康', '高风险SKU', '动销与周转', '补货优先级', '异常波动解释', 'AI综合分析'];
  return ['经营总览', '渠道结构', 'SKU与品类焦点', '库存与补货', '异常波动解释', '行动建议', 'AI综合分析'];
}

function hasExpectedOrderTitle(view: OrderRequestView, title: string, deps: Pick<OrderOutputDeps, 'normalizeText' | 'containsAny'>) {
  const normalized = deps.normalizeText(title);
  if (!normalized) return false;
  if (view === 'platform') return deps.containsAny(normalized, ['platform', 'channel', '渠道', '平台']);
  if (view === 'category') return deps.containsAny(normalized, ['category', 'sku', '品类', '类目', '商品']);
  if (view === 'stock') return deps.containsAny(normalized, ['inventory', 'stock', 'replenishment', 'restock', '库存', '补货', '周转']);
  const hasGenericSignal = deps.containsAny(normalized, ['order', 'cockpit', 'dashboard', '经营', '驾驶舱', '多渠道']);
  const hasMultiChannelSignal = deps.containsAny(normalized, ['multi channel', 'multi-channel', 'omni', '多渠道']);
  const hasSpecializedSignal = deps.containsAny(normalized, [
    'inventory', 'stock', 'replenishment', 'restock', '库存', '补货', '周转',
    'category', 'sku', '品类', '类目', '商品',
    'platform', 'channel', '平台', '渠道',
  ]);
  if (!hasGenericSignal) return false;
  if (hasSpecializedSignal && !hasMultiChannelSignal) return false;
  return true;
}

function buildOrderPageTitle(view: OrderRequestView, envelope: ReportTemplateEnvelope | null | undefined, deps: Pick<OrderOutputDeps, 'sanitizeText' | 'normalizeText' | 'containsAny'>) {
  const envelopeTitle = deps.sanitizeText(envelope?.title);
  if (envelopeTitle && hasExpectedOrderTitle(view, envelopeTitle, deps)) return envelopeTitle;
  if (view === 'platform') return '订单渠道经营驾驶舱';
  if (view === 'category') return '订单品类/SKU经营驾驶舱';
  if (view === 'stock') return '库存与补货驾驶舱';
  return '多渠道订单经营驾驶舱';
}

function buildOrderPageSummary(view: OrderRequestView, stats: OrderPageStats, deps: Pick<OrderOutputDeps, 'joinRankedLabels'>) {
  const channelText = deps.joinRankedLabels(stats.channels, 4) || '多渠道经营';
  const categoryText = deps.joinRankedLabels(stats.categories, 4) || 'SKU结构与品类焦点';
  const metricText = deps.joinRankedLabels(stats.metrics, 4) || '库存、动销与趋势信号';
  const actionText = deps.joinRankedLabels(stats.replenishment, 4) || '补货与调拨动作';
  const channelAmountText = joinOrderAmountLabels(stats.platformAmounts, 3);
  const categoryAmountText = joinOrderAmountLabels(stats.categoryAmounts, 3);
  const riskLead = stats.riskHighlights[0] || '';
  const actionLead = stats.actionHighlights[0] || '';

  if (view === 'platform') {
    return `当前命中 ${stats.documentCount} 份订单/库存资料，${channelAmountText ? `渠道净销售额重心落在 ${channelAmountText}` : `渠道信号主要集中在 ${channelText}`}，建议按渠道角色、增量来源和补货动作组织经营驾驶舱，而不是继续做平台平均化复盘。`;
  }
  if (view === 'category') {
    return `当前命中 ${stats.documentCount} 份经营资料，${categoryAmountText ? `品类销售额重心落在 ${categoryAmountText}` : `主题主要落在 ${categoryText}`}，适合按品类梯队、英雄 SKU 集中度、库存压力和动作优先级组织页面。`;
  }
  if (view === 'stock') {
    return `当前命中 ${stats.documentCount} 份库存相关资料，${actionLead ? `最需要前置处理的动作集中在 ${actionLead}` : `风险与动作信号主要集中在 ${actionText}`}，页面应把库存健康、高风险 SKU 和 72 小时补货优先级放在前面。`;
  }
  return `当前命中 ${stats.documentCount} 份订单/库存资料，${channelAmountText ? `渠道净销售额重心落在 ${channelAmountText}` : `渠道重点在 ${channelText}`}，${categoryAmountText ? `品类销售额重心落在 ${categoryAmountText}` : `SKU/品类焦点在 ${categoryText}`}，${riskLead ? `当前最需要前置处理的是 ${riskLead}` : `经营驾驶舱应围绕 ${metricText} 与 ${actionText} 形成一屏可读的动作视图`}。`;
}

function buildOrderPageCards(view: OrderRequestView, stats: OrderPageStats, deps: Pick<OrderOutputDeps, 'joinRankedLabels'>) {
  const channelText = joinOrderAmountLabels(stats.platformAmounts, 2) || deps.joinRankedLabels(stats.channels, 2) || '多渠道';
  const categoryText = joinOrderAmountLabels(stats.categoryAmounts, 2) || deps.joinRankedLabels(stats.categories, 2) || 'SKU焦点';
  const riskText = stats.riskHighlights[0] || deps.joinRankedLabels(stats.anomalies, 2) || deps.joinRankedLabels(stats.replenishment, 2) || '风险信号';
  const metricText = stats.actionHighlights[0] || deps.joinRankedLabels(stats.metrics, 2) || '库存视角';
  const actionText = stats.actionHighlights[0] || deps.joinRankedLabels(stats.replenishment, 2) || '动作优先级';

  if (view === 'stock') {
    return [
      { label: '库存健康指数', value: `${Math.max(stats.metrics.length, 1)} 项`, note: metricText },
      { label: '断货风险SKU', value: `${Math.max(stats.anomalies.length, 1)} 类`, note: riskText },
      { label: '滞销库存池', value: `${Math.max(stats.categories.length, 1)} 组`, note: categoryText },
      { label: '72小时补货动作', value: `${Math.max(stats.replenishment.length, 1)} 条`, note: actionText },
      { label: '跨仓调拨队列', value: `${Math.max(stats.channels.length, 1)} 个渠道/仓别`, note: channelText },
    ];
  }

  if (view === 'category') {
    return [
      { label: '核心品类GMV', value: `${Math.max(stats.categories.length, 1)} 组`, note: categoryText },
      { label: '英雄SKU贡献', value: `${Math.max(stats.categories.length, 1)} 个焦点`, note: categoryText },
      { label: '尾部风险SKU', value: `${Math.max(stats.anomalies.length, 1)} 类`, note: riskText },
      { label: '库存压力', value: `${Math.max(stats.metrics.length, 1)} 项`, note: metricText },
      { label: '动作优先级', value: `${Math.max(stats.replenishment.length, 1)} 条`, note: actionText },
    ];
  }

  return [
    { label: '渠道GMV', value: `${Math.max(stats.channels.length, 1)} 渠道`, note: channelText },
    { label: '动销SKU', value: `${Math.max(stats.categories.length, 1)} 组焦点`, note: categoryText },
    { label: '高风险SKU', value: `${Math.max(stats.anomalies.length, 1)} 类`, note: riskText },
    { label: '库存健康', value: `${Math.max(stats.metrics.length, 1)} 项`, note: metricText },
    { label: '补货优先级', value: `${Math.max(stats.replenishment.length, 1)} 条`, note: actionText },
  ];
}

function buildOrderSectionBlueprints(
  view: OrderRequestView,
  summary: string,
  stats: OrderPageStats,
  deps: Pick<OrderOutputDeps, 'joinRankedLabels' | 'sanitizeText' | 'normalizeText'>,
) {
  const channelText = deps.joinRankedLabels(stats.channels, 4) || '多渠道经营';
  const categoryText = deps.joinRankedLabels(stats.categories, 4) || 'SKU与品类焦点';
  const metricText = deps.joinRankedLabels(stats.metrics, 4) || '库存与动销信号';
  const actionText = deps.joinRankedLabels(stats.replenishment, 4) || '补货与调拨动作';
  const anomalyText = deps.joinRankedLabels(stats.anomalies, 4) || '异常与波动';
  const channelAmountText = joinOrderAmountLabels(stats.platformAmounts, 4);
  const categoryAmountText = joinOrderAmountLabels(stats.categoryAmounts, 4);
  const riskHighlights = stats.riskHighlights.slice(0, 4);
  const actionHighlights = stats.actionHighlights.slice(0, 4);

  if (view === 'platform') {
    return [
      { body: summary, bullets: stats.supportingLines.slice(0, 3) },
      { body: `渠道角色已经开始分化，当前重点主要集中在 ${channelText}。页面应突出渠道贡献结构，而不是简单平铺平台数据。`, bullets: stats.channels.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `增量来源更适合按“渠道角色 + SKU焦点”理解，当前高频主题主要落在 ${categoryText}。`, bullets: stats.categories.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `库存与补货动作需要跟渠道节奏联动，当前动作信号主要集中在 ${actionText}。`, bullets: stats.replenishment.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `当前异常解释主要来自 ${anomalyText}，需要把短期波动和结构性风险拆开看。`, bullets: stats.anomalies.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: 'AI 综合分析应保持保守：先看渠道角色是否清晰，再看 SKU 焦点和补货动作是否同步，不做无证据的硬数字延伸。', bullets: ['优先围绕主渠道与主销 SKU 保证动作时效', '把渠道增量和库存压力拆成两条线分别管理'] },
    ];
  }

  if (view === 'category') {
    return [
      { body: summary, bullets: stats.supportingLines.slice(0, 3) },
      { body: `当前品类与 SKU 焦点主要集中在 ${categoryText}，适合用梯队视角看增长结构。`, bullets: stats.categories.map((item) => `${item.label}：${item.value}`).slice(0, 5) },
      { body: '当前更需要识别英雄 SKU 集中度和尾部 SKU 拖累，而不是继续做平铺排行。', bullets: stats.categories.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `库存与补货要跟品类结构一起看，当前指标信号主要集中在 ${metricText}。`, bullets: stats.metrics.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `异常与波动主要来自 ${anomalyText}，需要把增长型焦点和清理型焦点拆开。`, bullets: stats.anomalies.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: 'AI 综合分析应落到品类动作：增长品类保供给，尾部品类控库存，避免继续做没有层次的 SKU 堆砌。', bullets: ['英雄 SKU 和尾部 SKU 不应使用同一套补货策略', '品类页优先体现结构动作，不要退回排行表视角'] },
    ];
  }

  if (view === 'stock') {
    return [
      { body: summary, bullets: stats.supportingLines.slice(0, 3) },
      { body: `当前库存健康信号主要集中在 ${metricText}，需要把健康度、周转和安全库存放在同一页里看。`, bullets: stats.metrics.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `高风险 SKU 主要集中在 ${anomalyText}，适合形成明确的风险队列。`, bullets: stats.anomalies.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `动销与周转不能只看总库存，当前 SKU 焦点主要落在 ${categoryText}。`, bullets: stats.categories.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `补货优先级应围绕 ${actionText} 做动作编排，越接近头部 SKU，动作时效要求越高。`, bullets: stats.replenishment.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: 'AI 综合分析应把库存页保持在供应链控制室视角，不把它写成泛化销售复盘。', bullets: ['优先保障高动销 SKU 的不断货', '把长尾库存消化和快反补货拆成两条动作线'] },
    ];
  }

  return [
    { body: summary, bullets: stats.supportingLines.slice(0, 3) },
    {
      body: channelAmountText
        ? `渠道销售额重心已经拉开，当前主要集中在 ${channelAmountText}，页面应先呈现成交重心，再解释渠道角色分工。`
        : `渠道结构当前主要集中在 ${channelText}，应先形成角色分工，再看结构变化。`,
      bullets: (stats.platformAmounts.length ? stats.platformAmounts.map((item) => `${item.label}：${formatOrderAmount(item.value)}`) : stats.channels.map((item) => `${item.label}：${item.value}`)).slice(0, 4),
    },
    {
      body: categoryAmountText
        ? `品类销售额已经出现明显分层，当前重点主要落在 ${categoryAmountText}，说明经营资源已经向少数主销焦点集中。`
        : `SKU 与品类焦点主要集中在 ${categoryText}，说明经营重心已经偏向少数主销焦点。`,
      bullets: (stats.categoryAmounts.length ? stats.categoryAmounts.map((item) => `${item.label}：${formatOrderAmount(item.value)}`) : stats.categories.map((item) => `${item.label}：${item.value}`)).slice(0, 4),
    },
    {
      body: actionHighlights[0]
        ? `库存与补货不应只看总库存，当前最需要前置编排的动作集中在 ${actionHighlights[0]}，应同步跟踪库存健康和动作优先级。`
        : `库存与补货信号主要集中在 ${metricText} 与 ${actionText}，应同步看库存健康和动作优先级。`,
      bullets: mergeOrderHighlightBullets(actionHighlights, riskHighlights, deps, 4).length
        ? mergeOrderHighlightBullets(actionHighlights, riskHighlights, deps, 4)
        : stats.replenishment.map((item) => `${item.label}：${item.value}`).slice(0, 4),
    },
    {
      body: riskHighlights[0]
        ? `当前异常波动更像结构性风险而不是单点噪声，最突出的风险集中在 ${riskHighlights[0]}${riskHighlights[1] ? `，以及 ${riskHighlights[1]}` : ''}。`
        : `异常波动主要集中在 ${anomalyText}，需要把活动峰值和结构性压力区分处理。`,
      bullets: riskHighlights.length ? riskHighlights : stats.anomalies.map((item) => `${item.label}：${item.value}`).slice(0, 4),
    },
    {
      body: actionHighlights[0]
        ? `行动建议应优先把 ${actionHighlights[0]} 放进 72 小时动作清单，再根据渠道角色和主销品类分层安排补货、调拨和去库存。`
        : '行动建议应优先围绕“保主销、控尾部、分渠道角色”三件事展开，而不是继续做泛化经营摘要。',
      bullets: actionHighlights.length ? actionHighlights : ['主渠道与主销 SKU 优先保证动作时效', '补货、调拨和去库存动作分层处理'],
    },
    {
      body: 'AI 综合分析以知识库证据为主，用于帮助经营页形成更清晰的决策节奏，不补写无依据的硬指标。',
      bullets: ['页面适合用于经营复盘、动作共识和客户展示'],
    },
  ];
}

function buildOrderPageCharts(view: OrderRequestView, stats: OrderPageStats) {
  if (view === 'stock') {
    return [
      { title: '库存健康指数', items: stats.metrics.slice(0, 6) },
      { title: '断货/超库存风险队列', items: stats.anomalies.slice(0, 6) },
      { title: 'SKU周转压力', items: stats.categories.slice(0, 6) },
      { title: '72小时补货优先级', items: stats.replenishment.slice(0, 6) },
    ].filter((item) => item.items.length);
  }

  if (view === 'category') {
    return [
      { title: '品类梯队结构', items: (stats.categoryAmounts.length ? stats.categoryAmounts : stats.categories).slice(0, 6) },
      { title: 'SKU集中度', items: (stats.categoryAmounts.length ? stats.categoryAmounts : stats.categories).slice(0, 6) },
      { title: '库存与周转压力', items: stats.metrics.slice(0, 6) },
      { title: '动作优先级', items: stats.replenishment.slice(0, 6) },
    ].filter((item) => item.items.length);
  }

  if (view === 'platform') {
    return [
      { title: '渠道贡献结构', items: (stats.platformAmounts.length ? stats.platformAmounts : stats.channels).slice(0, 6) },
      { title: 'SKU动销焦点', items: (stats.categoryAmounts.length ? stats.categoryAmounts : stats.categories).slice(0, 6) },
      { title: '库存/趋势信号', items: stats.metrics.slice(0, 6) },
      { title: '补货动作优先级', items: stats.replenishment.slice(0, 6) },
    ].filter((item) => item.items.length);
  }

  return [
    { title: '渠道贡献结构', items: (stats.platformAmounts.length ? stats.platformAmounts : stats.channels).slice(0, 6) },
    { title: 'SKU与品类焦点', items: (stats.categoryAmounts.length ? stats.categoryAmounts : stats.categories).slice(0, 6) },
    { title: '库存与趋势信号', items: stats.metrics.slice(0, 6) },
    { title: '补货动作优先级', items: stats.replenishment.slice(0, 6) },
  ].filter((item) => item.items.length);
}

function normalizeStockCardShell(cards: NonNullable<KnowledgePageOutput['page']['cards']>) {
  return cards.map((card) => {
    const label = String(card.label || '').trim();
    if (label === '库存健康') return { ...card, label: '库存健康指数' };
    if (label === '高风险SKU') return { ...card, label: '断货风险SKU' };
    if (label === '缺货风险SKU') return { ...card, label: '断货风险SKU' };
    if (label === '滞销库存占比') return { ...card, label: '滞销库存池' };
    if (label === '补货优先级') return { ...card, label: '72小时补货动作' };
    if (label === '建议补货量') return { ...card, label: '72小时补货动作' };
    if (label === '跨仓调拨') return { ...card, label: '跨仓调拨队列' };
    return card;
  });
}

function normalizeStockChartShell(charts: NonNullable<KnowledgePageOutput['page']['charts']>) {
  return charts.map((chart) => {
    const title = String(chart.title || '').trim();
    if (title === '库存健康信号') return { ...chart, title: '库存健康指数' };
    if (title === '高风险SKU队列') return { ...chart, title: '断货/超库存风险队列' };
    if (title === 'SKU周转/库存压力') return { ...chart, title: 'SKU周转压力' };
    return chart;
  });
}

function normalizeGenericCardShell(cards: NonNullable<KnowledgePageOutput['page']['cards']>, deps: Pick<OrderOutputDeps, 'normalizeText'>) {
  return cards.map((card) => {
    const label = deps.normalizeText(card.label || '');
    if (label === deps.normalizeText('库存健康')) return { ...card, label: '库存健康指数' };
    if (label === deps.normalizeText('72小时补货动作')) return { ...card, label: '补货优先级' };
    return card;
  });
}

function normalizeGenericChartShell(charts: NonNullable<KnowledgePageOutput['page']['charts']>, deps: Pick<OrderOutputDeps, 'normalizeText'>) {
  return charts.map((chart) => {
    const title = deps.normalizeText(chart.title || '');
    if (title === deps.normalizeText('SKU与品类焦点')) return { ...chart, title: '品类梯队与英雄SKU' };
    if (title === deps.normalizeText('库存与趋势信号')) return { ...chart, title: '库存健康与补货优先级' };
    return chart;
  });
}

function buildStockShellCards(
  primary: NonNullable<KnowledgePageOutput['page']['cards']>,
  fallback: NonNullable<KnowledgePageOutput['page']['cards']>,
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
) {
  const preferredOrder = ['库存健康指数', '断货风险SKU', '滞销库存池', '72小时补货动作', '跨仓调拨队列'];
  const byLabel = new Map<string, { label?: string; value?: string; note?: string }>();
  for (const card of normalizeStockCardShell(fallback)) {
    const key = deps.normalizeText(card.label || '');
    if (key) byLabel.set(key, card);
  }
  for (const card of normalizeStockCardShell(primary)) {
    const key = deps.normalizeText(card.label || '');
    if (key) byLabel.set(key, card);
  }
  return preferredOrder.map((label) => byLabel.get(deps.normalizeText(label))).filter(Boolean) as NonNullable<KnowledgePageOutput['page']['cards']>;
}

function buildStockShellCharts(
  primary: NonNullable<KnowledgePageOutput['page']['charts']>,
  fallback: NonNullable<KnowledgePageOutput['page']['charts']>,
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
) {
  const preferredOrder = ['库存健康指数', '断货/超库存风险队列'];
  const byTitle = new Map<string, { title?: string; items?: Array<{ label?: string; value?: number }> }>();
  for (const chart of normalizeStockChartShell(fallback)) {
    const key = deps.normalizeText(chart.title || '');
    if (key) byTitle.set(key, chart);
  }
  for (const chart of normalizeStockChartShell(primary)) {
    const key = deps.normalizeText(chart.title || '');
    if (key) byTitle.set(key, chart);
  }
  return preferredOrder.map((title) => byTitle.get(deps.normalizeText(title))).filter(Boolean) as NonNullable<KnowledgePageOutput['page']['charts']>;
}

function buildGenericShellCards(
  primary: NonNullable<KnowledgePageOutput['page']['cards']>,
  fallback: NonNullable<KnowledgePageOutput['page']['cards']>,
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
) {
  const preferredOrder = ['渠道GMV', '动销SKU', '高风险SKU', '补货优先级', '库存健康指数'];
  const byLabel = new Map<string, { label?: string; value?: string; note?: string }>();
  for (const card of normalizeGenericCardShell(fallback, deps)) {
    const key = deps.normalizeText(card.label || '');
    if (key) byLabel.set(key, card);
  }
  for (const card of normalizeGenericCardShell(primary, deps)) {
    const key = deps.normalizeText(card.label || '');
    if (key) byLabel.set(key, card);
  }
  return preferredOrder.map((label) => byLabel.get(deps.normalizeText(label))).filter(Boolean) as NonNullable<KnowledgePageOutput['page']['cards']>;
}

function buildGenericShellCharts(
  primary: NonNullable<KnowledgePageOutput['page']['charts']>,
  fallback: NonNullable<KnowledgePageOutput['page']['charts']>,
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
) {
  const preferredOrder = ['渠道贡献结构', '品类梯队与英雄SKU', '库存健康与补货优先级'];
  const byTitle = new Map<string, { title?: string; items?: Array<{ label?: string; value?: number }> }>();
  for (const chart of normalizeGenericChartShell(fallback, deps)) {
    const key = deps.normalizeText(chart.title || '');
    if (key) byTitle.set(key, chart);
  }
  for (const chart of normalizeGenericChartShell(primary, deps)) {
    const key = deps.normalizeText(chart.title || '');
    if (key) byTitle.set(key, chart);
  }
  return preferredOrder.map((title) => byTitle.get(deps.normalizeText(title))).filter(Boolean) as NonNullable<KnowledgePageOutput['page']['charts']>;
}

function mergeOrderPageSections(
  primary: NonNullable<KnowledgePageOutput['page']['sections']>,
  fallback: NonNullable<KnowledgePageOutput['page']['sections']>,
  deps: Pick<OrderOutputDeps, 'sanitizeText' | 'looksLikeJsonEchoText'>,
) {
  return fallback.map((fallbackSection, index) => {
    const source = primary[index];
    if (!source) return fallbackSection;
    const body = deps.sanitizeText(source.body);
    const useFallbackBody = !body || deps.looksLikeJsonEchoText(body);
    const bullets = (source.bullets || []).filter((item) => deps.sanitizeText(item));
    return {
      title: deps.sanitizeText(source.title) || fallbackSection.title,
      body: useFallbackBody ? fallbackSection.body : source.body,
      bullets: bullets.length ? bullets : fallbackSection.bullets,
    };
  });
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
