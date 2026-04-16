import type { TaskRuntimeMetricsRecord } from './task-runtime-metrics.js';
import type { StabilityWarning } from './operations-overview-types.js';

export function countByStatus(items: Array<Record<string, unknown>>, field: string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = String(item?.[field] || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function toTimestamp(value: unknown) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function toDurationMs(startedAt: unknown, finishedAt: unknown) {
  const started = toTimestamp(startedAt);
  const finished = toTimestamp(finishedAt);
  if (!started || !finished || finished < started) return 0;
  return finished - started;
}

export function averageDurationMs(values: number[]) {
  const normalized = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!normalized.length) return 0;
  return Math.round(normalized.reduce((acc, value) => acc + value, 0) / normalized.length);
}

export function buildWarning(
  key: string,
  level: StabilityWarning['level'],
  area: StabilityWarning['area'],
  title: string,
  detail: string,
): StabilityWarning {
  return {
    key,
    level,
    area,
    title,
    detail,
  };
}

export function findTask(items: TaskRuntimeMetricsRecord[], family: TaskRuntimeMetricsRecord['family']) {
  return items.find((item) => item.family === family) || null;
}
