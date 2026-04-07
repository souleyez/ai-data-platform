import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BotDefinition } from '../src/lib/bot-definitions.js';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-channel-access-resolver-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const directorySources = await importFresh<typeof import('../src/lib/channel-directory-sources.js')>(
  '../src/lib/channel-directory-sources.js',
);
const directorySync = await importFresh<typeof import('../src/lib/channel-directory-sync.js')>(
  '../src/lib/channel-directory-sync.js',
);
const accessPolicies = await importFresh<typeof import('../src/lib/channel-user-access-policies.js')>(
  '../src/lib/channel-user-access-policies.js',
);
const accessResolver = await importFresh<typeof import('../src/lib/channel-access-resolver.js')>(
  '../src/lib/channel-access-resolver.js',
);

async function startJsonServer(body: unknown) {
  const server = http.createServer((_request, response) => {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(body));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to start json server');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function seedLibraries() {
  const configDir = path.join(storageRoot, 'config');
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, 'document-libraries.json'), JSON.stringify({
    items: [
      { key: 'contract', label: '合同库', permissionLevel: 0, createdAt: '2026-04-07T00:00:00.000Z' },
      { key: 'ioa', label: 'IOA', permissionLevel: 0, createdAt: '2026-04-07T00:00:00.000Z' },
      { key: 'bid', label: '标书', permissionLevel: 0, createdAt: '2026-04-07T00:00:00.000Z' },
      { key: 'ops', label: '运营', permissionLevel: 0, createdAt: '2026-04-07T00:00:00.000Z' },
    ],
  }, null, 2), 'utf8');
}

function createBot(options?: {
  visibleLibraryKeys?: string[];
  directorySourceId?: string;
  sourceEnabled?: boolean;
}): BotDefinition {
  return {
    id: 'wecom-access-bot',
    name: '企业微信权限机器人',
    slug: 'wecom-access-bot',
    description: '',
    enabled: true,
    isDefault: true,
    systemPrompt: '',
    libraryAccessLevel: 0,
    visibleLibraryKeys: options?.visibleLibraryKeys || ['contract', 'ioa', 'bid'],
    includeUngrouped: true,
    includeFailedParseDocuments: false,
    channelBindings: [
      { channel: 'web', enabled: true },
      {
        channel: 'wecom',
        enabled: options?.sourceEnabled !== false,
        routeKey: 'corp-route',
        tenantId: 'corp-01',
        externalBotId: 'wb-01',
        directorySourceId: options?.directorySourceId,
      },
    ],
    updatedAt: '2026-04-07T00:00:00.000Z',
  };
}

async function createAndSyncSource(baseUrl: string, sourceId: string, enabled = true) {
  await directorySources.createChannelDirectorySource({
    id: sourceId,
    botId: 'wecom-access-bot',
    channel: 'wecom',
    routeKey: 'corp-route',
    tenantId: 'corp-01',
    externalBotId: 'wb-01',
    enabled,
    request: {
      url: `${baseUrl}/directory`,
      method: 'GET',
      headers: [],
    },
    responseMapping: {
      usersPath: 'users',
      groupsPath: 'groups',
      membershipsPath: 'memberships',
    },
    fieldMapping: {
      userIdField: 'id',
      userNameField: 'name',
      groupIdField: 'id',
      groupNameField: 'name',
      membershipUserIdField: 'userId',
      membershipGroupIdField: 'groupId',
    },
    sync: {
      mode: 'manual',
    },
  });
  if (enabled) {
    await directorySync.runChannelDirectorySync(sourceId);
  }
}

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('channel access resolver should merge user and group assignments within bot upper bound', async () => {
  await seedLibraries();
  const server = await startJsonServer({
    users: [
      { id: 'u-zhang', name: '张三' },
    ],
    groups: [
      { id: 'g-risk', name: '风控组' },
      { id: 'g-ops', name: '运营组' },
    ],
    memberships: [
      { userId: 'u-zhang', groupId: 'g-risk' },
      { userId: 'u-zhang', groupId: 'g-ops' },
    ],
  });

  try {
    await createAndSyncSource(server.baseUrl, 'resolver-source-1');
    await accessPolicies.upsertChannelUserAccessPolicies('resolver-source-1', [
      { subjectType: 'user', subjectId: 'u-zhang', visibleLibraryKeys: ['contract'] },
      { subjectType: 'group', subjectId: 'g-risk', visibleLibraryKeys: ['ioa'] },
      { subjectType: 'group', subjectId: 'g-ops', visibleLibraryKeys: ['ops'] },
    ], 'tester');

    const result = await accessResolver.resolveChannelAccessContext({
      bot: createBot({ visibleLibraryKeys: ['contract', 'ioa', 'bid'], directorySourceId: 'resolver-source-1' }),
      channel: 'wecom',
      senderId: 'u-zhang',
      senderName: '张三',
      routeKey: 'corp-route',
      tenantId: 'corp-01',
      externalBotId: 'wb-01',
    });

    assert.equal(result.source, 'external-directory');
    assert.equal(result.isDenied, false);
    assert.deepEqual(result.assignedLibraryKeys, ['contract', 'ioa', 'ops']);
    assert.deepEqual(result.effectiveVisibleLibraryKeys, ['contract', 'ioa']);
    assert.deepEqual(result.matchedGroups.map((item) => item.id), ['g-risk', 'g-ops']);
  } finally {
    await server.close();
  }
});

