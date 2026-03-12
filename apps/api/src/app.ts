import Fastify from 'fastify';
import { registerChatRoutes } from './routes/chat.js';
import { registerDatasourceRoutes } from './routes/datasources.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerReportRoutes } from './routes/reports.js';

export function createApp() {
  const app = Fastify({ logger: true });

  app.get('/', async () => ({
    name: 'ai-data-platform-api',
    version: '0.1.0',
    mode: 'read-only',
  }));

  app.register(registerHealthRoutes, { prefix: '/api' });
  app.register(registerChatRoutes, { prefix: '/api' });
  app.register(registerDatasourceRoutes, { prefix: '/api' });
  app.register(registerDocumentRoutes, { prefix: '/api' });
  app.register(registerReportRoutes, { prefix: '/api' });

  return app;
}
