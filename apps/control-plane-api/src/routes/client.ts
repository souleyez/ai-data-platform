import type { FastifyInstance } from 'fastify';
import { authenticateClientRequest } from '../lib/control-plane-auth.js';
import {
  getLatestReleaseForChannel,
  getPolicyForPhone,
  handleBootstrapAuth,
  issueModelLease,
} from '../lib/control-plane-service.js';
import type { BootstrapAuthRequest } from '../lib/control-plane-schema.js';

function sendClientError(
  reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  const statusCode = (
    code === 'PHONE_REQUIRED'
    || code === 'DEVICE_FINGERPRINT_REQUIRED'
  ) ? 400 : (
      code === 'SELF_REGISTER_DISABLED'
      || code === 'USER_DISABLED'
    ) ? 403 : 500;

  return reply.code(statusCode).send({
    status: 'error',
    code,
  });
}

export async function registerClientRoutes(app: FastifyInstance) {
  app.post<{ Body: BootstrapAuthRequest }>('/client/bootstrap/auth', async (request, reply) => {
    try {
      return await handleBootstrapAuth(request, request.body);
    } catch (error) {
      return sendClientError(reply, error);
    }
  });

  app.get('/client/releases/latest', async (request, reply) => {
    const auth = await authenticateClientRequest(request);
    if (!auth) {
      return reply.code(401).send({
        status: 'error',
        code: 'UNAUTHORIZED',
      });
    }

    const query = request.query as { channel?: string };
    const channel = query.channel?.trim() || auth.policy.channel;
    const release = await getLatestReleaseForChannel(channel);

    return {
      status: 'ok',
      release,
    };
  });

  app.get('/client/policy', async (request, reply) => {
    const auth = await authenticateClientRequest(request);
    if (!auth) {
      return reply.code(401).send({
        status: 'error',
        code: 'UNAUTHORIZED',
      });
    }

    return {
      status: 'ok',
      policy: await getPolicyForPhone(auth.user.phone),
    };
  });

  app.post<{ Body: { providerScope?: string } }>('/client/model-lease', async (request, reply) => {
    const auth = await authenticateClientRequest(request);
    if (!auth) {
      return reply.code(401).send({
        status: 'error',
        code: 'UNAUTHORIZED',
      });
    }

    const providerScope = request.body?.providerScope?.trim() || auth.policy.providerScopes[0] || 'default';
    const { lease, token } = await issueModelLease(auth.user.id, auth.device.id, providerScope);

    return {
      status: 'ok',
      lease: {
        token,
        expiresAt: lease.expiresAt,
      },
      proxy: {
        baseUrl: process.env.CONTROL_PLANE_MODEL_PROXY_BASE_URL || '',
      },
    };
  });
}
