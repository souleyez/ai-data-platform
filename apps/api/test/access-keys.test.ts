import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-access-keys-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const accessKeys = await importFresh<typeof import('../src/lib/access-keys.js')>(
  '../src/lib/access-keys.js',
);

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('access keys should create, verify and delete numeric keys', async () => {
  const created = await accessKeys.createAccessKey({
    code: '123456',
    label: 'Admin',
  });

  assert.equal(created.code, '123456');
  assert.equal(created.label, 'Admin');

  const verified = await accessKeys.verifyAccessKey('123456');
  assert.equal(verified?.id, created.id);

  const removed = await accessKeys.deleteAccessKey(created.id);
  assert.equal(removed.id, created.id);

  const afterDelete = await accessKeys.verifyAccessKey('123456');
  assert.equal(afterDelete, null);
});

test('access keys should normalize persisted state and auto-generate numeric codes', async () => {
  const normalized = accessKeys.normalizePersistedAccessKeyState({
    items: [
      { id: 'dup-1', code: '8888', label: 'Primary', createdAt: '2026-03-30T00:00:00.000Z' },
      { id: 'dup-1', code: '7777', label: 'Duplicate Id' },
      { id: 'dup-2', code: '8888', label: 'Duplicate Code' },
      { id: 'bad', code: 'abc', label: 'Bad' },
    ],
  });

  assert.equal(normalized.version, accessKeys.ACCESS_KEY_STATE_VERSION);
  assert.equal(normalized.items.length, 1);
  assert.equal(normalized.items[0]?.code, '8888');

  const generated = await accessKeys.createAccessKey({ label: 'Auto' });
  assert.match(generated.code, /^\d{6}$/);
});
