import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BotDefinition } from '../src/lib/bot-definitions.js';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-channel-directory-sources-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const directorySources = await importFresh<typeof import('../src/lib/channel-directory-sources.js')>(
  '../src/lib/channel-directory-sources.js',
);

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

function createBot(bindingOverrides: Record<string, unknown> = {}): BotDefinition {
  return {
    id: 'wecom-assistant',
    name: '企业微信助手',
    slug: 'wecom-assistant',
    description: '',
    enabled: true,
    isDefault: true,
    systemPrompt: '',
    libraryAccessLevel: 0,
    visibleLibraryKeys: ['contract', 'ioa'],
    includeUngrouped: true,
    includeFailedParseDocuments: false,
    channelBindings: [
      {
        channel: 'web',
        enabled: true,
      },
      {
        channel: 'wecom',
        enabled: true,
        routeKey: 'corp-default',
        externalBotId: 'wbot-001',
        tenantId: 'corp-01',
        ...bindingOverrides,
      },
    ],
    updatedAt: '2026-04-07T00:00:00.000Z',
  };
}

test('channel directory sources should create, update, list, and resolve by bot binding', async () => {
  const created = await directorySources.createChannelDirectorySource({
    id: 'wecom-directory',
    botId: 'wecom-assistant',
    channel: 'wecom',
    routeKey: 'corp-default',
    tenantId: 'corp-01',
    externalBotId: 'wbot-001',
    enabled: true,
    sourceType: 'http-json',
    request: {
      url: 'https://example.com/api/wecom/users',
      method: 'GET',
      headers: [{ key: 'X-Token', value: 'secret-token', secret: true }],
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

  assert.equal(created.id, 'wecom-directory');
  assert.equal(created.botId, 'wecom-assistant');
  assert.equal(created.channel, 'wecom');
  assert.equal(created.request.method, 'GET');
  assert.equal(created.lastSyncStatus, 'idle');

  const updated = await directorySources.updateChannelDirectorySource('wecom-directory', {
    enabled: false,
    sync: {
      mode: 'interval',
      intervalMinutes: 30,
    },
  });

  assert.equal(updated.enabled, false);
  assert.equal(updated.sync.mode, 'interval');
  assert.equal(updated.sync.intervalMinutes, 30);

  const items = await directorySources.listChannelDirectorySources();
  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, 'wecom-directory');

  const unresolved = await directorySources.resolveChannelDirectorySource(createBot({
    directorySourceId: 'wecom-directory',
  }), 'wecom', {
    routeKey: 'corp-default',
    externalBotId: 'wbot-001',
    tenantId: 'corp-01',
  });
  assert.equal(unresolved, null);

  await directorySources.updateChannelDirectorySource('wecom-directory', {
    enabled: true,
  });

  const resolved = await directorySources.resolveChannelDirectorySource(createBot({
    directorySourceId: 'wecom-directory',
  }), 'wecom', {
    routeKey: 'corp-default',
    externalBotId: 'wbot-001',
    tenantId: 'corp-01',
  });

  assert.equal(resolved?.id, 'wecom-directory');
  assert.equal(resolved?.request.headers[0]?.secret, true);
});

test('channel directory source resolver should reject mismatched bindings and ignore disabled bindings', async () => {
  await directorySources.createChannelDirectorySource({
    id: 'teams-directory',
    botId: 'wecom-assistant',
    channel: 'wecom',
    routeKey: 'corp-default',
    enabled: true,
    sourceType: 'http-json',
    request: {
      url: 'https://example.com/api/users',
      method: 'POST',
      headers: [],
    },
    responseMapping: {
      usersPath: 'payload.users',
      groupsPath: 'payload.groups',
      membershipsPath: 'payload.memberships',
    },
    fieldMapping: {
      userIdField: 'userId',
      userNameField: 'userName',
      groupIdField: 'groupId',
      groupNameField: 'groupName',
      membershipUserIdField: 'memberUserId',
      membershipGroupIdField: 'memberGroupId',
    },
    sync: {
      mode: 'manual',
    },
  });

  const wrongRoute = await directorySources.resolveChannelDirectorySource(createBot({
    directorySourceId: 'teams-directory',
  }), 'wecom', {
    routeKey: 'other-route',
  });
  assert.equal(wrongRoute, null);

  const disabledBinding = await directorySources.resolveChannelDirectorySource(createBot({
    enabled: false,
    directorySourceId: 'teams-directory',
  }), 'wecom');
  assert.equal(disabledBinding, null);
});
