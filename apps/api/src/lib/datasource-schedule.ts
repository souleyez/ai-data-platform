import type { DatasourceDefinition, DatasourceScheduleKind, DatasourceStatus } from './datasource-definitions.js';

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

export function computeNextRunAt(kind: DatasourceScheduleKind, status: DatasourceStatus, from = new Date()) {
  if (status !== 'active') return '';
  if (kind === 'manual') return '';
  if (kind === 'daily') return addDays(from, 1).toISOString();
  if (kind === 'weekly') return addDays(from, 7).toISOString();
  return '';
}

export function withComputedNextRunAt(definition: Partial<DatasourceDefinition>) {
  const kind = definition.schedule?.kind || 'manual';
  const status = definition.status || 'draft';
  return {
    ...definition,
    nextRunAt: computeNextRunAt(kind, status),
  };
}
