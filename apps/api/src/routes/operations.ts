import type { FastifyInstance } from 'fastify';
import { loadOperationsOverviewPayload } from '../lib/operations-overview.js';

export async function registerOperationsRoutes(app: FastifyInstance) {
  app.get('/operations-overview', async () => loadOperationsOverviewPayload());
}
