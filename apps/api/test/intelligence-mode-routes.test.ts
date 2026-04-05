import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-intelligence-mode-'));
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

test('intelligence mode should default to service and allow first full-mode setup', async () => {
  const initial = await app.inject({
    method: 'GET',
    url: '/api/intelligence-mode',
  });

  assert.equal(initial.statusCode, 200);
  assert.equal(initial.json().mode, 'service');
  assert.equal(initial.json().capabilities.canModifyLocalSystemFiles, false);
  assert.equal(initial.json().accessKeys.initialized, false);

  const setup = await app.inject({
    method: 'POST',
    url: '/api/intelligence-mode/setup-full',
    payload: {
      code: '123456',
      label: '桌面完全智能',
    },
  });

  assert.equal(setup.statusCode, 200);
  assert.equal(setup.json().mode, 'full');
  assert.equal(setup.json().capabilities.canModifyLocalSystemFiles, true);
  assert.equal(setup.json().accessKeys.initialized, true);
  assert.equal(setup.json().item.code, '123456');

  const disable = await app.inject({
    method: 'POST',
    url: '/api/intelligence-mode/disable-full',
  });

  assert.equal(disable.statusCode, 200);
  assert.equal(disable.json().mode, 'service');
  assert.equal(disable.json().capabilities.canModifyLocalSystemFiles, false);

  const enable = await app.inject({
    method: 'POST',
    url: '/api/intelligence-mode/enable-full',
    payload: {
      code: '123456',
    },
  });

  assert.equal(enable.statusCode, 200);
  assert.equal(enable.json().mode, 'full');
  assert.equal(enable.json().capabilities.canModifyLocalSystemFiles, true);
});

test('access key routes should require x-access-key after initialization', async () => {
  const listDenied = await app.inject({
    method: 'GET',
    url: '/api/access-keys',
  });

  assert.equal(listDenied.statusCode, 401);

  const verified = await app.inject({
    method: 'POST',
    url: '/api/access-keys/verify',
    payload: {
      code: '123456',
    },
  });

  assert.equal(verified.statusCode, 200);
  assert.equal(verified.json().status, 'verified');

  const listed = await app.inject({
    method: 'GET',
    url: '/api/access-keys',
    headers: {
      'x-access-key': '123456',
    },
  });

  assert.equal(listed.statusCode, 200);
  assert.equal(Array.isArray(listed.json().items), true);
  assert.equal(listed.json().items.length, 1);
});

test('root and health endpoints should expose current intelligence mode', async () => {
  const root = await app.inject({
    method: 'GET',
    url: '/',
  });
  const health = await app.inject({
    method: 'GET',
    url: '/api/health',
  });

  assert.equal(root.statusCode, 200);
  assert.equal(root.json().intelligenceMode, 'full');
  assert.equal(root.json().capabilities.canModifyLocalSystemFiles, true);

  assert.equal(health.statusCode, 200);
  assert.equal(health.json().mode, 'full');
  assert.equal(health.json().readOnly, false);
  assert.equal(health.json().intelligenceMode, 'full');
  assert.equal(health.json().capabilities.canModifyLocalSystemFiles, true);
});
