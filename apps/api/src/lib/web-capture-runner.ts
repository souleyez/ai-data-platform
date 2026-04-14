import { getDatasourceCredentialSecret } from './datasource-credentials.js';
import {
  clearWebCaptureSession,
  isWebCaptureSessionFresh,
  loadWebCaptureCredential,
  saveWebCaptureSession,
} from './web-capture-credentials.js';
import {
  collectRankedEntries,
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
  submitLoginForm,
  type CookieJar,
  type RuntimeAuth,
} from './web-capture-page-fetch.js';
import {
  shouldKeepOriginalDownload,
  writeCaptureDocument,
  writeDownloadedCapture,
} from './web-capture-output.js';
import {
  buildTaskId,
  cleanupExpiredWebCaptureRawFiles,
  computeNextRunAt,
  isTaskDue,
  normalizeMaxItems,
  normalizeStringList,
  normalizeStoredTask,
  normalizeUrl,
  readTasks,
  resolveSeedUrls,
  writeTasks,
} from './web-capture-task-store.js';
import type { WebCaptureTask, WebCaptureTaskCreateInput } from './web-capture-types.js';
import { resolveTaskCrawlMode } from './web-capture-discovery.js';

const MAX_FETCH_ATTEMPTS_FACTOR = 3;

type RuntimeAccess = {
  auth?: RuntimeAuth;
  headerOverrides?: Record<string, string>;
  storedCredential?: Awaited<ReturnType<typeof loadWebCaptureCredential>>;
  sessionCookieHeader?: string;
};

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

export async function runCapture(task: WebCaptureTask, now: string, auth?: RuntimeAuth) {
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

export async function createAndRunWebCaptureTask(input: WebCaptureTaskCreateInput) {
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
  const executedTask = await runCapture(task, now, input.auth);
  const nextItems = [executedTask, ...existingItems.filter((item) => item.id !== executedTask.id)];
  await writeTasks(nextItems);
  return executedTask;
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
      nextItems.push(normalizeStoredTask(item));
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