test('channel access resolver should deny when sender is not found or has no assignment', async () => {
  await seedLibraries();
  const server = await startJsonServer({
    users: [
      { id: 'u-li', name: '李四' },
      { id: 'u-wang', name: '王五' },
    ],
    groups: [
      { id: 'g-risk', name: '风控组' },
    ],
    memberships: [
      { userId: 'u-li', groupId: 'g-risk' },
    ],
  });

  try {
    await createAndSyncSource(server.baseUrl, 'resolver-source-2');
    await accessPolicies.upsertChannelUserAccessPolicies('resolver-source-2', [
      { subjectType: 'group', subjectId: 'g-risk', visibleLibraryKeys: ['contract'] },
    ], 'tester');

    const missingSender = await accessResolver.resolveChannelAccessContext({
      bot: createBot({ directorySourceId: 'resolver-source-2' }),
      channel: 'wecom',
      senderId: 'u-missing',
      routeKey: 'corp-route',
      tenantId: 'corp-01',
      externalBotId: 'wb-01',
    });
    const noAssignment = await accessResolver.resolveChannelAccessContext({
      bot: createBot({ directorySourceId: 'resolver-source-2' }),
      channel: 'wecom',
      senderId: 'u-wang',
      routeKey: 'corp-route',
      tenantId: 'corp-01',
      externalBotId: 'wb-01',
    });

    assert.equal(missingSender.isDenied, true);
    assert.equal(missingSender.denyReason, 'sender_not_found');
    assert.deepEqual(missingSender.effectiveVisibleLibraryKeys, []);

    assert.equal(noAssignment.isDenied, true);
    assert.equal(noAssignment.denyReason, 'no_assignment');
    assert.deepEqual(noAssignment.effectiveVisibleLibraryKeys, []);
  } finally {
    await server.close();
  }
});

test('channel access resolver should intersect assignments with bot upper bound and fall back to bot-only when source is disabled', async () => {
  await seedLibraries();
  const server = await startJsonServer({
    users: [
      { id: 'u-chen', name: '陈六' },
    ],
    groups: [
      { id: 'g-risk', name: '风控组' },
    ],
    memberships: [
      { userId: 'u-chen', groupId: 'g-risk' },
    ],
  });

  try {
    await createAndSyncSource(server.baseUrl, 'resolver-source-3');
    await accessPolicies.upsertChannelUserAccessPolicies('resolver-source-3', [
      { subjectType: 'user', subjectId: 'u-chen', visibleLibraryKeys: ['ops', 'bid'] },
    ], 'tester');

    const intersected = await accessResolver.resolveChannelAccessContext({
      bot: createBot({ visibleLibraryKeys: ['bid'], directorySourceId: 'resolver-source-3' }),
      channel: 'wecom',
      senderId: 'u-chen',
      routeKey: 'corp-route',
      tenantId: 'corp-01',
      externalBotId: 'wb-01',
    });

    await createAndSyncSource(server.baseUrl, 'resolver-source-disabled', false);
    const botOnly = await accessResolver.resolveChannelAccessContext({
      bot: createBot({ visibleLibraryKeys: ['contract', 'bid'], directorySourceId: 'resolver-source-disabled' }),
      channel: 'wecom',
      senderId: 'u-chen',
      routeKey: 'corp-route',
      tenantId: 'corp-01',
      externalBotId: 'wb-01',
    });

    assert.equal(intersected.isDenied, false);
    assert.deepEqual(intersected.assignedLibraryKeys, ['ops', 'bid']);
    assert.deepEqual(intersected.effectiveVisibleLibraryKeys, ['bid']);

    assert.equal(botOnly.source, 'bot-only');
    assert.equal(botOnly.isDenied, false);
    assert.deepEqual(botOnly.effectiveVisibleLibraryKeys, ['bid', 'contract']);
  } finally {
    await server.close();
  }
});
