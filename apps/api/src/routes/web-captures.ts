import type { FastifyInstance } from 'fastify';
import type { DatasourceTargetLibrary } from '../lib/datasource-definitions.js';
import { createAndRunWebCaptureTask, listWebCaptureTasks, runDueWebCaptureTasks, type WebCaptureFrequency } from '../lib/web-capture.js';
import { buildWebCaptureCredentialSummary, loadWebCaptureCredential, saveWebCaptureCredential } from '../lib/web-capture-credentials.js';
import { syncWebCaptureTaskToDatasource } from '../lib/datasource-web-bridge.js';
import { buildFailedPreviewItem } from '../lib/ingest-feedback.js';
import { ingestWebCaptureTaskDocument } from '../lib/datasource-web-ingest.js';

function normalizeTargetLibraries(value: unknown): DatasourceTargetLibrary[] {
  if (!Array.isArray(value)) return [];
  const dedup = new Map<string, DatasourceTargetLibrary>();
  for (const item of value) {
    const key = String((item as { key?: string })?.key || '').trim();
    const label = String((item as { label?: string })?.label || '').trim();
    if (!key || !label) continue;
    dedup.set(key, {
      key,
      label,
      mode: (item as { mode?: string })?.mode === 'secondary' ? 'secondary' : 'primary',
    });
  }
  const items = Array.from(dedup.values());
  if (!items.some((item) => item.mode === 'primary') && items[0]) {
    items[0].mode = 'primary';
  }
  return items;
}

