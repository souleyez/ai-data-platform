import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-channel-ingress-access-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const botDefinitions = await importFresh<typeof import('../src/lib/bot-definitions.js')>(
  '../src/lib/bot-definitions.js',
);
const directorySources = await importFresh<typeof import('../src/lib/channel-directory-sources.js')>(
  '../src/lib/channel-directory-sources.js',
);
const directorySync = await importFresh<typeof import('../src/lib/channel-directory-sync.js')>(
  '../src/lib/channel-directory-sync.js',
);
const accessPolicies = await importFresh<typeof import('../src/lib/channel-user-access-policies.js')>(
  '../src/lib/channel-user-access-policies.js',
);
const channelIngress = await importFresh<typeof import('../src/lib/channel-ingress.js')>(
  '../src/lib/channel-ingress.js',
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
    ],
  }, null, 2), 'utf8');
}

async function createWecomBot(input: { id: string; directorySourceId: string }) {
  return botDefinitions.createBotDefinition({
    id: input.id,
    name: input.id,
    slug: input.id,
    enabled: true,
    isDefault: false,
    libraryAccessLevel: 0,
    visibleLibraryKeys: ['contract', 'ioa'],
    includeUngrouped: false,
    includeFailedParseDocuments: false,
    channelBindings: [
      { channel: 'web', enabled: true },
      {
        channel: 'wecom',
        enabled: true,
        routeKey: 'corp-route',
        tenantId: 'corp-01',
        externalBotId: 'wb-01',
        directorySourceId: input.directorySourceId,
      },
    ],
  });
}

async function createSourceAndSnapshot(baseUrl: string, sourceId: string, botId: string) {
  await directorySources.createChannelDirectorySource({
    id: sourceId,
    botId,
    channel: 'wecom',
    routeKey: 'corp-route',
    tenantId: 'corp-01',
    externalBotId: 'wb-01',
    enabled: true,
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
    sync: { mode: 'manual' },
  });
  await directorySync.runChannelDirectorySync(sourceId);
}

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('resolveChannelIngressContext should pass effectiveVisibleLibraryKeys into orchestration input', async () => {
  await seedLibraries();
  const server = await startJsonServer({
    users: [{ id: 'u-zhang', name: '张三' }],
    groups: [{ id: 'g-risk', name: '风控组' }],
    memberships: [{ userId: 'u-zhang', groupId: 'g-risk' }],
  });

  try {
    await createWecomBot({ id: 'wecom-ingress-bot-1', directorySourceId: 'ingress-source-1' });
    await createSourceAndSnapshot(server.baseUrl, 'ingress-source-1', 'wecom-ingress-bot-1');
    await accessPolicies.upsertChannelUserAccessPolicies('ingress-source-1', [
      { subjectType: 'user', subjectId: 'u-zhang', visibleLibraryKeys: ['ioa'] },
      { subjectType: 'group', subjectId: 'g-risk', visibleLibraryKeys: ['bid'] },
    ], 'tester');

    const context = await channelIngress.resolveChannelIngressContext({
      channel: 'wecom',
      botId: 'wecom-ingress-bot-1',
      prompt: '查一下 IOA 资料',
      senderId: 'u-zhang',
      senderName: '张三',
      routeKey: 'corp-route',
      tenantId: 'corp-01',
      externalBotId: 'wb-01',
    });

    assert.equal(context.accessContext.isDenied, false);
    assert.deepEqual(context.accessContext.effectiveVisibleLibraryKeys, ['ioa']);
    assert.deepEqual(context.orchestrationInput.effectiveVisibleLibraryKeys, ['ioa']);
    assert.equal(context.orchestrationInput.accessContext?.directorySourceId, 'ingress-source-1');
  } finally {
    await server.close();
  }
});

test('handleChannelIngress should short-circuit deny-by-default when mapped sender has no assignment', async () => {
  await seedLibraries();
  const server = await startJsonServer({
    users: [{ id: 'u-li', name: '李四' }],
    groups: [{ id: 'g-risk', name: '风控组' }],
    memberships: [{ userId: 'u-li', groupId: 'g-risk' }],
  });

  try {
    await createWecomBot({ id: 'wecom-ingress-bot-2', directorySourceId: 'ingress-source-2' });
    await createSourceAndSnapshot(server.baseUrl, 'ingress-source-2', 'wecom-ingress-bot-2');

    const result = await channelIngress.handleChannelIngress({
      channel: 'wecom',
      botId: 'wecom-ingress-bot-2',
      prompt: '查一下合同库资料',
      senderId: 'u-li',
      senderName: '李四',
      routeKey: 'corp-route',
      tenantId: 'corp-01',
      externalBotId: 'wb-01',
    });

    assert.equal(result.accessContext.isDenied, true);
    assert.equal(result.accessContext.denyReason, 'no_assignment');
    assert.match(result.result.message.content, /未配置可访问的文档库/);
    assert.equal(result.result.orchestration.routeKind, 'access_denied');
  } finally {
    await server.close();
  }
});
