import {
  listDatasourceDefinitions,
  listDatasourceRuns,
  type DatasourceDefinition,
  type DatasourceRun,
} from './datasource-definitions.js';
import { databaseDatasourceProvider } from './datasource-database-provider.js';
import { erpDatasourceProvider } from './datasource-erp-provider.js';
import type { DatasourceProviderSummary } from './datasource-provider.js';
import { uploadDatasourceProvider } from './datasource-upload-provider.js';
import { buildDatasourceSummaryFromWebCaptureTask } from './datasource-web-bridge.js';
import { webDatasourceProvider } from './datasource-web-provider.js';
import { listWebCaptureTasks } from './web-capture.js';

const PROVIDERS = [webDatasourceProvider, uploadDatasourceProvider, databaseDatasourceProvider, erpDatasourceProvider];

function pickProvider(definition: DatasourceDefinition) {
  return PROVIDERS.find((provider) => provider.supports(definition)) || null;
}

export async function listDatasourceProviderSummaries() {
  const [definitions, runs, webTasks] = await Promise.all([
    listDatasourceDefinitions(),
    listDatasourceRuns(),
    listWebCaptureTasks(),
  ]);

  const runsByDatasource = new Map<string, DatasourceRun[]>();
  for (const run of runs) {
    const bucket = runsByDatasource.get(run.datasourceId) || [];
    bucket.push(run);
    runsByDatasource.set(run.datasourceId, bucket);
  }

  const summaries: DatasourceProviderSummary[] = [];
  const definitionUrls = new Set<string>();
  for (const definition of definitions) {
    const provider = pickProvider(definition);
    if (!provider) continue;
    const url = String(definition.config?.url || '').trim();
    if (url) definitionUrls.add(url);
    summaries.push(await provider.summarize(definition, runsByDatasource.get(definition.id) || []));
  }

  const existingIds = new Set(summaries.map((item) => item.id));
  for (const task of webTasks) {
    if (definitionUrls.has(String(task.url || '').trim())) continue;
    const bridged = await buildDatasourceSummaryFromWebCaptureTask(task);
    if (existingIds.has(bridged.id)) continue;
    summaries.push(bridged);
  }

  return summaries.sort((a, b) => {
    const aTime = a.runtime?.lastRunAt || '';
    const bTime = b.runtime?.lastRunAt || '';
    return bTime.localeCompare(aTime);
  });
}

export async function buildDatasourceMeta() {
  const summaries = await listDatasourceProviderSummaries();
  const active = summaries.filter((item) => item.status === 'active').length;
  const paused = summaries.filter((item) => item.status === 'paused').length;
  const errors = summaries.filter((item) => item.status === 'error').length;
  const latestRunAt = summaries
    .map((item) => item.runtime?.lastRunAt || '')
    .filter(Boolean)
    .sort()
    .at(-1) || '';

  return {
    total: summaries.length,
    active,
    paused,
    errors,
    latestRunAt,
  };
}
