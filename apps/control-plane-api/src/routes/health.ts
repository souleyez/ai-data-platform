import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'ai-data-platform-control-plane-api',
    mode: 'mvp',
    timestamp: new Date().toISOString(),
  }));
}
