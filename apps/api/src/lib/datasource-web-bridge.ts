import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import type {
  DatasourceDefinition,
  DatasourceRun,
  DatasourceRunSummaryItem,
  DatasourceTargetLibrary,
} from './datasource-definitions.js';
import { appendDatasourceRun, upsertDatasourceDefinition } from './datasource-definitions.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { listDatasourcePresets } from './datasource-presets.js';
import type { DatasourceProviderSummary } from './datasource-provider.js';
import type { WebCaptureCrawlMode, WebCaptureTask } from './web-capture.js';
import { webDatasourceProvider } from './datasource-web-provider.js';

const FALLBACK_TARGET_LIBRARY: DatasourceTargetLibrary = {
  key: 'ungrouped',
  label: '未分组',
  mode: 'primary',
};

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

function getOrigin(value: string) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return '';
  }
}

function normalizeStringList(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  const dedup = new Set<string>();
  for (const item of values) {
    const normalized = String(item || '').trim();
    if (!normalized) continue;
    dedup.add(normalized);
  }
  return Array.from(dedup);
}

function normalizeCrawlMode(value: unknown): WebCaptureCrawlMode {
  return String(value || '').trim().toLowerCase() === 'listing-detail' ? 'listing-detail' : 'single-page';
}

function inferTaskCrawlMode(task: WebCaptureTask): WebCaptureCrawlMode {
  const explicit = normalizeCrawlMode(task.crawlMode);
  if (explicit === 'listing-detail') return explicit;
  const hintText = normalizeStringList(task.siteHints).join(' ').toLowerCase();
  return /(listing|detail|discover|crawl)/.test(hintText) ? 'listing-detail' : 'single-page';
}

function buildDatasourceId(taskId: string) {
  return `ds-${taskId}`;
}

function buildRunId(task: WebCaptureTask) {
  const seed = `${task.id}:${task.lastRunAt || ''}:${task.lastStatus || ''}:${task.documentPath || ''}`;
  return `run-${createHash('sha1').update(seed).digest('hex').slice(0, 16)}`;
}

function buildWebCaptureResultSummaries(task: WebCaptureTask): DatasourceRunSummaryItem[] {
  const collectedItems = Array.isArray(task.lastCollectedItems) ? task.lastCollectedItems : [];
  if (collectedItems.length) {
    return collectedItems
      .map((item, index) => {
        const label = String(item.title || item.url || '').trim();
        const summary = String(item.summary || '').trim();
        const id = String(item.url || `${task.id}-entry-${index + 1}`).trim();
        if (!label || !id) return null;
        return {
          id,
          label,
          summary,
        } satisfies DatasourceRunSummaryItem;
      })
      .filter((item): item is DatasourceRunSummaryItem => Boolean(item))
      .slice(0, 8);
  }

  const documentPath = String(task.documentPath || '').trim();
  const fallbackLabel =
    String(task.title || '').trim() ||
    (documentPath ? documentPath.split(/[\\/]/).at(-1) || documentPath : '') ||
    String(task.url || '').trim();
  const fallbackSummary = String(task.lastSummary || '').trim();
  if (!fallbackLabel) return [];

  return [
    {
      id: documentPath || String(task.url || task.id || '').trim(),
      label: fallbackLabel,
      summary: fallbackSummary,
    },
  ].filter((item) => item.id && item.label);
}

async function inferTargetLibraries(task: WebCaptureTask) {
  const presets = listDatasourcePresets();
  const libraries = await loadDocumentLibraries();
  const byKey = new Map(libraries.map((item) => [item.key, item]));
  const origin = getOrigin(task.url);
  const matchedPreset = presets.find((preset) => getOrigin(preset.baseUrl) === origin);
  const presetLibraries = (matchedPreset?.suggestedLibraries || [])
    .map((item) => {
      const existing = byKey.get(item.key);
      return existing
        ? {
            key: existing.key,
            label: existing.label,
            mode: item.mode,
          }
        : null;
    })
    .filter(Boolean) as DatasourceTargetLibrary[];

  if (presetLibraries.length) return presetLibraries;
  return [FALLBACK_TARGET_LIBRARY];
}

function inferDatasourceKind(task: WebCaptureTask): DatasourceDefinition['kind'] {
  if (task.loginMode === 'credential' || task.credentialRef) return 'web_login';
  if (inferTaskCrawlMode(task) === 'listing-detail') return 'web_discovery';
  return 'web_public';
}

function inferDatasourceStatus(task: WebCaptureTask): DatasourceDefinition['status'] {
  if (task.captureStatus === 'paused') return 'paused';
  if (task.lastStatus === 'error') return 'error';
  return 'active';
}

