import type { FastifyInstance } from 'fastify';
import { sourceItems } from '../lib/mock-data.js';

export async function registerDatasourceRoutes(app: FastifyInstance) {
  app.get('/datasources', async () => {
    return {
      mode: 'read-only',
      total: sourceItems.length,
      items: sourceItems,
      meta: {
        connected: sourceItems.filter((item) => item.status === 'connected').length,
        warning: sourceItems.filter((item) => item.status === 'warning').length,
        idle: sourceItems.filter((item) => item.status === 'idle').length,
      },
    };
  });
}
