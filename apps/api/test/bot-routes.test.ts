import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-bots-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const appModule = await importFresh<typeof import('../src/app.js')>(
  '../src/app.js',
);
const botModule = await importFresh<typeof import('../src/lib/bot-definitions.js')>(
  '../src/lib/bot-definitions.js',
);
const app = appModule.createApp();

test.after(async () => {
  await app.close();
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('bot routes should expose managed list and allow writes without access-key gating', async () => {
  const initialList = await app.inject({
    method: 'GET',
    url: '/api/bots',
  });

  assert.equal(initialList.statusCode, 200);
  assert.equal(initialList.json().manageEnabled, true);
  assert.equal(Array.isArray(initialList.json().items), true);
  assert.equal(initialList.json().items.length >= 1, true);

  const created = await app.inject({
    method: 'POST',
    url: '/api/bots',
    payload: {
      id: 'wecom-assistant',
      name: '企业微信助理',
      description: '企业微信渠道机器人',
      libraryAccessLevel: 1,
      visibleLibraryKeys: ['contract'],
      channelBindings: [
        { channel: 'web', enabled: true },
        { channel: 'wecom', enabled: true, routeKey: 'corp-default', externalBotId: 'wbot-001' },
      ],
    },
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().item.id, 'wecom-assistant');
  assert.equal(created.json().item.libraryAccessLevel, 1);

  const resolvedByExternalBot = await botModule.resolveBotForChannel('wecom', {
    externalBotId: 'wbot-001',
  });
  assert.equal(resolvedByExternalBot?.id, 'wecom-assistant');

  const managedList = await app.inject({
    method: 'GET',
    url: '/api/bots',
  });

  assert.equal(managedList.statusCode, 200);
  assert.equal(managedList.json().manageEnabled, true);
  assert.equal(
    managedList.json().items.some((item: { id: string; visibleLibraryKeys?: string[] }) => (
      item.id === 'wecom-assistant' && Array.isArray(item.visibleLibraryKeys)
    )),
    true,
  );
  assert.equal(
    managedList.json().items.find((item: { id: string; libraryAccessLevel?: number }) => item.id === 'wecom-assistant')
      ?.libraryAccessLevel,
    1,
  );
  const updated = await app.inject({
    method: 'PATCH',
    url: '/api/bots/wecom-assistant',
    payload: {
      isDefault: true,
      includeFailedParseDocuments: true,
      libraryAccessLevel: 2,
    },
  });

  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().item.isDefault, true);
  assert.equal(updated.json().item.includeFailedParseDocuments, true);
  assert.equal(updated.json().item.libraryAccessLevel, 2);
});
