import type { FastifyInstance } from 'fastify';
import { assertBotManageAccess, getBotDefinition } from '../lib/bot-definitions.js';
import {
  createChannelDirectorySource,
  getChannelDirectorySource,
  listChannelDirectorySourcesForBot,
  updateChannelDirectorySource,
} from '../lib/channel-directory-sources.js';
import {
  getChannelDirectorySyncStatus,
  readChannelDirectorySnapshot,
  runChannelDirectorySync,
} from '../lib/channel-directory-sync.js';
import {
  getSubjectAssignedLibraryKeys,
  listChannelUserAccessPolicies,
  upsertChannelUserAccessPolicies,
} from '../lib/channel-user-access-policies.js';
import { resolveChannelAccessContext } from '../lib/channel-access-resolver.js';

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function readAccessKey(headers: Record<string, unknown>) {
  return String(headers['x-access-key'] || headers['X-Access-Key'] || '').trim();
}

function normalizeSubjectType(value: unknown) {
  return normalizeText(value).toLowerCase() === 'group' ? 'group' : 'user';
}

function subjectMatchesQuery(input: {
  query: string;
  subjectId: string;
  name: string;
}) {
  const query = normalizeText(input.query).toLowerCase();
  if (!query) return true;
  return input.subjectId.toLowerCase().includes(query) || input.name.toLowerCase().includes(query);
}

async function assertChannelDirectoryManageAccess(headers: Record<string, unknown>) {
  const accessKey = readAccessKey(headers);
  await assertBotManageAccess(accessKey);
}

async function resolveManagedDirectoryContext(botId: string, sourceId?: string) {
  const bot = await getBotDefinition(botId);
  if (!bot) throw new Error('bot not found');
  if (!sourceId) return { bot, source: null };
  const source = await getChannelDirectorySource(sourceId);
  if (!source || source.botId !== bot.id) throw new Error('directory source not found');
  return { bot, source };
}

async function buildDirectorySourceReadModel(sourceId: string) {
  const source = await getChannelDirectorySource(sourceId);
  if (!source) return null;
  const status = await getChannelDirectorySyncStatus(source.id);
  return {
    ...source,
    syncStatus: status,
  };
}

async function buildSubjectSearchItems(sourceId: string, query: string, subjectType?: 'user' | 'group') {
  const [snapshot, policies] = await Promise.all([
    readChannelDirectorySnapshot(sourceId),
    listChannelUserAccessPolicies(sourceId),
  ]);
  if (!snapshot) return [];
  const policyMap = new Map(
    policies.map((item) => [`${item.subjectType}:${item.subjectId}`, item.visibleLibraryKeys] as const),
  );
  const type = subjectType || '';
  const users = type && type !== 'user'
    ? []
    : snapshot.users
        .filter((item) => subjectMatchesQuery({ query, subjectId: item.id, name: item.name }))
        .map((item) => ({
          subjectType: 'user' as const,
          subjectId: item.id,
          name: item.name,
          visibleLibraryKeys: policyMap.get(`user:${item.id}`) || [],
        }));
  const groups = type && type !== 'group'
    ? []
    : snapshot.groups
        .filter((item) => subjectMatchesQuery({ query, subjectId: item.id, name: item.name }))
        .map((item) => ({
          subjectType: 'group' as const,
          subjectId: item.id,
          name: item.name,
          visibleLibraryKeys: policyMap.get(`group:${item.id}`) || [],
        }));
  return [...users, ...groups]
    .sort((left, right) => (
      left.subjectType.localeCompare(right.subjectType, 'zh-CN')
      || left.name.localeCompare(right.name, 'zh-CN')
      || left.subjectId.localeCompare(right.subjectId, 'zh-CN')
    ))
    .slice(0, 100);
}

