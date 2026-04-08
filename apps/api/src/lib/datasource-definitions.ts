import {
  readDatasourceDefinitionPayload,
  readDatasourceRunPayload,
  writeDatasourceDefinitionPayload,
  writeDatasourceRunPayload,
} from './datasource-state-repository.js';
import { computeNextRunAt } from './datasource-schedule.js';

export const DATASOURCE_KINDS = [
  'web_public',
  'web_login',
  'web_discovery',
  'database',
  'erp',
  'upload_public',
  'local_directory',
] as const;

export type DatasourceKind = typeof DATASOURCE_KINDS[number];
export type DatasourceStatus = 'draft' | 'active' | 'paused' | 'error';
export const DATASOURCE_SCHEDULE_KINDS = ['manual', 'daily', 'weekly'] as const;
export type DatasourceScheduleKind = typeof DATASOURCE_SCHEDULE_KINDS[number];
export const DATASOURCE_AUTH_MODES = ['none', 'credential', 'manual_session', 'database_password', 'api_token'] as const;
export type DatasourceAuthMode = typeof DATASOURCE_AUTH_MODES[number];
export type DatasourceTargetMode = 'primary' | 'secondary';
export type DatasourceRunStatus = 'running' | 'success' | 'partial' | 'failed';

export type DatasourceRunSummaryItem = {
  id: string;
  label: string;
  summary: string;
};

export type DatasourceTargetLibrary = {
  key: string;
  label: string;
  mode: DatasourceTargetMode;
};

export type DatasourceSchedule = {
  kind: DatasourceScheduleKind;
  timezone?: string;
  maxItemsPerRun?: number;
};

export type DatasourceCredentialRef = {
  id: string;
  kind: DatasourceAuthMode;
  label?: string;
  origin?: string;
  updatedAt?: string;
};

export type DatasourceDefinition = {
  id: string;
  name: string;
  kind: DatasourceKind;
  status: DatasourceStatus;
  targetLibraries: DatasourceTargetLibrary[];
  schedule: DatasourceSchedule;
  authMode: DatasourceAuthMode;
  credentialRef?: DatasourceCredentialRef | null;
  config: Record<string, unknown>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  lastStatus?: DatasourceRunStatus;
  lastSummary?: string;
};

export type DatasourceRun = {
  id: string;
  datasourceId: string;
  startedAt: string;
  finishedAt?: string;
  status: DatasourceRunStatus;
  discoveredCount: number;
  capturedCount: number;
  ingestedCount: number;
  skippedCount?: number;
  unsupportedCount?: number;
  failedCount?: number;
  groupedCount?: number;
  ungroupedCount?: number;
  documentIds: string[];
  libraryKeys: string[];
  resultSummaries?: DatasourceRunSummaryItem[];
  summary?: string;
  errorMessage?: string;
};

