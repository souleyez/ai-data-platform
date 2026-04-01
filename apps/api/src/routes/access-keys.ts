import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  createAccessKey,
  deleteAccessKey,
  getAccessKeyStatus,
  hasConfiguredAccessKeys,
  listAccessKeys,
  verifyAccessKey,
} from '../lib/access-keys.js';

async function authorizeKeyRequest(request: FastifyRequest) {
  const initialized = await hasConfiguredAccessKeys();
  if (!initialized) {
    return {
      initialized: false,
      authorized: true,
      item: null,
    };
  }

  const accessKey = String(request.headers['x-access-key'] || '').trim();
  if (!accessKey) {
    return {
      initialized: true,
      authorized: false,
      item: null,
    };
  }

  const item = await verifyAccessKey(accessKey);
  return {
    initialized: true,
    authorized: Boolean(item),
    item,
  };
}

export async function registerAccessKeyRoutes(app: FastifyInstance) {
  app.get('/access-keys/status', async () => {
    const status = await getAccessKeyStatus();
    return {
      status: 'ok',
      ...status,
    };
  });

  app.post('/access-keys/verify', async (request, reply) => {
    const status = await getAccessKeyStatus();
    if (!status.initialized) {
      return {
        status: 'setup_required',
        ...status,
      };
    }

    const body = (request.body || {}) as { code?: string };
    const item = await verifyAccessKey(String(body.code || ''));
    if (!item) {
      return reply.code(401).send({
        error: 'invalid_access_key',
        status: 'locked',
        ...status,
      });
    }

    return {
      status: 'verified',
      ...status,
      item,
    };
  });

  app.get('/access-keys', async (request, reply) => {
    const auth = await authorizeKeyRequest(request);
    if (auth.initialized && !auth.authorized) {
      return reply.code(401).send({ error: 'access_key_required' });
    }

    const status = await getAccessKeyStatus();
    return {
      status: 'ok',
      ...status,
      items: await listAccessKeys(),
    };
  });

  app.post('/access-keys', async (request, reply) => {
    const auth = await authorizeKeyRequest(request);
    if (auth.initialized && !auth.authorized) {
      return reply.code(401).send({ error: 'access_key_required' });
    }

    const body = (request.body || {}) as {
      code?: string;
      label?: string;
    };

    try {
      const item = await createAccessKey(body);
      const status = await getAccessKeyStatus();
      return {
        status: auth.initialized ? 'created' : 'initialized',
        ...status,
        item,
      };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'failed_to_create_access_key',
      });
    }
  });

  app.delete('/access-keys/:id', async (request, reply) => {
    const auth = await authorizeKeyRequest(request);
    if (!auth.initialized) {
      return reply.code(404).send({ error: 'access_key_not_found' });
    }
    if (!auth.authorized) {
      return reply.code(401).send({ error: 'access_key_required' });
    }

    const id = String((request.params as { id?: string })?.id || '').trim();

    try {
      const item = await deleteAccessKey(id);
      const status = await getAccessKeyStatus();
      return {
        status: 'deleted',
        ...status,
        item,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'access_key_not_found';
      return reply.code(message === 'access key not found' ? 404 : 400).send({
        error: message,
      });
    }
  });
}
