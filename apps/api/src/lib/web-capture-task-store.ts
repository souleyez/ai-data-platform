import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { resolveTaskCrawlMode, type WebCaptureCrawlMode as DiscoveryCrawlMode } from './web-capture-discovery.js';
import { STORAGE_ROOT } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';
import type {
  WebCaptureCrawlMode,
  WebCaptureFrequency,
  WebCaptureTask,
  WebCaptureTaskUpsertInput,
} from './web-capture-types.js';

const WEB_CAPTURE_DIR = path.join(STORAGE_ROOT, 'web-captures');
const TASKS_FILE = path.join(WEB_CAPTURE_DIR, 'tasks.json');
const DEFAULT_MAX_ITEMS = 5;

type TaskPayload = {
  items: WebCaptureTask[];
};

export function buildTaskId(url: string) {
  return `web-${createHash('sha1').update(normalizeUrl(url)).digest('hex').slice(0, 16)}`;
}

export function normalizeMaxItems(value?: number) {
  const parsed = Number(value || DEFAULT_MAX_ITEMS);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_ITEMS;
  return Math.min(20, Math.max(1, Math.round(parsed)));
}

export function normalizeStringList(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n;]/)
      : [];
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

export function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((key) => {
      url.searchParams.delete(key);
    });
    return url.toString();
  } catch {
    return value;
  }
}

export function resolveSeedUrls(value: unknown, baseUrl: string) {
  const resolved: string[] = [];
  const dedup = new Set<string>();
  for (const rawValue of [baseUrl, ...normalizeStringList(value)]) {
    const raw = String(rawValue || '').trim();
    if (!raw) continue;
    try {
      const normalized = normalizeUrl(new URL(raw, baseUrl).toString());
      if (dedup.has(normalized)) continue;
      dedup.add(normalized);
      resolved.push(normalized);
    } catch {
      continue;
    }
  }
  return resolved;
}

function getFrequencyIntervalMs(frequency: WebCaptureFrequency) {
  if (frequency === 'daily') return 24 * 60 * 60 * 1000;
  if (frequency === 'weekly') return 7 * 24 * 60 * 60 * 1000;
  return 0;
}

export function computeNextRunAt(task: Pick<WebCaptureTask, 'frequency' | 'lastRunAt' | 'createdAt'>) {
  const intervalMs = getFrequencyIntervalMs(task.frequency);
  if (!intervalMs) return '';

  const base = task.lastRunAt || task.createdAt;
  const baseMs = Date.parse(base);
  if (Number.isNaN(baseMs)) return '';
  return new Date(baseMs + intervalMs).toISOString();
}

export function isTaskDue(task: WebCaptureTask, now = Date.now()) {
  if (task.captureStatus === 'paused') return false;
  if (task.frequency === 'manual') return false;
  const nextRunAt = computeNextRunAt(task);
  if (!nextRunAt) return true;
  return Date.parse(nextRunAt) <= now;
}

async function ensureDirs() {
  await fs.mkdir(WEB_CAPTURE_DIR, { recursive: true });
}

