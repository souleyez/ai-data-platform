import { getDatasourceCredentialSecret } from './datasource-credentials.js';
import {
  loadWebCaptureCredential,
} from './web-capture-credentials.js';
import { computeNextRunAt, normalizeMaxItems, normalizeStringList, resolveSeedUrls } from './web-capture-task-store.js';
import {
  type DownloadResult,
  type RuntimeAuth,
} from './web-capture-page-fetch.js';
import type { WebCaptureTask, WebCaptureTaskCreateInput } from './web-capture-types.js';
import { resolveTaskCrawlMode, type WebCaptureCrawlMode as DiscoveryCrawlMode } from './web-capture-discovery.js';

export type RuntimeAccess = {
  auth?: RuntimeAuth;
  headerOverrides?: Record<string, string>;
  storedCredential?: Awaited<ReturnType<typeof loadWebCaptureCredential>>;
  sessionCookieHeader?: string;
};

export async function resolveRuntimeAccess(task: WebCaptureTask, auth?: RuntimeAuth): Promise<RuntimeAccess> {
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

export function prepareTaskForRun(task: WebCaptureTask): WebCaptureTask {
  return {
    ...task,
    maxItems: normalizeMaxItems(task.maxItems),
    keywords: normalizeStringList(task.keywords),
    siteHints: normalizeStringList(task.siteHints),
    seedUrls: resolveSeedUrls(task.seedUrls, task.url),
    crawlMode: resolveTaskCrawlMode(task),
  };
}

export function buildDownloadCaptureResult(
  task: WebCaptureTask,
  landing: Pick<DownloadResult, 'title' | 'url' | 'fileName' | 'extension'>,
  storedDownload: {
    documentPath: string;
    markdownPath: string;
    rawDocumentPath: string;
    rawDeleteAfterAt: string;
  },
  summary: string,
  now: string,
): WebCaptureTask {
  return {
    ...task,
    title: landing.title || task.url,
    documentPath: storedDownload.documentPath,
    markdownPath: storedDownload.markdownPath,
    rawDocumentPath: storedDownload.rawDocumentPath,
    rawDeleteAfterAt: storedDownload.rawDeleteAfterAt,
    lastSummary: summary,
    lastStatus: 'success',
    lastRunAt: now,
    updatedAt: now,
    nextRunAt: computeNextRunAt({ ...task, lastRunAt: now }),
    lastCollectedCount: 1,
    lastCollectedItems: [{
      title: landing.title || landing.fileName,
      url: landing.url,
      summary,
      score: 100,
    }],
  };
}

export function buildPageCaptureResult(
  task: WebCaptureTask,
  title: string,
  summary: string,
  documentPath: string,
  entries: WebCaptureTask['lastCollectedItems'] = [],
  now: string,
): WebCaptureTask {
  return {
    ...task,
    title,
    documentPath,
    markdownPath: '',
    rawDocumentPath: '',
    rawDeleteAfterAt: '',
    lastSummary: summary,
    lastStatus: 'success',
    lastRunAt: now,
    updatedAt: now,
    nextRunAt: computeNextRunAt({ ...task, lastRunAt: now }),
    lastCollectedCount: entries.length,
    lastCollectedItems: entries,
  };
}

export function buildCaptureErrorResult(task: WebCaptureTask, now: string, error: unknown): WebCaptureTask {
  return {
    ...task,
    maxItems: normalizeMaxItems(task.maxItems),
    markdownPath: '',
    rawDocumentPath: '',
    rawDeleteAfterAt: '',
    lastRunAt: now,
    updatedAt: now,
    lastStatus: 'error',
    lastSummary: error instanceof Error ? error.message : 'capture failed',
    nextRunAt: computeNextRunAt({ ...task, lastRunAt: now }),
    lastCollectedCount: 0,
    lastCollectedItems: [],
  };
}

export function createTaskFromInput(
  input: WebCaptureTaskCreateInput,
  existing: WebCaptureTask | undefined,
  id: string,
  now: string,
): WebCaptureTask {
  return {
    id: existing?.id || id,
    url: input.url,
    focus: input.focus?.trim() || '正文、关键信息、技术要点',
    frequency: input.frequency || 'daily',
    keywords: normalizeStringList(input.keywords ?? existing?.keywords),
    siteHints: normalizeStringList(input.siteHints ?? existing?.siteHints),
    seedUrls: resolveSeedUrls(input.seedUrls ?? existing?.seedUrls, input.url),
    crawlMode: resolveTaskCrawlMode({
      url: input.url,
      crawlMode: input.crawlMode ?? existing?.crawlMode,
      seedUrls: input.seedUrls ?? existing?.seedUrls,
    } as { url: string; crawlMode?: DiscoveryCrawlMode; seedUrls?: string[] }),
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
}
