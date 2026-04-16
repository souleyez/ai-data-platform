import { computeNextRunAt } from './datasource-schedule.js';
import type { DatasourceDefinition, DatasourceRun } from './datasource-definitions-types.js';
import { normalizeDefinition, normalizeRun, sortRunsByLatestTimestamp } from './datasource-definitions-normalization.js';
import { readDefinitions, readRuns, writeDefinitions, writeRuns } from './datasource-definitions-storage.js';

export async function listDatasourceDefinitions() {
  const items = await readDefinitions();
  return items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getDatasourceDefinition(id: string) {
  const items = await readDefinitions();
  return items.find((item) => item.id === id) || null;
}

export async function upsertDatasourceDefinition(input: Partial<DatasourceDefinition>) {
  const normalized = normalizeDefinition(input);
  if (!normalized.id) throw new Error('datasource id is required');
  if (!normalized.name) throw new Error('datasource name is required');
  if (!normalized.targetLibraries.length) throw new Error('at least one target library is required');

  const items = await readDefinitions();
  const index = items.findIndex((item) => item.id === normalized.id);
  const now = new Date().toISOString();
  const next = {
    ...normalized,
    createdAt: index >= 0 ? items[index].createdAt : normalized.createdAt || now,
    updatedAt: now,
    nextRunAt: normalized.nextRunAt || computeNextRunAt(normalized.schedule.kind, normalized.status),
  };

  if (index >= 0) items[index] = next;
  else items.unshift(next);

  await writeDefinitions(items);
  return next;
}

export async function deleteDatasourceDefinition(id: string) {
  const items = await readDefinitions();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const [removed] = items.splice(index, 1);
  await writeDefinitions(items);
  return removed;
}

export async function listDatasourceRuns(datasourceId?: string) {
  const items = await readRuns();
  const filtered = datasourceId ? items.filter((item) => item.datasourceId === datasourceId) : items;
  return sortRunsByLatestTimestamp(filtered);
}

export async function appendDatasourceRun(input: Partial<DatasourceRun>) {
  const run = normalizeRun(input);
  if (!run.id) throw new Error('run id is required');
  if (!run.datasourceId) throw new Error('datasourceId is required');
  if (!run.startedAt) throw new Error('startedAt is required');

  const items = await readRuns();
  const index = items.findIndex((item) => item.id === run.id);
  if (index >= 0) {
    items[index] = run;
  } else {
    items.unshift(run);
  }
  await writeRuns(items.slice(0, 500));

  const definitions = await readDefinitions();
  const definitionIndex = definitions.findIndex((item) => item.id === run.datasourceId);
  if (definitionIndex >= 0) {
    const definition = definitions[definitionIndex];
    const lastRunAt = run.finishedAt || run.startedAt;
    definitions[definitionIndex] = {
      ...definition,
      lastRunAt,
      lastStatus: run.status,
      lastSummary: run.summary || run.errorMessage || definition.lastSummary || '',
      updatedAt: new Date().toISOString(),
      nextRunAt: computeNextRunAt(definition.schedule.kind, definition.status),
    };
    await writeDefinitions(definitions);
  }

  return run;
}

export async function deleteDatasourceRun(id: string) {
  const runId = String(id || '').trim();
  if (!runId) return null;

  const items = await readRuns();
  const index = items.findIndex((item) => item.id === runId);
  if (index < 0) return null;

  const [removed] = items.splice(index, 1);
  await writeRuns(items);

  const definitions = await readDefinitions();
  const definitionIndex = definitions.findIndex((item) => item.id === removed.datasourceId);
  if (definitionIndex >= 0) {
    const latestRemainingRun = sortRunsByLatestTimestamp(
      items.filter((item) => item.datasourceId === removed.datasourceId),
    )[0] || null;
    const definition = definitions[definitionIndex];
    definitions[definitionIndex] = {
      ...definition,
      lastRunAt: latestRemainingRun ? (latestRemainingRun.finishedAt || latestRemainingRun.startedAt || '') : '',
      lastStatus: latestRemainingRun?.status || undefined,
      lastSummary: latestRemainingRun ? (latestRemainingRun.summary || latestRemainingRun.errorMessage || '') : '',
      updatedAt: new Date().toISOString(),
      nextRunAt: computeNextRunAt(definition.schedule.kind, definition.status),
    };
    await writeDefinitions(definitions);
  }

  return removed;
}