export function dedupeTasks(items: WebCaptureTask[]) {
  const byUrl = new Map<string, WebCaptureTask>();
  for (const item of items) {
    const key = normalizeUrl(item.url);
    const current = byUrl.get(key);
    if (!current) {
      byUrl.set(key, item);
      continue;
    }

    const currentTs = Date.parse(current.updatedAt || current.lastRunAt || current.createdAt || '') || 0;
    const nextTs = Date.parse(item.updatedAt || item.lastRunAt || item.createdAt || '') || 0;
    if (nextTs >= currentTs) {
      byUrl.set(key, {
        ...current,
        ...item,
        id: current.id || item.id || buildTaskId(item.url),
        createdAt: current.createdAt || item.createdAt,
      });
    }
  }

  return Array.from(byUrl.values())
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function readTasks(): Promise<WebCaptureTask[]> {
  const { data } = await readRuntimeStateJson<TaskPayload>({
    filePath: TASKS_FILE,
    fallback: { items: [] },
    normalize: (parsed) => ({
      items: Array.isArray((parsed as { items?: unknown[] } | null)?.items)
        ? (parsed as TaskPayload).items
        : [],
    }),
  });
  return dedupeTasks(Array.isArray(data.items) ? data.items : []);
}

export async function writeTasks(items: WebCaptureTask[]) {
  await ensureDirs();
  await writeRuntimeStateJson({
    filePath: TASKS_FILE,
    payload: { items: dedupeTasks(items) },
  });
}

export async function cleanupExpiredWebCaptureRawFiles(items: WebCaptureTask[], now = new Date()) {
  const nowMs = now.getTime();
  let changed = false;
  let cleanedCount = 0;
  const nextItems: WebCaptureTask[] = [];

  for (const item of items) {
    const rawDocumentPath = String(item.rawDocumentPath || '').trim();
    const rawDeleteAfterAt = String(item.rawDeleteAfterAt || '').trim();
    if (
      rawDocumentPath
      && rawDeleteAfterAt
      && Date.parse(rawDeleteAfterAt) <= nowMs
      && !item.keepOriginalFiles
    ) {
      try {
        await fs.rm(rawDocumentPath, { force: true });
      } catch {
        // best effort cleanup
      }
      nextItems.push({
        ...item,
        rawDocumentPath: '',
        rawDeleteAfterAt: '',
      });
      changed = true;
      cleanedCount += 1;
      continue;
    }
    nextItems.push(item);
  }

  if (changed) {
    await writeTasks(nextItems);
  }

  return {
    items: nextItems,
    cleanedCount,
  };
}

export function normalizeStoredTask(item: WebCaptureTask) {
  return {
    ...item,
    captureStatus: item.captureStatus || 'active',
    maxItems: normalizeMaxItems(item.maxItems),
    keywords: normalizeStringList(item.keywords),
    siteHints: normalizeStringList(item.siteHints),
    seedUrls: resolveSeedUrls(item.seedUrls, item.url),
    crawlMode: resolveTaskCrawlMode(item),
    nextRunAt: item.captureStatus === 'paused' ? '' : (item.nextRunAt || computeNextRunAt(item)),
    lastCollectedCount: item.lastCollectedCount ?? item.lastCollectedItems?.length ?? 0,
    lastCollectedItems: Array.isArray(item.lastCollectedItems) ? item.lastCollectedItems : [],
    rawDocumentPath: item.rawDocumentPath || '',
    rawDeleteAfterAt: item.rawDeleteAfterAt || '',
    keepOriginalFiles: Boolean(item.keepOriginalFiles),
  };
}

export async function listWebCaptureTasks() {
  const items = await readTasks();
  return items.map(normalizeStoredTask)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function upsertWebCaptureTask(input: WebCaptureTaskUpsertInput) {
  const now = new Date().toISOString();
  const existingItems = await readTasks();
  const normalizedUrl = normalizeUrl(input.url);
  const existing = existingItems.find((item) => item.id === input.id || normalizeUrl(item.url) === normalizedUrl);
  const task: WebCaptureTask = {
    ...existing,
    id: existing?.id || input.id || buildTaskId(input.url),
    url: input.url,
    focus: input.focus?.trim() || existing?.focus || '正文、关键信息、技术要点',
    frequency: input.frequency || existing?.frequency || 'daily',
    keywords: normalizeStringList(input.keywords ?? existing?.keywords),
    siteHints: normalizeStringList(input.siteHints ?? existing?.siteHints),
    seedUrls: resolveSeedUrls(input.seedUrls ?? existing?.seedUrls, input.url),
    crawlMode: normalizeCrawlMode(input.crawlMode ?? existing?.crawlMode),
    note: input.note?.trim() || existing?.note || '',
    maxItems: normalizeMaxItems(input.maxItems ?? existing?.maxItems),
    keepOriginalFiles: Boolean(input.keepOriginalFiles ?? existing?.keepOriginalFiles),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    captureStatus: input.captureStatus || existing?.captureStatus || 'active',
    loginMode: input.loginMode || existing?.loginMode || (input.credentialRef || existing?.credentialRef ? 'credential' : 'none'),
    credentialRef: input.credentialRef ?? existing?.credentialRef ?? '',
    credentialLabel: input.credentialLabel ?? existing?.credentialLabel ?? '',
    nextRunAt: (input.captureStatus || existing?.captureStatus || 'active') === 'paused'
      ? ''
      : computeNextRunAt({
          frequency: input.frequency || existing?.frequency || 'daily',
          lastRunAt: existing?.lastRunAt,
          createdAt: existing?.createdAt || now,
        }),
  };

  const nextItems = [task, ...existingItems.filter((item) => item.id !== task.id)];
  await writeTasks(nextItems);
  return task;
}

export async function updateWebCaptureTaskStatus(taskId: string, status: 'active' | 'paused') {
  const items = await readTasks();
  const index = items.findIndex((item) => item.id === taskId);
  if (index < 0) throw new Error('capture task not found');

  const now = new Date().toISOString();
  const current = items[index];
  const updated: WebCaptureTask = {
    ...current,
    captureStatus: status,
    updatedAt: now,
    pausedAt: status === 'paused' ? (current.pausedAt || now) : '',
    nextRunAt: status === 'paused' ? '' : computeNextRunAt({ ...current, lastRunAt: current.lastRunAt, createdAt: current.createdAt, frequency: current.frequency }),
  };
  items[index] = updated;
  await writeTasks(items);
  return updated;
}

export async function updateWebCaptureTask(taskId: string, patch: Partial<WebCaptureTask>) {
  const items = await readTasks();
  const index = items.findIndex((item) => item.id === taskId);
  if (index < 0) throw new Error('capture task not found');

  const updated: WebCaptureTask = {
    ...items[index],
    ...patch,
    id: items[index].id,
    updatedAt: new Date().toISOString(),
  };

  items[index] = updated;
  await writeTasks(items);
  return updated;
}

export async function deleteWebCaptureTask(taskId: string) {
  const items = await readTasks();
  const index = items.findIndex((item) => item.id === taskId);
  if (index < 0) throw new Error('capture task not found');
  const [removed] = items.splice(index, 1);
  await writeTasks(items);
  return removed;
}
