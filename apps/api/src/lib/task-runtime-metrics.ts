import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

export type TaskRuntimeFamily = 'deep-parse' | 'memory-sync' | 'dataviz';
export type TaskRuntimeStatus = 'idle' | 'scheduled' | 'running' | 'success' | 'failed' | 'skipped';

export type TaskRuntimeMetricsRecord = {
  family: TaskRuntimeFamily;
  status: TaskRuntimeStatus;
  queuedCount: number;
  processingCount: number;
  retryCount: number;
  skipCount: number;
  lastRequestedAt: string;
  lastStartedAt: string;
  lastFinishedAt: string;
  lastSuccessAt: string;
  lastFailureAt: string;
  lastSkippedAt: string;
  lastDurationMs: number;
  avgDurationMs: number;
  lastErrorMessage: string;
  lastMessage: string;
  recentDurationsMs: number[];
};

type TaskRuntimeMetricsPayload = {
  updatedAt: string;
  items: TaskRuntimeMetricsRecord[];
};

type TaskRuntimeMutation = Partial<Omit<TaskRuntimeMetricsRecord, 'family' | 'recentDurationsMs'>>;

const METRICS_FILE = path.join(STORAGE_CONFIG_DIR, 'task-runtime-metrics.json');
const MAX_RECENT_DURATIONS = 10;
const TASK_FAMILIES: TaskRuntimeFamily[] = ['deep-parse', 'memory-sync', 'dataviz'];

function buildDefaultRecord(family: TaskRuntimeFamily): TaskRuntimeMetricsRecord {
  return {
    family,
    status: 'idle',
    queuedCount: 0,
    processingCount: 0,
    retryCount: 0,
    skipCount: 0,
    lastRequestedAt: '',
    lastStartedAt: '',
    lastFinishedAt: '',
    lastSuccessAt: '',
    lastFailureAt: '',
    lastSkippedAt: '',
    lastDurationMs: 0,
    avgDurationMs: 0,
    lastErrorMessage: '',
    lastMessage: '',
    recentDurationsMs: [],
  };
}

