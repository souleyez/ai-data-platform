import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { registerChatRoutes } from './routes/chat.js';
import { registerDatasourceRoutes } from './routes/datasources.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerModelConfigRoutes } from './routes/model-config.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerWebCaptureRoutes } from './routes/web-captures.js';

export function createApp() {
  const app = Fastify({ logger: true });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
      return reply.code(204).send();
    }
  });

  app.register(multipart, {
    limits: {
      files: 10,
      fileSize: 30 * 1024 * 1024,
    },
  });

  app.get('/', async () => ({
    name: 'ai-data-platform-api',
    version: '0.1.0',
    mode: 'read-only',
  }));

  app.register(registerHealthRoutes, { prefix: '/api' });
  app.register(registerChatRoutes, { prefix: '/api' });
  app.register(registerModelConfigRoutes, { prefix: '/api' });
  app.register(registerDatasourceRoutes, { prefix: '/api' });
  app.register(registerDocumentRoutes, { prefix: '/api' });
  app.register(registerReportRoutes, { prefix: '/api' });
  app.register(registerWebCaptureRoutes, { prefix: '/api' });

  return app;
}
