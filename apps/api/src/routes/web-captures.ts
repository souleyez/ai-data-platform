import type { FastifyInstance } from 'fastify';
import { createAndRunWebCaptureTask, listWebCaptureTasks, runDueWebCaptureTasks, type WebCaptureFrequency } from '../lib/web-capture.js';
import { loadDocumentCategoryConfig } from '../lib/document-config.js';
import { loadDocumentLibraries } from '../lib/document-libraries.js';
import { DEFAULT_SCAN_DIR } from '../lib/document-store.js';
import { parseDocument } from '../lib/document-parser.js';
import { buildFailedPreviewItem, buildPreviewItemFromDocument } from '../lib/ingest-feedback.js';

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
    });

    let ingestItems = [] as Array<ReturnType<typeof buildPreviewItemFromDocument> | ReturnType<typeof buildFailedPreviewItem>>;

    if (task.lastStatus === 'success' && task.documentPath) {
      const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
      const libraries = await loadDocumentLibraries();
      const parsed = await parseDocument(task.documentPath, config);
      ingestItems = [buildPreviewItemFromDocument(parsed, 'url', undefined, libraries)];
    } else {
      ingestItems = [buildFailedPreviewItem({
        id: task.id,
        sourceType: 'url',
        sourceName: task.title || task.url,
        errorMessage: task.lastSummary || '网页抓取失败',
      })];
    }

    return {
      status: task.lastStatus === 'success' ? 'captured' : 'failed',
      task,
      message: task.lastStatus === 'success'
        ? '网页已抓取、生成总结，并写入文档库。'
        : `网页任务已创建，但本次抓取失败：${task.lastSummary}`,
      summary: {
        total: ingestItems.length,
        successCount: ingestItems.filter((item) => item.status === 'success').length,
        failedCount: ingestItems.filter((item) => item.status === 'failed').length,
        collectedCount: task.lastCollectedCount || 0,
      },
      ingestItems,
    };
  });

  app.post('/web-captures/run-due', async () => {
    const result = await runDueWebCaptureTasks();
    return {
      status: result.executedCount ? 'processed' : 'idle',
      ...result,
    };
  });
}
