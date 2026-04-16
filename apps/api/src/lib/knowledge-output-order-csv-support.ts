import type { ParsedDocument } from './document-parser.js';
import type { OrderOutputDeps } from './knowledge-output-order.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function formatOrderSignalLabel(value: string, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText'>) {
  const text = deps.sanitizeText(value);
  if (!text) return '';
  const normalized = deps.normalizeText(text);
  return ORDER_SIGNAL_LABEL_MAP.get(normalized) || ORDER_CHANNEL_LABEL_MAP.get(normalized) || text;
}

export function collectOrderProfileStrings(
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

export function extractOrderCsvTable(
  item: ParsedDocument,
  deps: Pick<OrderOutputDeps, 'sanitizeText' | 'normalizeText'>,
  limit = 80,
) {
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

export function findOrderHeaderIndex(
  headers: string[],
  aliases: string[],
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
) {
  const aliasSet = new Set(aliases.map((alias) => deps.normalizeText(alias)));
  for (let index = 0; index < headers.length; index += 1) {
    if (aliasSet.has(headers[index])) return index;
  }
  return -1;
}

export function parseOrderNumericValue(value: unknown, deps: Pick<OrderOutputDeps, 'sanitizeText'>) {
  const text = deps.sanitizeText(value).replace(/,/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function collectOrderCsvValues(
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

export function collectOrderCsvMetricSignals(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText'>) {
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

export function collectOrderCsvSupportingLines(
  item: ParsedDocument,
  deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText'>,
  limit = 3,
) {
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

export function addOrderAmount(
  target: Map<string, { label: string; value: number }>,
  label: string,
  value: number,
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
) {
  const normalized = deps.normalizeText(label);
  if (!normalized || !Number.isFinite(value)) return;
  const existing = target.get(normalized);
  if (existing) {
    existing.value += value;
    return;
  }
  target.set(normalized, { label, value });
}

export function rankOrderAmounts(target: Map<string, { label: string; value: number }>, limit = 8) {
  return [...target.values()]
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'zh-CN'))
    .slice(0, limit);
}

function isHealthyOrderRisk(value: string, deps: Pick<OrderOutputDeps, 'normalizeText' | 'containsAny'>) {
  return deps.containsAny(deps.normalizeText(value), ['healthy', 'normal', 'stable', 'ok', '正常', '健康']);
}

export function scoreOrderRiskHighlight(
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

export function shouldTreatOrderRiskAsMaterial(
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

export function pickTopOrderHighlights(
  items: Array<{ key?: string; text: string; score: number }>,
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
  limit = 4,
) {
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

export function normalizeOrderPriority(value: unknown, deps: Pick<OrderOutputDeps, 'sanitizeText'>) {
  const text = deps.sanitizeText(value).slice(0, 16).toUpperCase();
  const match = text.match(/P\d/);
  return match?.[0] || text;
}

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
