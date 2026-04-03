import type { FastifyInstance } from 'fastify';
import {
  assertBotManageAccess,
  buildPublicBotSummary,
  createBotDefinition,
  getDefaultBotDefinition,
  listBotDefinitionsForManage,
  updateBotDefinition,
} from '../lib/bot-definitions.js';

function readAccessKey(headers: Record<string, unknown>) {
  return String(headers['x-access-key'] || headers['X-Access-Key'] || '').trim();
}

export async function registerBotRoutes(app: FastifyInstance) {
  app.get('/bots', async (request, reply) => {
    const accessKey = readAccessKey(request.headers as Record<string, unknown>);
    try {
      const manageEnabled = Boolean(accessKey && await assertBotManageAccess(accessKey));
      const items = await listBotDefinitionsForManage();
      return {
        items: manageEnabled ? items : items.filter((item) => item.enabled).map(buildPublicBotSummary),
        manageEnabled,
      };
    } catch {
      const items = await listBotDefinitionsForManage();
      return {
        items: items.filter((item) => item.enabled).map(buildPublicBotSummary),
        manageEnabled: false,
      };
    }
  });

  app.get('/bots/default', async () => {
    const item = await getDefaultBotDefinition();
    return {
      item: item ? buildPublicBotSummary(item) : null,
    };
  });

  app.post('/bots', async (request, reply) => {
    const accessKey = readAccessKey(request.headers as Record<string, unknown>);
    try {
      await assertBotManageAccess(accessKey);
      const item = await createBotDefinition((request.body || {}) as Record<string, unknown>);
      return { item };
    } catch (error) {
      return reply.code(401).send({
        error: error instanceof Error ? error.message : 'bot create failed',
      });
    }
  });

  app.patch('/bots/:id', async (request, reply) => {
    const accessKey = readAccessKey(request.headers as Record<string, unknown>);
    try {
      await assertBotManageAccess(accessKey);
      const params = request.params as { id?: string };
      const item = await updateBotDefinition(String(params.id || ''), (request.body || {}) as Record<string, unknown>);
      return { item };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'bot update failed';
      const code = message === 'bot not found' ? 404 : 401;
      return reply.code(code).send({ error: message });
    }
  });
}
