import type { FastifyInstance } from 'fastify';
import {
  resolveDatasetSecretGrants,
  verifyDatasetSecret,
} from '../lib/dataset-secrets.js';

export async function registerDatasetSecretRoutes(app: FastifyInstance) {
  app.post('/dataset-secrets/verify', async (request, reply) => {
    const body = (request.body || {}) as { secret?: string };
    const secret = String(body.secret || '').trim();
    if (!secret) {
      return reply.code(400).send({ error: 'dataset secret is required' });
    }

    const verified = await verifyDatasetSecret(secret);
    if (!verified) {
      return reply.code(401).send({ error: 'invalid dataset secret' });
    }

    return {
      verified: true,
      grant: verified.grant,
      libraryKeys: verified.libraryKeys,
      activeGrant: verified.grant,
    };
  });

  app.post('/dataset-secrets/resolve', async (request) => {
    const body = (request.body || {}) as {
      grants?: unknown[];
      activeGrant?: unknown;
    };
    return resolveDatasetSecretGrants({
      grants: body.grants,
      activeGrant: body.activeGrant,
    });
  });
}
