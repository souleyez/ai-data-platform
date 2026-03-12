import type { FastifyInstance } from 'fastify';
import { buildDocumentId, DEFAULT_SCAN_DIR, loadParsedDocuments } from '../lib/document-store.js';

export async function registerDocumentRoutes(app: FastifyInstance) {
  app.get('/documents', async () => {
    const { exists, files, items } = await loadParsedDocuments();

    const byExtension = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.ext] = (acc[item.ext] || 0) + 1;
      return acc;
    }, {});

    const byCategory = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});

    const byStatus = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.parseStatus] = (acc[item.parseStatus] || 0) + 1;
      return acc;
    }, {});

    return {
      mode: 'read-only',
      scanRoot: DEFAULT_SCAN_DIR,
      exists,
      totalFiles: files.length,
      byExtension,
      byCategory,
      byStatus,
      items: items.map((item) => ({ ...item, id: buildDocumentId(item.path) })),
      capabilities: ['scan', 'summarize', 'classify'],
      lastScanAt: new Date().toISOString(),
    };
  });

  app.get('/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { items } = await loadParsedDocuments();
    const found = items.find((item) => buildDocumentId(item.path) === id);

    if (!found) {
      return reply.code(404).send({ error: 'document not found' });
    }

    return {
      mode: 'read-only',
      item: {
        ...found,
        id,
      },
    };
  });

  app.post('/documents/scan', async () => {
    const { exists, files } = await loadParsedDocuments();

    return {
      status: exists ? 'completed' : 'missing-directory',
      mode: 'read-only',
      scanRoot: DEFAULT_SCAN_DIR,
      totalFiles: files.length,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      message: exists
        ? '文档扫描任务已完成，并已进行第一版文本提取（txt / md / pdf）。'
        : '扫描目录不存在，请先创建目录或配置 DOCUMENT_SCAN_DIR。',
    };
  });
}