export async function buildDatasourceDefinitionFromWebCaptureTask(task: WebCaptureTask): Promise<DatasourceDefinition> {
  const targetLibraries = await inferTargetLibraries(task);
  return {
    id: buildDatasourceId(task.id),
    name: task.title || task.note || task.url,
    kind: inferDatasourceKind(task),
    status: inferDatasourceStatus(task),
    targetLibraries,
    schedule: {
      kind: task.frequency,
      timezone: process.env.TZ || 'Asia/Shanghai',
      maxItemsPerRun: task.maxItems || undefined,
    },
    authMode: task.loginMode === 'credential' || task.credentialRef ? 'credential' : 'none',
    credentialRef: task.credentialRef
      ? {
          id: task.credentialRef,
          kind: 'credential',
          label: task.credentialLabel || '',
          origin: getOrigin(task.url),
          updatedAt: task.updatedAt,
        }
      : null,
    config: {
      url: normalizeUrl(task.url),
      focus: task.focus || '',
      keywords: normalizeStringList(task.keywords),
      siteHints: normalizeStringList(task.siteHints),
      seedUrls: normalizeStringList(task.seedUrls).length ? normalizeStringList(task.seedUrls) : [normalizeUrl(task.url)],
      crawlMode: inferTaskCrawlMode(task),
      note: task.note || '',
      title: task.title || '',
      maxItems: task.maxItems || 5,
      keepOriginalFiles: Boolean(task.keepOriginalFiles),
      documentPath: task.documentPath || '',
      rawDocumentPath: task.rawDocumentPath || '',
      rawDeleteAfterAt: task.rawDeleteAfterAt || '',
      bridgeSource: 'web-capture',
    },
    notes: task.note || '',
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    lastRunAt: task.lastRunAt || '',
    nextRunAt: task.nextRunAt || '',
    lastStatus: task.lastStatus === 'success' ? 'success' : task.lastStatus === 'error' ? 'failed' : undefined,
    lastSummary: task.lastSummary || '',
  };
}

export function buildDatasourceRunFromWebCaptureTask(task: WebCaptureTask, targetLibraries: DatasourceTargetLibrary[] = []): DatasourceRun | null {
  if (!task.lastRunAt || !task.lastStatus) return null;
  const resultSummaries = buildWebCaptureResultSummaries(task);
  const collectedCount =
    task.lastCollectedCount || task.lastCollectedItems?.length || resultSummaries.length || (task.documentPath ? 1 : 0);
  return {
    id: buildRunId(task),
    datasourceId: buildDatasourceId(task.id),
    startedAt: task.lastRunAt,
    finishedAt: task.lastRunAt,
    status: task.lastStatus === 'success' ? 'success' : 'failed',
    discoveredCount: collectedCount,
    capturedCount: collectedCount,
    ingestedCount: task.documentPath ? 1 : 0,
    documentIds: task.documentPath ? [task.documentPath] : [],
    libraryKeys: targetLibraries.map((item) => item.key),
    resultSummaries,
    summary: task.lastSummary || '',
    errorMessage: task.lastStatus === 'error' ? task.lastSummary || 'capture failed' : '',
  };
}

export type WebCaptureDatasourceOverrides = {
  id?: string;
  name?: string;
  targetLibraries?: DatasourceTargetLibrary[];
  notes?: string;
  authMode?: DatasourceDefinition['authMode'];
  credentialRef?: DatasourceDefinition['credentialRef'];
};

export async function syncWebCaptureTaskToDatasource(task: WebCaptureTask, overrides: WebCaptureDatasourceOverrides = {}) {
  const definition = await buildDatasourceDefinitionFromWebCaptureTask(task);
  const nextDefinition: DatasourceDefinition = {
    ...definition,
    id: overrides.id?.trim() || definition.id,
    name: overrides.name?.trim() || definition.name,
    notes: overrides.notes?.trim() || definition.notes,
    targetLibraries: overrides.targetLibraries?.length ? overrides.targetLibraries : definition.targetLibraries,
    authMode: overrides.authMode || definition.authMode,
    credentialRef: overrides.credentialRef !== undefined ? overrides.credentialRef : definition.credentialRef,
  };
  await upsertDatasourceDefinition(nextDefinition);

  const run = buildDatasourceRunFromWebCaptureTask(task);
  if (run) {
    run.libraryKeys = nextDefinition.targetLibraries.map((item) => item.key);
    await appendDatasourceRun(run);
  }

  return nextDefinition;
}

export async function buildDatasourceSummaryFromWebCaptureTask(task: WebCaptureTask): Promise<DatasourceProviderSummary> {
  const definition = await buildDatasourceDefinitionFromWebCaptureTask(task);
  const run = buildDatasourceRunFromWebCaptureTask(task, definition.targetLibraries);
  return webDatasourceProvider.summarize(definition, run ? [run] : []);
}
