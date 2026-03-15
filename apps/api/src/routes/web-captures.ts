import type { FastifyInstance } from 'fastify';
import { createAndRunWebCaptureTask, listWebCaptureTasks, type WebCaptureFrequency } from '../lib/web-capture.js';

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
    });

    return {
      status: task.lastStatus === 'success' ? 'captured' : 'failed',
      task,
      message: task.lastStatus === 'success'
        ? '网页已抓取、生成总结，并写入文档库。'
        : `网页任务已创建，但本次抓取失败：${task.lastSummary}`,
    };
  });
}
