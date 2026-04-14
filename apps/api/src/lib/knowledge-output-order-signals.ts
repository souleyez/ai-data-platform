import type { ParsedDocument } from './document-parser.js';
import type { OrderOutputDeps } from './knowledge-output-order.js';
import {
  collectOrderCsvMetricSignals,
  collectOrderCsvSupportingLines,
  collectOrderCsvValues,
  collectOrderProfileStrings,
  formatOrderSignalLabel,
} from './knowledge-output-order-csv.js';

export function collectOrderChannelSignals(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText' | 'containsAny' | 'toStringArray'>) {
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

export function collectOrderCategorySignals(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText' | 'toStringArray'>) {
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

export function collectOrderMetricSignals(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText' | 'toStringArray'>) {
  return [
    ...collectOrderProfileStrings(item, ['metricSignals', 'keyMetrics'], deps).map((value) => formatOrderSignalLabel(value, deps)),
    ...collectOrderCsvMetricSignals(item, deps),
  ];
}

export function collectOrderReplenishmentSignals(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText' | 'toStringArray'>) {
  return [
    ...collectOrderProfileStrings(item, ['replenishmentSignals', 'forecastSignals', 'operatingSignals'], deps).map((value) => formatOrderSignalLabel(value, deps)),
    ...collectOrderCsvValues(item, ['replenishment_priority', 'recommendation'], deps).map((value) => formatOrderSignalLabel(value, deps)),
  ];
}

export function collectOrderAnomalySignals(item: ParsedDocument, deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText' | 'toStringArray'>) {
  return [
    ...collectOrderProfileStrings(item, ['anomalySignals'], deps).map((value) => formatOrderSignalLabel(value, deps)),
    ...collectOrderCsvValues(item, ['risk_flag', 'risk', 'inventory_risk'], deps).map((value) => formatOrderSignalLabel(value, deps)),
  ];
}

export function buildOrderSupportingLines(documents: ParsedDocument[], deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText'>) {
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
