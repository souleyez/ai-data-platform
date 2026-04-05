import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), 'aidp-platform-integration-test-'),
);
const previousStorageRoot = process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
const previousPlatformToken = process.env.HOME_PLATFORM_TOKEN;

process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;
process.env.HOME_PLATFORM_TOKEN = 'test-home-token';

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const appModule = await importFresh<typeof import('../src/app.js')>(
  '../src/app.js',
);
const app = appModule.createApp();
const statePath = path.join(storageRoot, 'config', 'platform-integration.json');

test.after(async () => {
  await app.close();
  if (previousStorageRoot == null) {
    delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  } else {
    process.env.AI_DATA_PLATFORM_STORAGE_ROOT = previousStorageRoot;
  }

  if (previousPlatformToken == null) {
    delete process.env.HOME_PLATFORM_TOKEN;
  } else {
    process.env.HOME_PLATFORM_TOKEN = previousPlatformToken;
  }

  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('platform health endpoint should require matching token when configured', async () => {
  const unauthorized = await app.inject({
    method: 'GET',
    url: '/internal/platform/health',
  });

  assert.equal(unauthorized.statusCode, 401);
  assert.deepEqual(unauthorized.json(), { error: 'PLATFORM_TOKEN_INVALID' });

  const authorized = await app.inject({
    method: 'GET',
    url: '/internal/platform/health',
    headers: {
      'x-home-platform-token': 'test-home-token',
    },
  });

  assert.equal(authorized.statusCode, 200);
  const payload = authorized.json();
  assert.equal(payload.status, 'ok');
  assert.equal(payload.projectKey, 'ai-data-platform');
  assert.equal(payload.acceptsBroadcast, true);
  assert.deepEqual(payload.capabilities, ['health', 'broadcasts']);
});

test('platform broadcast endpoint should accept, persist, and dedupe broadcasts', async () => {
  const broadcastPayload = {
    broadcastId: 'broadcast-001',
    projectKey: 'ai-data-platform',
    kind: 'system_notice',
    scope: 'global',
    title: 'platform smoke',
    body: 'hello',
    payload: { source: 'test' },
    createdAt: '2026-04-05T10:00:00.000Z',
    expiresAt: null,
    idempotencyKey: 'broadcast-001',
  };

  const first = await app.inject({
    method: 'POST',
    url: '/internal/platform/broadcasts',
    headers: {
      'content-type': 'application/json',
      'x-home-platform-token': 'test-home-token',
    },
    payload: broadcastPayload,
  });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().message, 'queued');

  const duplicate = await app.inject({
    method: 'POST',
    url: '/internal/platform/broadcasts',
    headers: {
      'content-type': 'application/json',
      'x-home-platform-token': 'test-home-token',
    },
    payload: broadcastPayload,
  });

  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().message, 'duplicate ignored');

  const persisted = JSON.parse(await fs.readFile(statePath, 'utf8')) as {
    receipts: Array<{ broadcastId: string; idempotencyKey: string }>;
  };
  assert.equal(persisted.receipts.length, 1);
  assert.equal(persisted.receipts[0]?.broadcastId, 'broadcast-001');
  assert.equal(persisted.receipts[0]?.idempotencyKey, 'broadcast-001');
});