function normalizeCount(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function normalizeDuration(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

function normalizeRecord(input: Partial<TaskRuntimeMetricsRecord> | null | undefined, family: TaskRuntimeFamily) {
  const base = buildDefaultRecord(family);
  const recentDurationsMs = Array.isArray(input?.recentDurationsMs)
    ? input?.recentDurationsMs.map(normalizeDuration).filter((value) => value > 0).slice(-MAX_RECENT_DURATIONS)
    : [];
  const avgDurationMs = recentDurationsMs.length
    ? Math.round(recentDurationsMs.reduce((acc, value) => acc + value, 0) / recentDurationsMs.length)
    : 0;

  return {
    ...base,
    ...input,
    family,
    status: (['idle', 'scheduled', 'running', 'success', 'failed', 'skipped'].includes(String(input?.status || ''))
      ? input?.status
      : base.status) as TaskRuntimeStatus,
    queuedCount: normalizeCount(input?.queuedCount),
    processingCount: normalizeCount(input?.processingCount),
    retryCount: normalizeCount(input?.retryCount),
    skipCount: normalizeCount(input?.skipCount),
    lastDurationMs: normalizeDuration(input?.lastDurationMs),
    avgDurationMs,
    lastRequestedAt: String(input?.lastRequestedAt || '').trim(),
    lastStartedAt: String(input?.lastStartedAt || '').trim(),
    lastFinishedAt: String(input?.lastFinishedAt || '').trim(),
    lastSuccessAt: String(input?.lastSuccessAt || '').trim(),
    lastFailureAt: String(input?.lastFailureAt || '').trim(),
    lastSkippedAt: String(input?.lastSkippedAt || '').trim(),
    lastErrorMessage: String(input?.lastErrorMessage || '').trim(),
    lastMessage: String(input?.lastMessage || '').trim(),
    recentDurationsMs,
  } satisfies TaskRuntimeMetricsRecord;
}

async function ensureMetricsDir() {
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
}

async function readMetricsPayload(): Promise<TaskRuntimeMetricsPayload> {
  const { data } = await readRuntimeStateJson<TaskRuntimeMetricsPayload>({
    filePath: METRICS_FILE,
    fallback: {
      updatedAt: new Date().toISOString(),
      items: TASK_FAMILIES.map((family) => buildDefaultRecord(family)),
    },
    normalize: (raw) => {
      const parsed = (raw || {}) as Partial<TaskRuntimeMetricsPayload>;
      const items = TASK_FAMILIES.map((family) => {
        const existing = Array.isArray(parsed.items)
          ? parsed.items.find((item) => String(item?.family || '') === family)
          : null;
        return normalizeRecord(existing, family);
      });
      return {
        updatedAt: String(parsed.updatedAt || '').trim() || new Date().toISOString(),
        items,
      };
    },
  });
  return data;
}

async function writeMetricsPayload(payload: TaskRuntimeMetricsPayload) {
  await ensureMetricsDir();
  await writeRuntimeStateJson({
    filePath: METRICS_FILE,
    payload,
  });
}

async function mutateTaskRuntimeMetrics(
  family: TaskRuntimeFamily,
  updater: (record: TaskRuntimeMetricsRecord) => TaskRuntimeMetricsRecord,
) {
  const payload = await readMetricsPayload();
  const items = payload.items.map((record) => (
    record.family === family
      ? normalizeRecord(updater(normalizeRecord(record, family)), family)
      : record
  ));
  await writeMetricsPayload({
    updatedAt: new Date().toISOString(),
    items,
  });
  return items.find((item) => item.family === family) || buildDefaultRecord(family);
}

function appendDuration(record: TaskRuntimeMetricsRecord, durationMs: number) {
  const normalizedDuration = normalizeDuration(durationMs);
  if (!normalizedDuration) return record;
  const recentDurationsMs = [...record.recentDurationsMs, normalizedDuration].slice(-MAX_RECENT_DURATIONS);
  const avgDurationMs = Math.round(recentDurationsMs.reduce((acc, value) => acc + value, 0) / recentDurationsMs.length);
  return {
    ...record,
    lastDurationMs: normalizedDuration,
    avgDurationMs,
    recentDurationsMs,
  };
}

export async function readTaskRuntimeMetrics() {
  return readMetricsPayload();
}

export async function markTaskScheduled(
  family: TaskRuntimeFamily,
  mutation?: TaskRuntimeMutation,
) {
  const now = new Date().toISOString();
  return mutateTaskRuntimeMetrics(family, (record) => ({
    ...record,
    ...mutation,
    status: 'scheduled',
    lastRequestedAt: now,
    lastMessage: String(mutation?.lastMessage || record.lastMessage || '').trim(),
  }));
}

export async function markTaskStarted(
  family: TaskRuntimeFamily,
  mutation?: TaskRuntimeMutation,
) {
  const now = new Date().toISOString();
  return mutateTaskRuntimeMetrics(family, (record) => ({
    ...record,
    ...mutation,
    status: 'running',
    lastRequestedAt: record.lastRequestedAt || now,
    lastStartedAt: now,
    lastErrorMessage: '',
    lastMessage: String(mutation?.lastMessage || record.lastMessage || '').trim(),
  }));
}

export async function markTaskSucceeded(
  family: TaskRuntimeFamily,
  mutation?: TaskRuntimeMutation & { durationMs?: number },
) {
  const now = new Date().toISOString();
  return mutateTaskRuntimeMetrics(family, (record) => {
    const { durationMs, ...rest } = mutation || {};
    const next = appendDuration({
      ...record,
      ...rest,
      status: 'success',
      processingCount: normalizeCount(rest.processingCount),
      lastFinishedAt: now,
      lastSuccessAt: now,
      lastErrorMessage: '',
      lastMessage: String(rest.lastMessage || record.lastMessage || '').trim(),
    }, durationMs || 0);
    return next;
  });
}

export async function markTaskFailed(
  family: TaskRuntimeFamily,
  errorMessage: string,
  mutation?: TaskRuntimeMutation & { durationMs?: number; retryDelta?: number },
) {
  const now = new Date().toISOString();
  return mutateTaskRuntimeMetrics(family, (record) => {
    const { durationMs, retryDelta, ...rest } = mutation || {};
    const next = appendDuration({
      ...record,
      ...rest,
      status: 'failed',
      retryCount: record.retryCount + normalizeCount(retryDelta),
      processingCount: normalizeCount(rest.processingCount),
      lastFinishedAt: now,
      lastFailureAt: now,
      lastErrorMessage: String(errorMessage || '').trim().slice(0, 240),
      lastMessage: String(rest.lastMessage || record.lastMessage || '').trim(),
    }, durationMs || 0);
    return next;
  });
}

export async function markTaskSkipped(
  family: TaskRuntimeFamily,
  message: string,
  mutation?: TaskRuntimeMutation,
) {
  const now = new Date().toISOString();
  return mutateTaskRuntimeMetrics(family, (record) => ({
    ...record,
    ...mutation,
    status: 'skipped',
    skipCount: record.skipCount + 1,
    processingCount: normalizeCount(mutation?.processingCount),
    lastSkippedAt: now,
    lastFinishedAt: now,
    lastMessage: String(message || '').trim().slice(0, 240),
  }));
}
