import type { FastifyInstance } from 'fastify';
import { loadFormatSupportPayload } from '../lib/format-support-matrix.js';

export async function registerCapabilitiesRoutes(app: FastifyInstance) {
  app.get('/capabilities', async () => loadFormatSupportPayload());
}
