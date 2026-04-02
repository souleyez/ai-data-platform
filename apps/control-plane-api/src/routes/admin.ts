import type { FastifyInstance } from 'fastify';
import {
  createAdminModelProviderKey,
  createAdminRelease,
  createAdminUser,
  listAdminDevices,
  listAdminModelLeases,
  listAdminModelProviderKeys,
  listAdminPolicies,
  listAdminReleases,
  listAdminSessions,
  listAdminUsers,
  publishAdminRelease,
  updateAdminModelProviderKey,
  updateAdminPolicy,
  updateAdminRelease,
  updateAdminUser,
} from '../lib/control-plane-admin-service.js';

function sendAdminError(
  reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  const statusCode = (
    code.endsWith('_REQUIRED')
    || code.endsWith('_INVALID')
    || code === 'RELEASE_ALREADY_EXISTS'
  ) ? 400 : (
      code.endsWith('_NOT_FOUND')
    ) ? 404 : 500;

  return reply.code(statusCode).send({
    status: 'error',
    code,
  });
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get('/admin/users', async () => ({
    status: 'ok',
    items: await listAdminUsers(),
  }));

  app.get('/admin/devices', async () => ({
    status: 'ok',
    items: await listAdminDevices(),
  }));

  app.get('/admin/sessions', async () => ({
    status: 'ok',
    items: await listAdminSessions(),
  }));

  app.get('/admin/model-leases', async () => ({
    status: 'ok',
    items: await listAdminModelLeases(),
  }));

  app.get('/admin/policies', async () => ({
    status: 'ok',
    items: await listAdminPolicies(),
  }));

  app.post<{ Body: { phone: string; note?: string; status?: 'active' | 'disabled' } }>(
    '/admin/users',
    async (request, reply) => {
      try {
        return {
          status: 'ok',
          item: await createAdminUser(request.body),
        };
      } catch (error) {
        return sendAdminError(reply, error);
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: { status?: 'active' | 'disabled'; note?: string } }>(
    '/admin/users/:id',
    async (request, reply) => {
      try {
        return {
          status: 'ok',
          item: await updateAdminUser(request.params.id, request.body),
        };
      } catch (error) {
        return sendAdminError(reply, error);
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: {
      channel?: string;
      minSupportedVersion?: string;
      targetVersion?: string;
      forceUpgrade?: boolean;
      allowSelfRegister?: boolean;
      modelAccessMode?: 'lease' | 'direct-config';
      providerScopes?: string[];
    };
  }>('/admin/policies/:id', async (request, reply) => {
    try {
      return {
        status: 'ok',
        item: await updateAdminPolicy(request.params.id, request.body),
      };
    } catch (error) {
      return sendAdminError(reply, error);
    }
  });

  app.get('/admin/releases', async () => ({
    status: 'ok',
    items: await listAdminReleases(),
  }));

  app.post<{
    Body: {
      channel: string;
      version: string;
      artifactUrl: string;
      artifactSha256: string;
      artifactSize: number;
      openclawVersion?: string;
      installerVersion?: string;
      minSupportedVersion?: string;
      releaseNotes?: string;
      status?: 'draft' | 'published' | 'disabled';
    };
  }>('/admin/releases', async (request, reply) => {
    try {
      return {
        status: 'ok',
        item: await createAdminRelease(request.body),
      };
    } catch (error) {
      return sendAdminError(reply, error);
    }
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/admin/releases/:id',
    async (request, reply) => {
      try {
        return {
          status: 'ok',
          item: await updateAdminRelease(request.params.id, request.body),
        };
      } catch (error) {
        return sendAdminError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string } }>('/admin/releases/:id/publish', async (request, reply) => {
    try {
      return {
        status: 'ok',
        item: await publishAdminRelease(request.params.id),
      };
    } catch (error) {
      return sendAdminError(reply, error);
    }
  });

  app.get('/admin/model-provider-keys', async () => ({
    status: 'ok',
    items: await listAdminModelProviderKeys(),
  }));

  app.post<{
    Body: {
      provider: string;
      apiKey: string;
      region?: string;
      label?: string;
      status?: 'active' | 'disabled' | 'cooldown';
      weight?: number;
      dailyQuota?: number;
    };
  }>('/admin/model-provider-keys', async (request, reply) => {
    try {
      return {
        status: 'ok',
        item: await createAdminModelProviderKey(request.body),
      };
    } catch (error) {
      return sendAdminError(reply, error);
    }
  });

  app.patch<{
    Params: { id: string };
    Body: {
      label?: string;
      region?: string;
      status?: 'active' | 'disabled' | 'cooldown';
      weight?: number;
      dailyQuota?: number;
      apiKey?: string;
    };
  }>('/admin/model-provider-keys/:id', async (request, reply) => {
    try {
      return {
        status: 'ok',
        item: await updateAdminModelProviderKey(request.params.id, request.body),
      };
    } catch (error) {
      return sendAdminError(reply, error);
    }
  });
}
