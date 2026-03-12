import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'ai-data-platform-api',
      mode: 'local-dev',
      readOnly: true,
      timestamp: new Date().toISOString(),
    };
  });
}
