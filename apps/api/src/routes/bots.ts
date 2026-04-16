import type { FastifyInstance } from 'fastify';
import {
  assertBotManageAccess,
  buildPublicBotSummary,
  createBotDefinition,
  getDefaultBotDefinition,
  listBotDefinitionsForManage,
  updateBotDefinition,
} from '../lib/bot-definitions.js';
import { listChannelDirectorySourcesForBot } from '../lib/channel-directory-sources.js';
import { getChannelDirectorySyncStatus } from '../lib/channel-directory-sync.js';

export async function registerBotRoutes(app: FastifyInstance) {
  app.get('/bots', async () => {
    await assertBotManageAccess();
    const items = await listBotDefinitionsForManage();
    const managedItems = await Promise.all(items.map(async (item) => ({
      ...item,
      externalDirectorySources: await Promise.all(
        (await listChannelDirectorySourcesForBot(item.id)).map(async (source) => ({
          id: source.id,
          channel: source.channel,
          enabled: source.enabled,
          routeKey: source.routeKey || '',
          tenantId: source.tenantId || '',
          externalBotId: source.externalBotId || '',
          syncStatus: await getChannelDirectorySyncStatus(source.id),
        })),
      ),
    })));
    return {
      items: managedItems,
      manageEnabled: true,
    };
  });

  app.get('/bots/default', async () => {
    const item = await getDefaultBotDefinition();
    return {
      item: item ? buildPublicBotSummary(item) : null,
    };
  });

  app.post('/bots', async (request, reply) => {
    try {
      await assertBotManageAccess();
      const item = await createBotDefinition((request.body || {}) as Record<string, unknown>);
      return { item };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'bot create failed',
      });
    }
  });

  app.patch('/bots/:id', async (request, reply) => {
    try {
      await assertBotManageAccess();
      const params = request.params as { id?: string };
      const item = await updateBotDefinition(String(params.id || ''), (request.body || {}) as Record<string, unknown>);
      return { item };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'bot update failed';
      const code = message === 'bot not found' ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });
}
