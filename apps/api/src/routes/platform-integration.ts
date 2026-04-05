import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  PlatformIntegrationError,
  acceptPlatformBroadcast,
  getPlatformIntegrationHealth,
  type PlatformBroadcastRequest,
} from '../lib/platform-integration.js';

export async function registerPlatformIntegrationRoutes(app: FastifyInstance) {
  app.get('/internal/platform/health', async (request, reply) => {
    try {
      return getPlatformIntegrationHealth(readPlatformToken(request.headers['x-home-platform-token']));
    } catch (error) {
      return handlePlatformIntegrationError(reply, error);
    }
  });

  app.post('/internal/platform/broadcasts', async (request, reply) => {
    try {
      return acceptPlatformBroadcast(
        readPlatformToken(request.headers['x-home-platform-token']),
        request.body as PlatformBroadcastRequest,
      );
    } catch (error) {
      return handlePlatformIntegrationError(reply, error);
    }
  });
}

function readPlatformToken(headerValue: string | string[] | undefined) {
  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }
  return headerValue;
}

function handlePlatformIntegrationError(reply: FastifyReply, error: unknown) {
  if (error instanceof PlatformIntegrationError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }

  reply.log.error({ error }, 'platform integration request failed');
  return reply.code(500).send({ error: 'PLATFORM_INTEGRATION_INTERNAL_ERROR' });
}
