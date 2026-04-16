import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { registerCapabilitiesRoutes } from './routes/capabilities.js';
import { registerChannelRoutes } from './routes/channels.js';
import { registerChannelDirectoryRoutes } from './routes/channel-directory.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerBotRoutes } from './routes/bots.js';
import { registerDatasetSecretRoutes } from './routes/dataset-secrets.js';
import { registerDatasourceRoutes } from './routes/datasources.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerModelConfigRoutes } from './routes/model-config.js';
import { registerOperationsRoutes } from './routes/operations.js';
import { registerPlatformIntegrationRoutes } from './routes/platform-integration.js';
import { registerReportStandardsRoutes } from './routes/report-standards.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerWebCaptureRoutes } from './routes/web-captures.js';
import { getPlatformRuntimeStatus } from './lib/platform-runtime-capabilities.js';

export function createApp() {
  const app = Fastify({ logger: true });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    reply.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Home-Platform-Token',
    );

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

  app.get('/', async () => {
    const runtime = getPlatformRuntimeStatus();
    return {
      name: 'ai-data-platform-api',
      version: '0.1.0',
      mode: runtime.readOnly ? 'read-only' : 'full',
      readOnly: runtime.readOnly,
      capabilities: runtime.capabilities,
    };
  });

  app.register(registerBotRoutes, { prefix: '/api' });
  app.register(registerChannelDirectoryRoutes, { prefix: '/api' });
  app.register(registerCapabilitiesRoutes, { prefix: '/api' });
  app.register(registerChannelRoutes, { prefix: '/api' });
  app.register(registerDatasetSecretRoutes, { prefix: '/api' });
  app.register(registerHealthRoutes, { prefix: '/api' });
  app.register(registerAuditRoutes, { prefix: '/api' });
  app.register(registerChatRoutes, { prefix: '/api' });
  app.register(registerModelConfigRoutes, { prefix: '/api' });
  app.register(registerOperationsRoutes, { prefix: '/api' });
  app.register(registerReportStandardsRoutes, { prefix: '/api' });
  app.register(registerDatasourceRoutes, { prefix: '/api' });
  app.register(registerDocumentRoutes, { prefix: '/api' });
  app.register(registerReportRoutes, { prefix: '/api' });
  app.register(registerWebCaptureRoutes, { prefix: '/api' });
  app.register(registerPlatformIntegrationRoutes);

  return app;
}
