import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-channel-directory-sync-'));
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

async function startJsonServer(handler: http.RequestListener) {
  const server = http.createServer(handler);
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

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('channel directory sync should fetch http json sources and map nested snapshot records', async () => {
  let seenMethod = '';
  let seenToken = '';
  let seenBody = '';
  const server = await startJsonServer(async (request, response) => {
    seenMethod = request.method || '';
    seenToken = String(request.headers['x-directory-token'] || '');
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    seenBody = Buffer.concat(chunks).toString('utf8');
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({
      payload: {
        directory: {
          users: [
            { profile: { code: 'u-001', displayName: '张三' } },
            { profile: { code: 'u-002', displayName: '李四' } },
            { profile: { code: 'u-001', displayName: '重复张三' } },
          ],
          groups: [
            { meta: { id: 'g-risk', label: '风控组' } },
            { meta: { id: 'g-ops', label: '运营组' } },
          ],
          memberships: [
            { links: { user: 'u-001', group: 'g-risk' } },
            { links: { user: 'u-001', group: 'g-risk' } },
            { links: { user: 'u-002', group: 'g-ops' } },
          ],
        },
      },
    }));
  });

  try {
    await directorySources.createChannelDirectorySource({
      id: 'wecom-sync-source',
      botId: 'wecom-assistant',
      channel: 'wecom',
      enabled: true,
      request: {
        url: `${server.baseUrl}/directory`,
        method: 'POST',
        headers: [{ key: 'X-Directory-Token', value: 'token-123', secret: true }],
        bodyTemplate: JSON.stringify({ scope: 'corp-01' }),
      },
      responseMapping: {
        usersPath: 'payload.directory.users',
        groupsPath: 'payload.directory.groups',
        membershipsPath: 'payload.directory.memberships',
      },
      fieldMapping: {
        userIdField: 'profile.code',
        userNameField: 'profile.displayName',
        groupIdField: 'meta.id',
        groupNameField: 'meta.label',
        membershipUserIdField: 'links.user',
        membershipGroupIdField: 'links.group',
      },
      sync: {
        mode: 'manual',
      },
    });

    const result = await directorySync.runChannelDirectorySync('wecom-sync-source');
    const snapshot = await directorySync.readChannelDirectorySnapshot('wecom-sync-source');
    const status = await directorySync.getChannelDirectorySyncStatus('wecom-sync-source');

    assert.equal(seenMethod, 'POST');
    assert.equal(seenToken, 'token-123');
    assert.match(seenBody, /corp-01/);
    assert.equal(result.response.request.headers[0]?.value, '[redacted]');
    assert.equal(snapshot?.users.length, 2);
    assert.deepEqual(snapshot?.users.map((item) => `${item.id}:${item.name}`), ['u-002:李四', 'u-001:张三']);
    assert.deepEqual(snapshot?.groups.map((item) => item.id), ['g-risk', 'g-ops']);
    assert.deepEqual(snapshot?.memberships, [
      { userId: 'u-001', groupId: 'g-risk' },
      { userId: 'u-002', groupId: 'g-ops' },
    ]);
    assert.equal(status?.status, 'success');
    assert.equal(status?.userCount, 2);
    assert.equal(status?.groupCount, 2);
    assert.equal(status?.membershipCount, 2);
    assert.ok(status?.lastSyncAt);
  } finally {
    await server.close();
  }
});

test('channel directory sync should record error status and preserve last good snapshot on malformed payload', async () => {
  let mode: 'good' | 'bad' = 'good';
  const server = await startJsonServer((request, response) => {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (mode === 'good') {
      response.end(JSON.stringify({
        users: [
          { id: 'user-a', name: '用户A' },
        ],
        groups: [
          { id: 'group-a', name: 'A组' },
        ],
        memberships: [
          { userId: 'user-a', groupId: 'group-a' },
        ],
      }));
      return;
    }
    response.end(JSON.stringify({
      users: [
        { id: 'user-b', name: '用户B' },
      ],
      groups: {
        id: 'group-b',
        name: 'B组',
      },
      memberships: [
        { userId: 'user-b', groupId: 'group-b' },
      ],
    }));
  });

  try {
    await directorySources.createChannelDirectorySource({
      id: 'wecom-sync-error',
      botId: 'wecom-assistant',
      channel: 'wecom',
      enabled: true,
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
      sync: {
        mode: 'manual',
      },
    });

    await directorySync.runChannelDirectorySync('wecom-sync-error');
    const goodSnapshot = await directorySync.readChannelDirectorySnapshot('wecom-sync-error');
    const goodStatus = await directorySync.getChannelDirectorySyncStatus('wecom-sync-error');

    assert.equal(goodStatus?.status, 'success');
    assert.equal(goodSnapshot?.users[0]?.id, 'user-a');

    mode = 'bad';
    await assert.rejects(
      directorySync.runChannelDirectorySync('wecom-sync-error'),
      /groups path did not resolve to an array/i,
    );

    const failedSnapshot = await directorySync.readChannelDirectorySnapshot('wecom-sync-error');
    const failedStatus = await directorySync.getChannelDirectorySyncStatus('wecom-sync-error');

    assert.deepEqual(failedSnapshot, goodSnapshot);
    assert.equal(failedStatus?.status, 'error');
    assert.equal(failedStatus?.userCount, 1);
    assert.equal(failedStatus?.groupCount, 1);
    assert.equal(failedStatus?.membershipCount, 1);
    assert.match(failedStatus?.lastMessage || '', /groups path/i);
    assert.ok(failedStatus?.lastFinishedAt);
  } finally {
    await server.close();
  }
});
