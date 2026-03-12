import type { FastifyInstance } from 'fastify';

export async function registerDocumentRoutes(app: FastifyInstance) {
  app.get('/documents', async () => {
    return {
      folders: [
        { id: 'contracts', name: '合同目录', status: 'indexed', files: 168 },
        { id: 'tech-docs', name: '技术文档目录', status: 'indexed', files: 2313 },
      ],
      capabilities: ['scan', 'summarize', 'classify'],
      mode: 'read-only',
    };
  });
}
