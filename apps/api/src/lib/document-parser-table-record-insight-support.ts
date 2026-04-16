import type { TableRecordDeps } from './document-parser-table-record-types.js';

export function buildTopValueList(values: string[]) {
  const counts = new Map<string, number>();
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .slice(0, 3)
    .map(([value]) => value);
}

export function buildTopValueCounts(values: string[]) {
  const counts = new Map<string, number>();
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .slice(0, 3)
    .map(([value]) => value);
}

export function roundMetricValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

export function parsePercentText(value: string, deps: TableRecordDeps) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const numeric = deps.parseTableNumericValue(text, 'percent');
  return typeof numeric === 'number' ? numeric : undefined;
}

export function parseCurrencyText(value: string, deps: TableRecordDeps) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const numeric = deps.parseTableNumericValue(text, 'currency');
  return typeof numeric === 'number' ? numeric : undefined;
}
