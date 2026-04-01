import {
  listDatasourceDefinitions,
  listDatasourceRuns,
  type DatasourceRunSummaryItem,
  type DatasourceDefinition,
  type DatasourceRun,
} from './datasource-definitions.js';
import { databaseDatasourceProvider } from './datasource-database-provider.js';
import { erpDatasourceProvider } from './datasource-erp-provider.js';
import type { DatasourceProviderSummary } from './datasource-provider.js';
import { uploadDatasourceProvider } from './datasource-upload-provider.js';
import { localDirectoryDatasourceProvider } from './datasource-local-provider.js';
import { buildDatasourceSummaryFromWebCaptureTask } from './datasource-web-bridge.js';
import { webDatasourceProvider } from './datasource-web-provider.js';
import { listWebCaptureTasks } from './web-capture.js';

const PROVIDERS = [
  webDatasourceProvider,
  uploadDatasourceProvider,
  localDirectoryDatasourceProvider,
  databaseDatasourceProvider,
  erpDatasourceProvider,
];

export type DatasourceDocumentSummary = {
  id: string;
  label: string;
  summary: string;
};

function toDatasourceResultSummaries(
  run: { documentIds?: string[]; resultSummaries?: DatasourceRunSummaryItem[] },
  summaryMap: Map<string, DatasourceDocumentSummary>,
) {
  if (run.resultSummaries?.length) {
    return run.resultSummaries
      .map((item) => ({
        id: item.id,
        label: item.label,
        summary: item.summary,
      }))
      .slice(0, 8);
  }
  return toDatasourceDocumentSummaries(run.documentIds || [], summaryMap);
}

function toDatasourceResultLabels(run: { documentIds?: string[]; resultSummaries?: DatasourceRunSummaryItem[] }) {
  if (run.resultSummaries?.length) {
    return run.resultSummaries.map((item) => item.label).filter(Boolean).slice(0, 8);
  }
  return toDatasourceDocumentLabels(run.documentIds || []);
}

function pickProvider(definition: DatasourceDefinition) {
  return PROVIDERS.find((provider) => provider.supports(definition)) || null;
}

export function toDatasourceDocumentLabels(documentIds: string[]) {
  return (documentIds || []).map((value) => String(value || '').split(/[\\/]/).at(-1) || '').filter(Boolean);
}

export function toDatasourceDocumentSummaries(
  documentIds: string[],
  summaryMap: Map<string, DatasourceDocumentSummary>,
) {
  return (documentIds || [])
    .map((value) => summaryMap.get(String(value || '').trim()))
    .filter((value): value is DatasourceDocumentSummary => Boolean(value))
    .slice(0, 8);
}

export function buildDatasourceLibraryLabelMap(items: Array<{ key: string; label: string }>) {
  return new Map(items.map((item) => [item.key, item.label]));
}

export function buildDatasourceDocumentSummaryMap(
  items: Array<{ path: string; title?: string; name?: string; summary?: string; excerpt?: string }>,
) {
  return new Map(
    items.map((item) => [
      item.path,
      {
        id: item.path,
        label: item.title || item.name || String(item.path || '').split(/[\\/]/).at(-1) || item.path,
        summary: item.summary || item.excerpt || '',
      } satisfies DatasourceDocumentSummary,
    ]),
  );
}

export function buildDatasourceResultSummaryItems(items: DatasourceRunSummaryItem[] = []) {
  return items
    .map((item) => ({
      id: item.id,
      label: item.label,
      summary: item.summary,
    }))
    .filter((item) => item.id && item.label)
    .slice(0, 8);
}

export function enrichDatasourceProviderSummary(
  summary: DatasourceProviderSummary,
  documentSummaryMap: Map<string, DatasourceDocumentSummary>,
) {
  if (!summary.runtime) return summary;
  const runtime = summary.runtime;
  return {
    ...summary,
    runtime: {
      ...runtime,
      libraryKeys: runtime.libraryKeys?.length ? runtime.libraryKeys : summary.targetLibraries.map((item) => item.key),
      libraryLabels: runtime.libraryLabels?.length ? runtime.libraryLabels : summary.targetLibraries.map((item) => item.label),
      documentLabels: runtime.documentLabels?.length ? runtime.documentLabels : toDatasourceResultLabels(runtime),
      documentSummaries: runtime.documentSummaries?.length
        ? runtime.documentSummaries
        : toDatasourceResultSummaries(runtime, documentSummaryMap),
    },
  } satisfies DatasourceProviderSummary;
}

export function buildDatasourceRunReadModels(params: {
  runs: DatasourceRun[];
  definitions: DatasourceDefinition[];
  libraryLabelMap: Map<string, string>;
  documentSummaryMap: Map<string, DatasourceDocumentSummary>;
}) {
  const definitionMap = new Map(params.definitions.map((item) => [item.id, item]));
  return params.runs.map((item) => {
    const definition = definitionMap.get(item.datasourceId);
    return {
      ...item,
      datasourceName: definition?.name || item.datasourceId,
      libraryLabels: (definition?.targetLibraries || []).length
        ? (definition?.targetLibraries || []).map((entry) => entry.label)
        : (item.libraryKeys || []).map((key) => params.libraryLabelMap.get(key) || key),
      documentLabels: toDatasourceResultLabels(item),
      documentSummaries: toDatasourceResultSummaries(item, params.documentSummaryMap),
    };
  });
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
