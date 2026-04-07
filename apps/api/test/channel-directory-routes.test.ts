import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-channel-directory-routes-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const appModule = await importFresh<typeof import('../src/app.js')>(
  '../src/app.js',
);
const app = appModule.createApp();

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
  if (!address || typeof address === 'string') throw new Error('failed to start json server');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
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

test.after(async () => {
  await app.close();
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('channel directory routes should manage sources, subjects, policies, and access preview', async () => {
  await seedLibraries();
  const setup = await app.inject({
    method: 'POST',
    url: '/api/intelligence-mode/setup-full',
    payload: {
      code: '123456',
      label: 'channel-directory-manage',
    },
  });
  assert.equal(setup.statusCode, 200);

  const createBot = await app.inject({
    method: 'POST',
    url: '/api/bots',
    headers: {
      'x-access-key': '123456',
    },
    payload: {
      id: 'wecom-directory-bot',
      name: 'WeCom Directory Bot',
      visibleLibraryKeys: ['contract'],
      channelBindings: [
        { channel: 'web', enabled: true },
        {
          channel: 'wecom',
          enabled: true,
          routeKey: 'corp-route',
          tenantId: 'corp-01',
          externalBotId: 'wb-01',
          directorySourceId: 'corp-directory',
        },
      ],
    },
  });
  assert.equal(createBot.statusCode, 200);

  const deniedCreate = await app.inject({
    method: 'POST',
    url: '/api/bots/wecom-directory-bot/channel-directory-sources',
    payload: { id: 'corp-directory', channel: 'wecom', request: { url: 'https://example.com', method: 'GET', headers: [] } },
  });
  assert.equal(deniedCreate.statusCode, 401);

  const server = await startJsonServer({
    users: [{ id: 'u-zhang', name: '张三' }],
    groups: [{ id: 'g-risk', name: '风控组' }],
    memberships: [{ userId: 'u-zhang', groupId: 'g-risk' }],
  });

  try {
    const createdSource = await app.inject({
      method: 'POST',
      url: '/api/bots/wecom-directory-bot/channel-directory-sources',
      headers: {
        'x-access-key': '123456',
      },
      payload: {
        id: 'corp-directory',
        channel: 'wecom',
        routeKey: 'corp-route',
        tenantId: 'corp-01',
        externalBotId: 'wb-01',
        request: {
          url: `${server.baseUrl}/directory`,
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
      },
    });
    assert.equal(createdSource.statusCode, 200);
    assert.equal(createdSource.json().item.id, 'corp-directory');

    const synced = await app.inject({
      method: 'POST',
      url: '/api/bots/wecom-directory-bot/channel-directory-sources/corp-directory/sync',
      headers: {
        'x-access-key': '123456',
      },
    });
    assert.equal(synced.statusCode, 200);
    assert.equal(synced.json().status.status, 'success');
    assert.equal(synced.json().snapshot.userCount, 1);

    const subjectSearch = await app.inject({
      method: 'GET',
      url: '/api/bots/wecom-directory-bot/channel-directory-sources/corp-directory/subjects?q=张',
      headers: {
        'x-access-key': '123456',
      },
    });
    assert.equal(subjectSearch.statusCode, 200);
    assert.equal(subjectSearch.json().items[0].subjectId, 'u-zhang');

    const patchedPolicies = await app.inject({
      method: 'PATCH',
      url: '/api/bots/wecom-directory-bot/channel-directory-sources/corp-directory/access-policies',
      headers: {
        'x-access-key': '123456',
      },
      payload: {
        updatedBy: 'tester',
        items: [
          { subjectType: 'user', subjectId: 'u-zhang', visibleLibraryKeys: ['contract', 'ioa'] },
          { subjectType: 'group', subjectId: 'g-risk', visibleLibraryKeys: ['bid'] },
        ],
      },
    });
    assert.equal(patchedPolicies.statusCode, 200);
    assert.equal(patchedPolicies.json().items.length, 2);

    const subjectDetail = await app.inject({
      method: 'GET',
      url: '/api/bots/wecom-directory-bot/channel-directory-sources/corp-directory/subjects/user/u-zhang',
      headers: {
        'x-access-key': '123456',
      },
    });
    assert.equal(subjectDetail.statusCode, 200);
    assert.deepEqual(subjectDetail.json().item.assignedLibraryKeys, ['contract', 'ioa', 'bid']);

    const preview = await app.inject({
      method: 'POST',
      url: '/api/bots/wecom-directory-bot/channel-directory-sources/corp-directory/access-preview',
      headers: {
        'x-access-key': '123456',
      },
      payload: {
        senderId: 'u-zhang',
        senderName: '张三',
      },
    });
    assert.equal(preview.statusCode, 200);
    assert.deepEqual(preview.json().item.effectiveVisibleLibraryKeys, ['contract']);

    const botList = await app.inject({
      method: 'GET',
      url: '/api/bots',
      headers: {
        'x-access-key': '123456',
      },
    });
    assert.equal(botList.statusCode, 200);
    const managedBot = botList.json().items.find((item: { id: string }) => item.id === 'wecom-directory-bot');
    assert.equal(managedBot.externalDirectorySources[0].id, 'corp-directory');
    assert.equal(managedBot.externalDirectorySources[0].syncStatus.status, 'success');
  } finally {
    await server.close();
  }
});