export async function registerWebCaptureRoutes(app: FastifyInstance) {
  app.get('/web-captures', async () => {
    const items = await listWebCaptureTasks();
    return {
      mode: 'active',
      total: items.length,
      items,
      meta: {
        success: items.filter((item) => item.lastStatus === 'success').length,
        error: items.filter((item) => item.lastStatus === 'error').length,
        scheduled: items.filter((item) => item.frequency !== 'manual').length,
      },
    };
  });

  app.post('/web-captures', async (request, reply) => {
    const body = (request.body || {}) as {
      url?: string;
      focus?: string;
      frequency?: WebCaptureFrequency;
      note?: string;
      maxItems?: number;
      keepOriginalFiles?: boolean;
      datasourceName?: string;
      targetLibraries?: DatasourceTargetLibrary[];
    };

    const url = String(body.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      return reply.code(400).send({ error: 'valid http(s) url is required' });
    }

    const task = await createAndRunWebCaptureTask({
      url,
      focus: String(body.focus || '').trim(),
      frequency: (['manual', 'daily', 'weekly'].includes(String(body.frequency)) ? body.frequency : 'daily') as WebCaptureFrequency,
      note: String(body.note || '').trim(),
      maxItems: Number(body.maxItems || 5),
      keepOriginalFiles: Boolean(body.keepOriginalFiles),
    });
    const definition = await syncWebCaptureTaskToDatasource(task, {
      name: String(body.datasourceName || '').trim(),
      targetLibraries: normalizeTargetLibraries(body.targetLibraries),
      notes: String(body.note || '').trim(),
    });

    const webIngest = task.lastStatus === 'success'
      ? await ingestWebCaptureTaskDocument({
          task,
          targetLibraries: definition.targetLibraries,
        })
      : null;

    const ingestItems = webIngest?.ingestResult.ingestItems?.length
      ? webIngest.ingestResult.ingestItems
      : [buildFailedPreviewItem({
        id: task.id,
        sourceType: 'url',
        sourceName: task.title || task.url,
        errorMessage: task.lastSummary || '网页抓取失败',
      })];

    return {
      status: task.lastStatus === 'success' && (webIngest?.ingestResult.summary.successCount || 0) > 0 ? 'captured' : 'failed',
      task,
      message: task.lastStatus === 'success' && (webIngest?.ingestResult.summary.successCount || 0) > 0
        ? '网页已抓取、生成总结，并写入文档库。'
        : `网页任务已执行，但本次未成功入库：${task.lastSummary || '网页抓取失败'}`,
      summary: {
        total: ingestItems.length,
        successCount: ingestItems.filter((item) => item.status === 'success').length,
        failedCount: ingestItems.filter((item) => item.status === 'failed').length,
        collectedCount: task.lastCollectedCount || 0,
      },
      ingestItems,
    };
  });

  app.post('/web-captures/login', async (request, reply) => {
    const body = (request.body || {}) as {
      url?: string;
      focus?: string;
      note?: string;
      username?: string;
      password?: string;
      remember?: boolean;
      maxItems?: number;
      keepOriginalFiles?: boolean;
      datasourceName?: string;
      targetLibraries?: DatasourceTargetLibrary[];
    };

    const url = String(body.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      return reply.code(400).send({ error: 'valid http(s) url is required' });
    }

    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const remember = Boolean(body.remember);

    let stored = await loadWebCaptureCredential(url);

    if (!username || !password) {
      if (!stored) {
        return {
          status: 'credential_required',
          message: '该站点需要登录采集，请在安全表单中填写账号和密码。',
          credentialRequest: buildWebCaptureCredentialSummary(url, stored),
        };
      }
    }

    if (username && password) {
      let savedCredential = null as Awaited<ReturnType<typeof saveWebCaptureCredential>> | null;
      if (remember) {
        savedCredential = await saveWebCaptureCredential({ url, username, password });
      }
      stored = {
        id: savedCredential?.id || stored?.id || '',
        origin: new URL(url).origin.toLowerCase(),
        username,
        password,
        maskedUsername: savedCredential?.maskedUsername || `${username.slice(0, 2)}***`,
        updatedAt: savedCredential?.updatedAt || new Date().toISOString(),
        sessionCookies: savedCredential?.sessionCookies || stored?.sessionCookies || {},
        sessionUpdatedAt: savedCredential?.sessionUpdatedAt || stored?.sessionUpdatedAt || '',
      };
    }

    if (!stored?.username || !stored?.password) {
      return reply.code(400).send({ error: 'login credentials are required' });
    }

    const task = await createAndRunWebCaptureTask({
      url,
      focus: String(body.focus || '').trim(),
      note: String(body.note || '').trim(),
      frequency: 'manual',
      maxItems: Number(body.maxItems || 5),
      auth: { username: stored.username, password: stored.password },
      credentialRef: remember || (!username && !password && stored.id) ? stored.id : '',
      credentialLabel: stored.maskedUsername,
      keepOriginalFiles: Boolean(body.keepOriginalFiles),
    });
    const definition = await syncWebCaptureTaskToDatasource(task, {
      name: String(body.datasourceName || '').trim(),
      targetLibraries: normalizeTargetLibraries(body.targetLibraries),
      notes: String(body.note || '').trim(),
    });

    const webIngest = task.lastStatus === 'success'
      ? await ingestWebCaptureTaskDocument({
          task,
          targetLibraries: definition.targetLibraries,
        })
      : null;

    const ingestItems = webIngest?.ingestResult.ingestItems?.length
      ? webIngest.ingestResult.ingestItems
      : [buildFailedPreviewItem({
        id: task.id,
        sourceType: 'url',
        sourceName: task.title || task.url,
        errorMessage: task.lastSummary || '登录采集失败',
      })];

    return {
      status: task.lastStatus === 'success' && (webIngest?.ingestResult.summary.successCount || 0) > 0 ? 'captured' : 'failed',
      task,
      message: task.lastStatus === 'success' && (webIngest?.ingestResult.summary.successCount || 0) > 0
        ? '登录采集已完成，内容已结构化入库。'
        : `登录采集已执行，但本次未成功入库：${task.lastSummary || '登录采集失败'}`,
      summary: {
        total: ingestItems.length,
        successCount: ingestItems.filter((item) => item.status === 'success').length,
        failedCount: ingestItems.filter((item) => item.status === 'failed').length,
        collectedCount: task.lastCollectedCount || 0,
      },
      credentialSummary: {
        origin: stored.origin,
        maskedUsername: stored.maskedUsername,
        remembered: remember || Boolean(task.credentialRef),
      },
      ingestItems,
    };
  });

  app.post('/web-captures/run-due', async () => {
    const result = await runDueWebCaptureTasks();
    await Promise.all(result.items.map(async (item) => {
      const definition = await syncWebCaptureTaskToDatasource(item);
      if (item.lastStatus === 'success') {
        await ingestWebCaptureTaskDocument({
          task: item,
          targetLibraries: definition.targetLibraries,
        });
      }
    }));
    return {
      status: result.executedCount ? 'processed' : 'idle',
      ...result,
    };
  });
}
