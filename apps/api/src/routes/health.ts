import type { FastifyInstance } from 'fastify';
import { getIntelligenceModeStatus } from '../lib/intelligence-mode.js';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    const intelligence = await getIntelligenceModeStatus();
    return {
      status: 'ok',
      service: 'ai-data-platform-api',
      mode: 'local-dev',
      readOnly: true,
      intelligenceMode: intelligence.mode,
      capabilities: intelligence.capabilities,
      timestamp: new Date().toISOString(),
    };
  });
}
