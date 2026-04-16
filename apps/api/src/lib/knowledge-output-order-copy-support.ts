import type { OrderOutputDeps, OrderPageStats } from './knowledge-output-order.js';

export function formatOrderAmount(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(1).replace(/\.0$/, '')} 亿`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, '')} 万`;
  return Math.round(value).toLocaleString('zh-CN');
}

export function joinOrderAmountLabels(items: Array<{ label: string; value: number }>, limit = 4) {
  return items
    .slice(0, limit)
    .map((item) => `${item.label}(${formatOrderAmount(item.value)})`)
    .join('、');
}

export function mergeOrderHighlightBullets(
  primary: string[],
  secondary: string[],
  deps: Pick<OrderOutputDeps, 'sanitizeText' | 'normalizeText'>,
  limit = 4,
) {
  const seen = new Set<string>();
  const merged: string[] = [];
  [...primary, ...secondary].forEach((item) => {
    const text = deps.sanitizeText(item);
    const key = deps.normalizeText(text);
    if (!text || !key || seen.has(key) || merged.length >= limit) return;
    seen.add(key);
    merged.push(text);
  });
  return merged;
}

export function buildOrderCopyCommonStats(stats: OrderPageStats, deps: Pick<OrderOutputDeps, 'joinRankedLabels'>) {
  return {
    channelText: deps.joinRankedLabels(stats.channels, 4) || '多渠道经营',
    categoryText: deps.joinRankedLabels(stats.categories, 4) || 'SKU结构与品类焦点',
    metricText: deps.joinRankedLabels(stats.metrics, 4) || '库存、动销与趋势信号',
    actionText: deps.joinRankedLabels(stats.replenishment, 4) || '补货与调拨动作',
    anomalyText: deps.joinRankedLabels(stats.anomalies, 4) || '异常与波动',
    channelAmountText: joinOrderAmountLabels(stats.platformAmounts, 4),
    categoryAmountText: joinOrderAmountLabels(stats.categoryAmounts, 4),
    riskHighlights: stats.riskHighlights.slice(0, 4),
    actionHighlights: stats.actionHighlights.slice(0, 4),
  };
}
