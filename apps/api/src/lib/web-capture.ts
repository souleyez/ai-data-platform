import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { getDatasourceCredentialSecret } from './datasource-credentials.js';
import { STORAGE_ROOT } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';
import {
  clearWebCaptureSession,
  isWebCaptureSessionFresh,
  loadWebCaptureCredential,
  saveWebCaptureSession,
} from './web-capture-credentials.js';
import {
  collectRankedEntries,
  resolveTaskCrawlMode,
  summarizeText,
  type WebCaptureCrawlMode as DiscoveryCrawlMode,
} from './web-capture-discovery.js';
import {
  applyCookieHeaderToJar,
  applySerializedSessionCookies,
  fetchWebPage,
  hasCookiesInJar,
  isLikelyLoginPage,
  serializeCookieJar,
  stripHtml,
  submitLoginForm,
  type CookieJar,
  type DownloadResult,
  type PageResult,
  type RuntimeAuth,
} from './web-capture-page-fetch.js';
import {
  shouldKeepOriginalDownload,
  writeCaptureDocument,
  writeDownloadedCapture,
} from './web-capture-output.js';

const WEB_CAPTURE_DIR = path.join(STORAGE_ROOT, 'web-captures');
const TASKS_FILE = path.join(WEB_CAPTURE_DIR, 'tasks.json');
const DEFAULT_MAX_ITEMS = 5;
const MAX_FETCH_ATTEMPTS_FACTOR = 3;

export type WebCaptureFrequency = 'manual' | 'daily' | 'weekly';
export type WebCaptureCrawlMode = DiscoveryCrawlMode;

type CaptureEntry = {
  title: string;
  url: string;
  summary: string;
  score: number;
};

export type WebCaptureTask = {
  id: string;
  url: string;
  focus: string;
  frequency: WebCaptureFrequency;
  keywords?: string[];
  siteHints?: string[];
  seedUrls?: string[];
  crawlMode?: WebCaptureCrawlMode;
  maxItems?: number;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastStatus?: 'success' | 'error';
  lastSummary?: string;
  documentPath?: string;
  markdownPath?: string;
  rawDocumentPath?: string;
  rawDeleteAfterAt?: string;
  keepOriginalFiles?: boolean;
  title?: string;
  note?: string;
  nextRunAt?: string;
  lastCollectedCount?: number;
  lastCollectedItems?: CaptureEntry[];
  loginMode?: 'none' | 'credential';
  credentialRef?: string;
  credentialLabel?: string;
  captureStatus?: 'active' | 'paused';
  pausedAt?: string;
};

type TaskPayload = {
  items: WebCaptureTask[];
};

type RuntimeAccess = {
  auth?: RuntimeAuth;
  headerOverrides?: Record<string, string>;
  storedCredential?: Awaited<ReturnType<typeof loadWebCaptureCredential>>;
  sessionCookieHeader?: string;
};

const SUPPORTED_DOWNLOAD_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.md',
  '.docx',
  '.csv',
  '.html',
  '.htm',
  '.xml',
  '.json',
  '.xlsx',
  '.xls',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
]);

function buildTaskId(url: string) {
  return `web-${createHash('sha1').update(normalizeUrl(url)).digest('hex').slice(0, 16)}`;
}

function normalizeMaxItems(value?: number) {
  const parsed = Number(value || DEFAULT_MAX_ITEMS);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_ITEMS;
  return Math.min(20, Math.max(1, Math.round(parsed)));
}

