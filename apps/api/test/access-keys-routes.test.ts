import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-access-key-routes-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const appModule = await importFresh<typeof import('../src/app.js')>('../src/app.js');
const app = appModule.createApp();

test.after(async () => {
  await app.close();
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('access key routes should bootstrap, verify and manage keys with the same code', async () => {
  const initialStatus = await app.inject({
    method: 'GET',
    url: '/api/access-keys/status',
  });

  assert.equal(initialStatus.statusCode, 200);
  assert.equal(initialStatus.json().initialized, false);

  const bootstrap = await app.inject({
    method: 'POST',
    url: '/api/access-keys',
    payload: {
      code: '246810',
      label: 'Bootstrap',
    },
  });

  assert.equal(bootstrap.statusCode, 200);
  assert.equal(bootstrap.json().status, 'initialized');
  assert.equal(bootstrap.json().item.code, '246810');

  const verify = await app.inject({
    method: 'POST',
    url: '/api/access-keys/verify',
    payload: {
      code: '246810',
    },
  });

  assert.equal(verify.statusCode, 200);
  assert.equal(verify.json().status, 'verified');

  const listUnauthorized = await app.inject({
    method: 'GET',
    url: '/api/access-keys',
  });

  assert.equal(listUnauthorized.statusCode, 401);

  const listAuthorized = await app.inject({
    method: 'GET',
    url: '/api/access-keys',
    headers: {
      'x-access-key': '246810',
    },
  });

  assert.equal(listAuthorized.statusCode, 200);
  assert.equal(listAuthorized.json().items.length, 1);

  const createSecond = await app.inject({
    method: 'POST',
    url: '/api/access-keys',
    headers: {
      'x-access-key': '246810',
    },
    payload: {
      label: 'Second',
    },
  });

  assert.equal(createSecond.statusCode, 200);
  assert.equal(createSecond.json().status, 'created');

  const removeSecond = await app.inject({
    method: 'DELETE',
    url: `/api/access-keys/${createSecond.json().item.id}`,
    headers: {
      'x-access-key': '246810',
    },
  });

  assert.equal(removeSecond.statusCode, 200);
  assert.equal(removeSecond.json().status, 'deleted');
});
