import {
  clearWebCaptureSession,
  isWebCaptureSessionFresh,
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
  isTaskDue,
  normalizeStoredTask,
  normalizeUrl,
  readTasks,
  writeTasks,
} from './web-capture-task-store.js';
import type { WebCaptureTask, WebCaptureTaskCreateInput } from './web-capture-types.js';
import {
  buildCaptureErrorResult,
  buildDownloadCaptureResult,
  buildPageCaptureResult,
  createTaskFromInput,
  prepareTaskForRun,
  resolveRuntimeAccess,
} from './web-capture-runner-support.js';

const MAX_FETCH_ATTEMPTS_FACTOR = 3;

export async function runCapture(task: WebCaptureTask, now: string, auth?: RuntimeAuth) {
  try {
    const normalizedTask = prepareTaskForRun(task);
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
      return buildDownloadCaptureResult(normalizedTask, landing, storedDownload, summary, now);
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
        return buildDownloadCaptureResult(normalizedTask, loginResult, storedDownload, summary, now);
      }
      landing = isLikelyLoginPage(loginResult)
        ? await fetchWebPage(normalizedTask.url, runtimeAuth, jar, runtime.headerOverrides)
        : loginResult;
      if (landing.kind === 'download') {
        const storedDownload = await writeDownloadedCapture(normalizedTask, landing);
        const summary = shouldKeepOriginalDownload(normalizedTask, landing.extension)
          ? `本次采集识别为可下载文件，已保留原始 ${landing.extension.replace(/^\./, '').toUpperCase()} 并进入文档解析。`
          : `本次采集识别为可下载文件，已清洗为 Markdown 入库，原始 ${landing.extension.replace(/^\./, '').toUpperCase()} 将按策略自动回收。`;
        return buildDownloadCaptureResult(normalizedTask, landing, storedDownload, summary, now);
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

    return buildPageCaptureResult(normalizedTask, title, summary, documentPath, entries, now);
  } catch (error) {
    return buildCaptureErrorResult(task, now, error);
  }
}

export async function createAndRunWebCaptureTask(input: WebCaptureTaskCreateInput) {
  const now = new Date().toISOString();
  const existingItems = await readTasks();
  const normalizedUrl = normalizeUrl(input.url);
  const existing = existingItems.find((item) => normalizeUrl(item.url) === normalizedUrl);
  const task: WebCaptureTask = createTaskFromInput(input, existing, buildTaskId(input.url), now);
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
