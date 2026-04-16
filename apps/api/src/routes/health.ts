import type { FastifyInstance } from 'fastify';
import { getPlatformRuntimeStatus } from '../lib/platform-runtime-capabilities.js';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    const runtime = getPlatformRuntimeStatus();
    return {
      status: 'ok',
      service: 'ai-data-platform-api',
      mode: runtime.readOnly ? 'read-only' : 'full',
      readOnly: runtime.readOnly,
      capabilities: runtime.capabilities,
      timestamp: new Date().toISOString(),
    };
  });
}
