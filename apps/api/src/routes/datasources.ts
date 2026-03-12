import type { FastifyInstance } from 'fastify';
import { sourceItems } from '../lib/mock-data.js';

export async function registerDatasourceRoutes(app: FastifyInstance) {
  app.get('/datasources', async () => {
    return {
      items: sourceItems,
      total: sourceItems.length,
      mode: 'read-only',
    };
  });
}
