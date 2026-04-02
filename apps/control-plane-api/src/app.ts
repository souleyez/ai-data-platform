import Fastify from 'fastify';
import {
  extractAdminToken,
  hasValidAdminToken,
  isAdminAuthEnabled,
} from './lib/control-plane-admin-auth.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerClientRoutes } from './routes/client.js';
import { registerHealthRoutes } from './routes/health.js';

export function createApp(options: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Control-Plane-Admin-Token');

    if (request.method === 'OPTIONS') {
      return reply.code(204).send();
    }

    if (request.url.startsWith('/api/admin') && isAdminAuthEnabled()) {
      if (!extractAdminToken(request)) {
        return reply.code(401).send({
          status: 'error',
          code: 'ADMIN_TOKEN_REQUIRED',
        });
      }

      if (!hasValidAdminToken(request)) {
        return reply.code(403).send({
          status: 'error',
          code: 'ADMIN_TOKEN_INVALID',
        });
      }
    }
  });

  app.get('/', async () => ({
    name: 'ai-data-platform-control-plane-api',
    version: '0.1.0',
    mode: 'mvp',
    adminAuthEnabled: isAdminAuthEnabled(),
  }));

  app.register(registerHealthRoutes, { prefix: '/api' });
  app.register(registerClientRoutes, { prefix: '/api' });
  app.register(registerAdminRoutes, { prefix: '/api' });

  return app;
}