function normalizeStringList(value: unknown) {
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

function normalizeUrl(value: string) {
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

function resolveSeedUrls(value: unknown, baseUrl: string) {
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

function computeNextRunAt(task: Pick<WebCaptureTask, 'frequency' | 'lastRunAt' | 'createdAt'>) {
  const intervalMs = getFrequencyIntervalMs(task.frequency);
  if (!intervalMs) return '';

  const base = task.lastRunAt || task.createdAt;
  const baseMs = Date.parse(base);
  if (Number.isNaN(baseMs)) return '';
  return new Date(baseMs + intervalMs).toISOString();
}


function isTaskDue(task: WebCaptureTask, now = Date.now()) {
  if (task.captureStatus === 'paused') return false;
  if (task.frequency === 'manual') return false;
  const nextRunAt = computeNextRunAt(task);
  if (!nextRunAt) return true;
  return Date.parse(nextRunAt) <= now;
}

async function ensureDirs() {
  await fs.mkdir(WEB_CAPTURE_DIR, { recursive: true });
}

async function readTasks(): Promise<WebCaptureTask[]> {
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

async function writeTasks(items: WebCaptureTask[]) {
  await ensureDirs();
  await writeRuntimeStateJson({
    filePath: TASKS_FILE,
    payload: { items: dedupeTasks(items) },
  });
}

function dedupeTasks(items: WebCaptureTask[]) {
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


async function cleanupExpiredWebCaptureRawFiles(items: WebCaptureTask[], now = new Date()) {
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

async function resolveRuntimeAccess(task: WebCaptureTask, auth?: RuntimeAuth): Promise<RuntimeAccess> {
  if (auth?.username && auth?.password) {
    return {
      auth,
      headerOverrides: undefined,
      storedCredential: task.credentialRef ? await loadWebCaptureCredential(task.url) : null,
      sessionCookieHeader: '',
    };
  }

  let storedCredential = null;
  let datasourceSecret = null;
  if (task.credentialRef) {
    storedCredential = await loadWebCaptureCredential(task.url);
    datasourceSecret = await getDatasourceCredentialSecret(task.credentialRef);
  }

  const resolvedAuth = storedCredential?.username && storedCredential?.password
    ? { username: storedCredential.username, password: storedCredential.password }
    : datasourceSecret?.username && datasourceSecret?.password
      ? { username: datasourceSecret.username, password: datasourceSecret.password }
      : undefined;

  return {
    auth: resolvedAuth,
    storedCredential,
    sessionCookieHeader: String(datasourceSecret?.cookies || '').trim(),
    headerOverrides: datasourceSecret?.headers && Object.keys(datasourceSecret.headers).length
      ? datasourceSecret.headers
      : undefined,
  };
}

async function runCapture(task: WebCaptureTask, now: string, auth?: RuntimeAuth) {
  try {
    const normalizedTask = {
      ...task,
      maxItems: normalizeMaxItems(task.maxItems),
      keywords: normalizeStringList(task.keywords),
      siteHints: normalizeStringList(task.siteHints),
      seedUrls: resolveSeedUrls(task.seedUrls, task.url),
      crawlMode: resolveTaskCrawlMode(task),
    };
    const runtime = await resolveRuntimeAccess(normalizedTask, auth);
    const runtimeAuth = runtime.auth;
    const jar: CookieJar = new Map();
    if (runtime.sessionCookieHeader) {
      applyCookieHeaderToJar(jar, normalizedTask.url, runtime.sessionCookieHeader);
    }
    if (runtime.storedCredential?.sessionCookies && isWebCaptureSessionFresh(runtime.storedCredential.sessionUpdatedAt)) {
      applySerializedSessionCookies(jar, runtime.storedCredential.sessionCookies);
    }
    let landing = await fetchWebPage(normalizedTask.url, runtimeAuth, jar, runtime.headerOverrides);

    if (landing.kind === 'download') {
      if (normalizedTask.credentialRef && hasCookiesInJar(jar)) {
        await saveWebCaptureSession({
          url: normalizedTask.url,
          sessionCookies: serializeCookieJar(jar),
          updatedAt: now,
        }).catch(() => undefined);
      }
      const storedDownload = await writeDownloadedCapture(normalizedTask, landing);
      const summary = shouldKeepOriginalDownload(normalizedTask, landing.extension)
        ? `本次采集识别为可下载文件，已保留原始 ${landing.extension.replace(/^\./, '').toUpperCase()} 并进入文档解析。`
        : `本次采集识别为可下载文件，已清洗为 Markdown 入库，原始 ${landing.extension.replace(/^\./, '').toUpperCase()} 将按策略自动回收。`;
      return {
        ...normalizedTask,
        title: landing.title || normalizedTask.url,
        documentPath: storedDownload.documentPath,
        markdownPath: storedDownload.markdownPath,
        rawDocumentPath: storedDownload.rawDocumentPath,
        rawDeleteAfterAt: storedDownload.rawDeleteAfterAt,
        lastSummary: summary,
        lastStatus: 'success' as const,
        lastRunAt: now,
        updatedAt: now,
        nextRunAt: computeNextRunAt({ ...normalizedTask, lastRunAt: now }),
        lastCollectedCount: 1,
        lastCollectedItems: [{
          title: landing.title || landing.fileName,
          url: landing.url,
          summary,
          score: 100,
        }],
      };
    }

    if (runtimeAuth && isLikelyLoginPage(landing)) {
      if (runtime.storedCredential?.sessionCookies && isWebCaptureSessionFresh(runtime.storedCredential.sessionUpdatedAt)) {
        await clearWebCaptureSession(normalizedTask.url).catch(() => undefined);
      }
      const loginResult = await submitLoginForm(landing, runtimeAuth, jar, runtime.headerOverrides);
      if (normalizedTask.credentialRef && hasCookiesInJar(jar)) {
        await saveWebCaptureSession({
          url: normalizedTask.url,
          sessionCookies: serializeCookieJar(jar),
          updatedAt: now,
        }).catch(() => undefined);
      }
      if (loginResult.kind === 'download') {
        const storedDownload = await writeDownloadedCapture(normalizedTask, loginResult);
        const summary = shouldKeepOriginalDownload(normalizedTask, loginResult.extension)
          ? `登录后返回可下载文件，已保留原始 ${loginResult.extension.replace(/^\./, '').toUpperCase()} 并进入文档解析。`
          : `登录后返回可下载文件，已清洗为 Markdown 入库，原始 ${loginResult.extension.replace(/^\./, '').toUpperCase()} 将按策略自动回收。`;
        return {
          ...normalizedTask,
          title: loginResult.title || normalizedTask.url,
          documentPath: storedDownload.documentPath,
          markdownPath: storedDownload.markdownPath,
          rawDocumentPath: storedDownload.rawDocumentPath,
          rawDeleteAfterAt: storedDownload.rawDeleteAfterAt,
          lastSummary: summary,
          lastStatus: 'success' as const,
          lastRunAt: now,
          updatedAt: now,
          nextRunAt: computeNextRunAt({ ...normalizedTask, lastRunAt: now }),
          lastCollectedCount: 1,
          lastCollectedItems: [{
            title: loginResult.title || loginResult.fileName,
            url: loginResult.url,
            summary,
            score: 100,
          }],
        };
      }
      landing = isLikelyLoginPage(loginResult)
        ? await fetchWebPage(normalizedTask.url, runtimeAuth, jar, runtime.headerOverrides)
        : loginResult;
      if (landing.kind === 'download') {
        const storedDownload = await writeDownloadedCapture(normalizedTask, landing);
        const summary = shouldKeepOriginalDownload(normalizedTask, landing.extension)
          ? `本次采集识别为可下载文件，已保留原始 ${landing.extension.replace(/^\./, '').toUpperCase()} 并进入文档解析。`
          : `本次采集识别为可下载文件，已清洗为 Markdown 入库，原始 ${landing.extension.replace(/^\./, '').toUpperCase()} 将按策略自动回收。`;
        return {
          ...normalizedTask,
          title: landing.title || normalizedTask.url,
          documentPath: storedDownload.documentPath,
          markdownPath: storedDownload.markdownPath,
          rawDocumentPath: storedDownload.rawDocumentPath,
          rawDeleteAfterAt: storedDownload.rawDeleteAfterAt,
          lastSummary: summary,
          lastStatus: 'success' as const,
          lastRunAt: now,
          updatedAt: now,
          nextRunAt: computeNextRunAt({ ...normalizedTask, lastRunAt: now }),
          lastCollectedCount: 1,
          lastCollectedItems: [{
            title: landing.title || landing.fileName,
            url: landing.url,
            summary,
            score: 100,
          }],
        };
      }
    }

    if (isLikelyLoginPage(landing)) {
      if (runtime.storedCredential?.sessionCookies && isWebCaptureSessionFresh(runtime.storedCredential.sessionUpdatedAt)) {
        await clearWebCaptureSession(normalizedTask.url).catch(() => undefined);
      }
      throw new Error('login required or login form not supported');
    }

    if (normalizedTask.credentialRef && hasCookiesInJar(jar)) {
      await saveWebCaptureSession({
        url: normalizedTask.url,
        sessionCookies: serializeCookieJar(jar),
        updatedAt: now,
      }).catch(() => undefined);
    }

    const title = landing.title || normalizedTask.url;
    const entries = await collectRankedEntries(normalizedTask, landing, runtimeAuth, jar);
    const summary = entries.length
      ? `本次按“优先高评价、不求抓全”的策略筛出 ${entries.length} 篇候选内容，已去重后写入数据集。`
      : normalizedTask.crawlMode === 'listing-detail'
        ? 'Discovery mode did not find listing/detail candidates; kept the landing page overview only. Check seed URLs or use browser/API capture for shell pages.'
        : summarizeText(landing.text, normalizedTask.focus);
    const documentPath = await writeCaptureDocument(
      normalizedTask,
      title,
      summary,
      entries,
      landing.text,
      landing.extractionMethod,
    );

    return {
      ...normalizedTask,
      title,
      documentPath,
      markdownPath: '',
      rawDocumentPath: '',
      rawDeleteAfterAt: '',
      lastSummary: summary,
      lastStatus: 'success' as const,
      lastRunAt: now,
      updatedAt: now,
      nextRunAt: computeNextRunAt({ ...normalizedTask, lastRunAt: now }),
      lastCollectedCount: entries.length,
      lastCollectedItems: entries,
    };
  } catch (error) {
    return {
      ...task,
      maxItems: normalizeMaxItems(task.maxItems),
      markdownPath: '',
      rawDocumentPath: '',
      rawDeleteAfterAt: '',
      lastRunAt: now,
      updatedAt: now,
      lastStatus: 'error' as const,
      lastSummary: error instanceof Error ? error.message : 'capture failed',
      nextRunAt: computeNextRunAt({ ...task, lastRunAt: now }),
      lastCollectedCount: 0,
      lastCollectedItems: [],
    };
  }
}

export async function listWebCaptureTasks() {
  const items = await readTasks();
  return items
    .map((item) => ({
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
    }))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function createAndRunWebCaptureTask(input: {
  url: string;
  focus?: string;
  keywords?: string[];
  siteHints?: string[];
  seedUrls?: string[];
  crawlMode?: WebCaptureCrawlMode;
  frequency?: WebCaptureFrequency;
  note?: string;
  maxItems?: number;
  auth?: RuntimeAuth;
  credentialRef?: string;
  credentialLabel?: string;
  loginMode?: 'none' | 'credential';
  keepOriginalFiles?: boolean;
}) {
  const now = new Date().toISOString();
  const existingItems = await readTasks();
  const normalizedUrl = normalizeUrl(input.url);
  const existing = existingItems.find((item) => normalizeUrl(item.url) === normalizedUrl);
  const task: WebCaptureTask = {
    id: existing?.id || buildTaskId(input.url),
    url: input.url,
    focus: input.focus?.trim() || '正文、关键信息、技术要点',
    frequency: input.frequency || 'daily',
    keywords: normalizeStringList(input.keywords ?? existing?.keywords),
    siteHints: normalizeStringList(input.siteHints ?? existing?.siteHints),
    seedUrls: resolveSeedUrls(input.seedUrls ?? existing?.seedUrls, input.url),
    crawlMode: normalizeCrawlMode(input.crawlMode ?? existing?.crawlMode),
    note: input.note?.trim() || '',
    maxItems: normalizeMaxItems(input.maxItems),
    keepOriginalFiles: Boolean(input.keepOriginalFiles ?? existing?.keepOriginalFiles),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    captureStatus: 'active',
    loginMode: input.loginMode || (input.auth || input.credentialRef ? 'credential' : 'none'),
    credentialRef: input.credentialRef || '',
    credentialLabel: input.credentialLabel || '',
  };
  const executedTask = await runCapture(task, now, input.auth);
  const nextItems = [executedTask, ...existingItems.filter((item) => item.id !== executedTask.id)];
  await writeTasks(nextItems);
  return executedTask;
}

export async function upsertWebCaptureTask(input: {
  id?: string;
  url: string;
  focus?: string;
  keywords?: string[];
  siteHints?: string[];
  seedUrls?: string[];
  crawlMode?: WebCaptureCrawlMode;
  frequency?: WebCaptureFrequency;
  note?: string;
  maxItems?: number;
  credentialRef?: string;
  credentialLabel?: string;
  captureStatus?: 'active' | 'paused';
  loginMode?: 'none' | 'credential';
  keepOriginalFiles?: boolean;
}) {
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

export async function runDueWebCaptureTasks(now = new Date()) {
  const nowIso = now.toISOString();
  const cleanupResult = await cleanupExpiredWebCaptureRawFiles(await readTasks(), now);
  const items = cleanupResult.items;
  const nextItems: WebCaptureTask[] = [];
  const executed: WebCaptureTask[] = [];

  for (const item of items) {
    if (isTaskDue(item, now.getTime())) {
      const updated = await runCapture(item, nowIso);
      nextItems.push(updated);
      executed.push(updated);
    } else {
      nextItems.push({
        ...item,
        captureStatus: item.captureStatus || 'active',
        maxItems: normalizeMaxItems(item.maxItems),
        nextRunAt: item.captureStatus === 'paused' ? '' : (item.nextRunAt || computeNextRunAt(item)),
        lastCollectedCount: item.lastCollectedCount ?? item.lastCollectedItems?.length ?? 0,
        lastCollectedItems: Array.isArray(item.lastCollectedItems) ? item.lastCollectedItems : [],
      });
    }
  }

  await writeTasks(nextItems);

  return {
    total: items.length,
    executedCount: executed.length,
    successCount: executed.filter((item) => item.lastStatus === 'success').length,
    errorCount: executed.filter((item) => item.lastStatus === 'error').length,
    cleanedRawCount: cleanupResult.cleanedCount,
    items: executed,
  };
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
