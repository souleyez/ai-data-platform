import type { FastifyInstance } from 'fastify';
import { buildReportStandardsPayload } from '../lib/report-standards.js';

export async function registerReportStandardsRoutes(app: FastifyInstance) {
  app.get('/report-standards', async () => buildReportStandardsPayload());
}