async function buildSubjectDetail(sourceId: string, subjectType: 'user' | 'group', subjectId: string) {
  const [snapshot, policies] = await Promise.all([
    readChannelDirectorySnapshot(sourceId),
    listChannelUserAccessPolicies(sourceId),
  ]);
  if (!snapshot) return null;
  const normalizedSubjectId = normalizeText(subjectId);
  if (!normalizedSubjectId) return null;
  if (subjectType === 'user') {
    const user = snapshot.users.find((item) => item.id === normalizedSubjectId);
    if (!user) return null;
    const groupIds = [...new Set(
      snapshot.memberships
        .filter((item) => item.userId === user.id)
        .map((item) => item.groupId),
    )];
    const groups = snapshot.groups.filter((item) => groupIds.includes(item.id));
    const visibleLibraryKeys = policies.find((item) => item.subjectType === 'user' && item.subjectId === user.id)?.visibleLibraryKeys || [];
    const assignedLibraryKeys = await getSubjectAssignedLibraryKeys(sourceId, user.id, groupIds);
    return {
      subjectType,
      subjectId: user.id,
      name: user.name,
      visibleLibraryKeys,
      assignedLibraryKeys,
      groups: groups.map((item) => ({ id: item.id, name: item.name })),
      members: [],
    };
  }

  const group = snapshot.groups.find((item) => item.id === normalizedSubjectId);
  if (!group) return null;
  const members = snapshot.memberships
    .filter((item) => item.groupId === group.id)
    .map((membership) => snapshot.users.find((user) => user.id === membership.userId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({ id: item.id, name: item.name }));
  const visibleLibraryKeys = policies.find((item) => item.subjectType === 'group' && item.subjectId === group.id)?.visibleLibraryKeys || [];
  return {
    subjectType,
    subjectId: group.id,
    name: group.name,
    visibleLibraryKeys,
    assignedLibraryKeys: visibleLibraryKeys,
    groups: [],
    members,
  };
}

export async function registerChannelDirectoryRoutes(app: FastifyInstance) {
  app.get('/bots/:id/channel-directory-sources', async (request, reply) => {
    try {
      await assertChannelDirectoryManageAccess(request.headers as Record<string, unknown>);
      const params = request.params as { id?: string };
      const { bot } = await resolveManagedDirectoryContext(normalizeText(params.id));
      const sources = await listChannelDirectorySourcesForBot(bot.id);
      const items = await Promise.all(sources.map((item) => buildDirectorySourceReadModel(item.id)));
      return { items: items.filter(Boolean) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'directory source list failed';
      const code = message === 'bot not found' ? 404 : 401;
      return reply.code(code).send({ error: message });
    }
  });

  app.post('/bots/:id/channel-directory-sources', async (request, reply) => {
    try {
      await assertChannelDirectoryManageAccess(request.headers as Record<string, unknown>);
      const params = request.params as { id?: string };
      const { bot } = await resolveManagedDirectoryContext(normalizeText(params.id));
      const item = await createChannelDirectorySource({
        ...(request.body || {}) as Record<string, unknown>,
        botId: bot.id,
      } as any);
      return { item };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'directory source create failed';
      const code = message === 'bot not found' ? 404 : 401;
      return reply.code(code).send({ error: message });
    }
  });

  app.patch('/bots/:id/channel-directory-sources/:sourceId', async (request, reply) => {
    try {
      await assertChannelDirectoryManageAccess(request.headers as Record<string, unknown>);
      const params = request.params as { id?: string; sourceId?: string };
      await resolveManagedDirectoryContext(normalizeText(params.id), normalizeText(params.sourceId));
      const item = await updateChannelDirectorySource(normalizeText(params.sourceId), (request.body || {}) as Record<string, unknown>);
      return { item };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'directory source update failed';
      const code = message === 'bot not found' || message === 'directory source not found' ? 404 : 401;
      return reply.code(code).send({ error: message });
    }
  });

  app.post('/bots/:id/channel-directory-sources/:sourceId/sync', async (request, reply) => {
    try {
      await assertChannelDirectoryManageAccess(request.headers as Record<string, unknown>);
      const params = request.params as { id?: string; sourceId?: string };
      await resolveManagedDirectoryContext(normalizeText(params.id), normalizeText(params.sourceId));
      const result = await runChannelDirectorySync(normalizeText(params.sourceId));
      return {
        item: await buildDirectorySourceReadModel(normalizeText(params.sourceId)),
        status: result.status,
        snapshot: {
          userCount: result.snapshot.users.length,
          groupCount: result.snapshot.groups.length,
          membershipCount: result.snapshot.memberships.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'directory source sync failed';
      const code = message === 'bot not found' || message === 'directory source not found' ? 404 : 401;
      return reply.code(code).send({ error: message });
    }
  });

  app.get('/bots/:id/channel-directory-sources/:sourceId/subjects', async (request, reply) => {
    try {
      await assertChannelDirectoryManageAccess(request.headers as Record<string, unknown>);
      const params = request.params as { id?: string; sourceId?: string };
      const query = (request.query || {}) as { q?: string; type?: string };
      await resolveManagedDirectoryContext(normalizeText(params.id), normalizeText(params.sourceId));
      const items = await buildSubjectSearchItems(
        normalizeText(params.sourceId),
        normalizeText(query.q),
        normalizeText(query.type) === 'group' ? 'group' : (normalizeText(query.type) === 'user' ? 'user' : undefined),
      );
      return { items };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'directory subject search failed';
      const code = message === 'bot not found' || message === 'directory source not found' ? 404 : 401;
      return reply.code(code).send({ error: message });
    }
  });

  app.get('/bots/:id/channel-directory-sources/:sourceId/subjects/:subjectType/:subjectId', async (request, reply) => {
    try {
      await assertChannelDirectoryManageAccess(request.headers as Record<string, unknown>);
      const params = request.params as { id?: string; sourceId?: string; subjectType?: string; subjectId?: string };
      await resolveManagedDirectoryContext(normalizeText(params.id), normalizeText(params.sourceId));
      const item = await buildSubjectDetail(
        normalizeText(params.sourceId),
        normalizeSubjectType(params.subjectType),
        normalizeText(params.subjectId),
      );
      if (!item) {
        return reply.code(404).send({ error: 'subject not found' });
      }
      return { item };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'directory subject detail failed';
      const code = message === 'bot not found' || message === 'directory source not found' ? 404 : 401;
      return reply.code(code).send({ error: message });
    }
  });

  app.get('/bots/:id/channel-directory-sources/:sourceId/access-policies', async (request, reply) => {
    try {
      await assertChannelDirectoryManageAccess(request.headers as Record<string, unknown>);
      const params = request.params as { id?: string; sourceId?: string };
      await resolveManagedDirectoryContext(normalizeText(params.id), normalizeText(params.sourceId));
      const items = await listChannelUserAccessPolicies(normalizeText(params.sourceId));
      return { items };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'directory policies list failed';
      const code = message === 'bot not found' || message === 'directory source not found' ? 404 : 401;
      return reply.code(code).send({ error: message });
    }
  });

  app.patch('/bots/:id/channel-directory-sources/:sourceId/access-policies', async (request, reply) => {
    try {
      await assertChannelDirectoryManageAccess(request.headers as Record<string, unknown>);
      const params = request.params as { id?: string; sourceId?: string };
      await resolveManagedDirectoryContext(normalizeText(params.id), normalizeText(params.sourceId));
      const body = (request.body || {}) as {
        items?: Array<{ subjectType?: string; subjectId?: string; visibleLibraryKeys?: string[] }>;
        updatedBy?: string;
      };
      const items = await upsertChannelUserAccessPolicies(
        normalizeText(params.sourceId),
        Array.isArray(body.items)
          ? body.items.map((item) => ({
              subjectType: normalizeSubjectType(item.subjectType),
              subjectId: normalizeText(item.subjectId),
              visibleLibraryKeys: Array.isArray(item.visibleLibraryKeys) ? item.visibleLibraryKeys : [],
            }))
          : [],
        normalizeText(body.updatedBy),
      );
      return { items };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'directory policies patch failed';
      const code = message === 'bot not found' || message === 'directory source not found' ? 404 : 401;
      return reply.code(code).send({ error: message });
    }
  });

  app.post('/bots/:id/channel-directory-sources/:sourceId/access-preview', async (request, reply) => {
    try {
      await assertChannelDirectoryManageAccess(request.headers as Record<string, unknown>);
      const params = request.params as { id?: string; sourceId?: string };
      const { bot, source } = await resolveManagedDirectoryContext(normalizeText(params.id), normalizeText(params.sourceId));
      const body = (request.body || {}) as { senderId?: string; senderName?: string };
      const senderId = normalizeText(body.senderId);
      if (!senderId) {
        return reply.code(400).send({ error: 'senderId is required' });
      }
      const item = await resolveChannelAccessContext({
        bot,
        channel: source!.channel,
        senderId,
        senderName: normalizeText(body.senderName),
        routeKey: source?.routeKey,
        tenantId: source?.tenantId,
        externalBotId: source?.externalBotId,
      });
      return { item };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'directory access preview failed';
      const code = message === 'bot not found' || message === 'directory source not found' ? 404 : 401;
      return reply.code(code).send({ error: message });
    }
  });
}
