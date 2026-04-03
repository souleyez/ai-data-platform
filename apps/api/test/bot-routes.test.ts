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
const app = appModule.createApp();

test.after(async () => {
  await app.close();
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('bot routes should expose public list and require full-mode access for writes', async () => {
  const initialList = await app.inject({
    method: 'GET',
    url: '/api/bots',
  });

  assert.equal(initialList.statusCode, 200);
  assert.equal(initialList.json().manageEnabled, false);
  assert.equal(Array.isArray(initialList.json().items), true);
  assert.equal(initialList.json().items.length >= 1, true);

  const setup = await app.inject({
    method: 'POST',
    url: '/api/intelligence-mode/setup-full',
    payload: {
      code: '123456',
      label: 'bot-manage',
    },
  });
  assert.equal(setup.statusCode, 200);

  const deniedCreate = await app.inject({
    method: 'POST',
    url: '/api/bots',
    payload: {
      name: '企业微信助理',
      visibleLibraryKeys: ['contract'],
    },
  });
  assert.equal(deniedCreate.statusCode, 401);

  const created = await app.inject({
    method: 'POST',
    url: '/api/bots',
    headers: {
      'x-access-key': '123456',
    },
    payload: {
      id: 'wecom-assistant',
      name: '企业微信助理',
      description: '企业微信渠道机器人',
      visibleLibraryKeys: ['contract'],
      channelBindings: [
        { channel: 'web', enabled: true },
        { channel: 'wecom', enabled: true, routeKey: 'corp-default' },
      ],
    },
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().item.id, 'wecom-assistant');

  const managedList = await app.inject({
    method: 'GET',
    url: '/api/bots',
    headers: {
      'x-access-key': '123456',
    },
  });

  assert.equal(managedList.statusCode, 200);
  assert.equal(managedList.json().manageEnabled, true);
  assert.equal(
    managedList.json().items.some((item: { id: string; visibleLibraryKeys?: string[] }) => (
      item.id === 'wecom-assistant' && Array.isArray(item.visibleLibraryKeys)
    )),
    true,
  );

  const updated = await app.inject({
    method: 'PATCH',
    url: '/api/bots/wecom-assistant',
    headers: {
      'x-access-key': '123456',
    },
    payload: {
      isDefault: true,
      includeFailedParseDocuments: true,
    },
  });

  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().item.isDefault, true);
  assert.equal(updated.json().item.includeFailedParseDocuments, true);
});
