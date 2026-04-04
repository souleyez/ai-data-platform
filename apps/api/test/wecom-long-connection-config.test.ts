import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-wecom-long-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const moduleUnderTest = await importFresh<typeof import('../src/lib/wecom-long-connection-config.js')>(
  '../src/lib/wecom-long-connection-config.js',
);

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('listWecomLongConnectionConfigs should keep enabled items and dedupe by externalBotId', async () => {
  const configDir = path.join(storageRoot, 'config');
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, 'wecom-long-connections.json'),
    JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      items: [
        {
          externalBotId: 'bot-storage-1',
          secret: 'secret-1',
          enabled: true,
        },
        {
          externalBotId: 'bot-storage-1',
          secret: 'secret-1-duplicate',
          enabled: true,
        },
        {
          externalBotId: 'bot-storage-2',
          secret: 'secret-2',
          enabled: false,
        },
      ],
    }, null, 2),
    'utf8',
  );

  const items = await moduleUnderTest.listWecomLongConnectionConfigs();
  assert.deepEqual(items, [
    {
      externalBotId: 'bot-storage-1',
      secret: 'secret-1',
      enabled: true,
      wsUrl: undefined,
    },
  ]);
});
