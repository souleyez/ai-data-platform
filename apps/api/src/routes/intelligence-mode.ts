import type { FastifyInstance } from 'fastify';
import {
  disableFullIntelligenceMode,
  ensureFullIntelligenceMode,
  getIntelligenceModeStatus,
  setupFullIntelligenceMode,
} from '../lib/intelligence-mode.js';

export async function registerIntelligenceModeRoutes(app: FastifyInstance) {
  app.get('/intelligence-mode', async () => {
    const status = await getIntelligenceModeStatus();
    return {
      status: 'ok',
      ...status,
    };
  });

  app.post('/intelligence-mode/setup-full', async (request, reply) => {
    const body = (request.body || {}) as { code?: string; label?: string };
    try {
      const result = await setupFullIntelligenceMode(body);
      const status = await getIntelligenceModeStatus();
      return {
        status: 'initialized',
        ...status,
        item: result.item,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed_to_initialize_full_mode';
      return reply.code(message === 'full mode already initialized' ? 409 : 400).send({
        error: message,
      });
    }
  });

  app.post('/intelligence-mode/enable-full', async (request, reply) => {
    const body = (request.body || {}) as { code?: string };
    try {
      const result = await ensureFullIntelligenceMode(String(body.code || ''));
      const status = await getIntelligenceModeStatus();
      return {
        status: 'enabled',
        ...status,
        item: result.item,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed_to_enable_full_mode';
      const code = message === 'invalid access key' ? 401 : 400;
      return reply.code(code).send({
        error: message,
      });
    }
  });

  app.post('/intelligence-mode/disable-full', async () => {
    await disableFullIntelligenceMode();
    const status = await getIntelligenceModeStatus();
    return {
      status: 'disabled',
      ...status,
    };
  });
}
