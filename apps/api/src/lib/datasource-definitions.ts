import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';
import { computeNextRunAt } from './datasource-schedule.js';

export type DatasourceKind = 'web_public' | 'web_login' | 'web_discovery' | 'database' | 'erp' | 'upload_public';
export type DatasourceStatus = 'draft' | 'active' | 'paused' | 'error';
export type DatasourceScheduleKind = 'manual' | 'daily' | 'weekly';
export type DatasourceAuthMode = 'none' | 'credential' | 'manual_session' | 'database_password' | 'api_token';
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
  documentIds: string[];
  libraryKeys: string[];
  resultSummaries?: DatasourceRunSummaryItem[];
  summary?: string;
  errorMessage?: string;
};

type DatasourceDefinitionPayload = {
  items: DatasourceDefinition[];
};

type DatasourceRunPayload = {
  items: DatasourceRun[];
};

const DATASOURCE_CONFIG_DIR = path.join(STORAGE_CONFIG_DIR, 'datasources');
const DEFINITIONS_FILE = path.join(DATASOURCE_CONFIG_DIR, 'definitions.json');
const RUNS_FILE = path.join(DATASOURCE_CONFIG_DIR, 'runs.json');

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
  const authMode = item.authMode || 'none';
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
    credentialRef: item.credentialRef ? {
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

async function ensureDatasourceConfigDir() {
  await fs.mkdir(DATASOURCE_CONFIG_DIR, { recursive: true });
}

async function readDefinitions(): Promise<DatasourceDefinition[]> {
  try {
    const raw = await fs.readFile(DEFINITIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DatasourceDefinitionPayload;
    return Array.isArray(parsed.items) ? parsed.items.map(normalizeDefinition).filter((item) => item.id && item.name) : [];
  } catch {
    return [];
  }
}

async function writeDefinitions(items: DatasourceDefinition[]) {
  await ensureDatasourceConfigDir();
  await fs.writeFile(DEFINITIONS_FILE, JSON.stringify({ items }, null, 2), 'utf8');
}

async function readRuns(): Promise<DatasourceRun[]> {
  try {
    const raw = await fs.readFile(RUNS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DatasourceRunPayload;
    return Array.isArray(parsed.items) ? parsed.items.map(normalizeRun).filter((item) => item.id && item.datasourceId) : [];
  } catch {
    return [];
  }
}

async function writeRuns(items: DatasourceRun[]) {
  await ensureDatasourceConfigDir();
  await fs.writeFile(RUNS_FILE, JSON.stringify({ items }, null, 2), 'utf8');
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
  return filtered.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
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