function generateUploadToken() {
  return `upl_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function normalizeTargetLibraries(items: DatasourceTargetLibrary[]) {
  const dedup = new Map<string, DatasourceTargetLibrary>();
  for (const item of items || []) {
    const key = String(item?.key || '').trim();
    const label = String(item?.label || '').trim();
    if (!key || !label) continue;
    dedup.set(key, {
      key,
      label,
      mode: item?.mode === 'secondary' ? 'secondary' : 'primary',
    });
  }
  const values = Array.from(dedup.values());
  if (!values.some((item) => item.mode === 'primary') && values[0]) {
    values[0].mode = 'primary';
  }
  return values;
}

function normalizeDefinition(item: Partial<DatasourceDefinition>): DatasourceDefinition {
  const now = new Date().toISOString();
  const kind = item.kind || 'web_public';
  const status = item.status || 'draft';
  const authMode = kind === 'local_directory' ? 'none' : (item.authMode || 'none');
  const targetLibraries = normalizeTargetLibraries(item.targetLibraries || []);

  return {
    id: String(item.id || '').trim(),
    name: String(item.name || '').trim(),
    kind,
    status,
    targetLibraries,
    schedule: {
      kind: item.schedule?.kind || 'manual',
      timezone: item.schedule?.timezone || '',
      maxItemsPerRun: Number(item.schedule?.maxItemsPerRun || 0) || undefined,
    },
    authMode,
    credentialRef: kind === 'local_directory'
      ? null
      : item.credentialRef ? {
      id: String(item.credentialRef.id || '').trim(),
      kind: item.credentialRef.kind || authMode,
      label: String(item.credentialRef.label || '').trim(),
      origin: String(item.credentialRef.origin || '').trim(),
      updatedAt: item.credentialRef.updatedAt || '',
    } : null,
    config: item.config && typeof item.config === 'object'
      ? {
          ...item.config,
          ...(kind === 'upload_public'
            ? {
                uploadToken: String((item.config as Record<string, unknown>)?.uploadToken || '').trim() || generateUploadToken(),
              }
            : {}),
        }
      : (kind === 'upload_public' ? { uploadToken: generateUploadToken() } : {}),
    notes: String(item.notes || '').trim(),
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
    lastRunAt: item.lastRunAt || '',
    nextRunAt: item.nextRunAt || computeNextRunAt(item.schedule?.kind || 'manual', status),
    lastStatus: item.lastStatus || undefined,
    lastSummary: item.lastSummary || '',
  };
}

export async function findDatasourceDefinitionByUploadToken(token: string) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;
  const items = await readDefinitions();
  return items.find((item) => item.kind === 'upload_public' && String(item.config?.uploadToken || '').trim() === normalizedToken) || null;
}

function normalizeRun(item: Partial<DatasourceRun>): DatasourceRun {
  return {
    id: String(item.id || '').trim(),
    datasourceId: String(item.datasourceId || '').trim(),
    startedAt: String(item.startedAt || '').trim(),
    finishedAt: item.finishedAt || '',
    status: item.status || 'running',
    discoveredCount: Number(item.discoveredCount || 0),
    capturedCount: Number(item.capturedCount || 0),
    ingestedCount: Number(item.ingestedCount || 0),
    skippedCount: Number(item.skippedCount || 0),
    unsupportedCount: Number(item.unsupportedCount || 0),
    failedCount: Number(item.failedCount || 0),
    groupedCount: Number(item.groupedCount || 0),
    ungroupedCount: Number(item.ungroupedCount || 0),
    documentIds: Array.isArray(item.documentIds) ? item.documentIds.map((value) => String(value || '').trim()).filter(Boolean) : [],
    libraryKeys: Array.isArray(item.libraryKeys) ? item.libraryKeys.map((value) => String(value || '').trim()).filter(Boolean) : [],
    resultSummaries: Array.isArray(item.resultSummaries)
      ? item.resultSummaries
          .map((entry) => ({
            id: String(entry?.id || '').trim(),
            label: String(entry?.label || '').trim(),
            summary: String(entry?.summary || '').trim(),
          }))
          .filter((entry) => entry.id && entry.label)
      : [],
    summary: item.summary || '',
    errorMessage: item.errorMessage || '',
  };
}

async function readDefinitions(): Promise<DatasourceDefinition[]> {
  const parsed = await readDatasourceDefinitionPayload();
  return Array.isArray(parsed?.items) ? parsed.items.map(normalizeDefinition).filter((item) => item.id && item.name) : [];
}

async function writeDefinitions(items: DatasourceDefinition[]) {
  await writeDatasourceDefinitionPayload(items);
}

async function readRuns(): Promise<DatasourceRun[]> {
  const parsed = await readDatasourceRunPayload();
  return Array.isArray(parsed?.items) ? parsed.items.map(normalizeRun).filter((item) => item.id && item.datasourceId) : [];
}

async function writeRuns(items: DatasourceRun[]) {
  await writeDatasourceRunPayload(items);
}

function sortRunsByLatestTimestamp(items: DatasourceRun[]) {
  return [...items].sort((a, b) =>
    String(b.finishedAt || b.startedAt || '').localeCompare(String(a.finishedAt || a.startedAt || '')),
  );
}

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
