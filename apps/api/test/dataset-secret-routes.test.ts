import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-dataset-secrets-'));
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
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('dataset secret routes should bind, verify, resolve, and shrink grants after unbind', async () => {
  const createdA = await app.inject({
    method: 'POST',
    url: '/api/documents/libraries',
    payload: {
      name: '合同密库',
      secret: 'alpha-secret',
    },
  });
  assert.equal(createdA.statusCode, 200);
  assert.equal(createdA.json().item.secretProtected, true);

  const createdB = await app.inject({
    method: 'POST',
    url: '/api/documents/libraries',
    payload: {
      name: '投标密库',
      secret: 'alpha-secret',
    },
  });
  assert.equal(createdB.statusCode, 200);
  assert.equal(createdB.json().item.secretProtected, true);

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/dataset-secrets/verify',
    payload: {
      secret: 'wrong-secret',
    },
  });
  assert.equal(invalid.statusCode, 401);

  const verified = await app.inject({
    method: 'POST',
    url: '/api/dataset-secrets/verify',
    payload: {
      secret: 'alpha-secret',
    },
  });
  assert.equal(verified.statusCode, 200);
  assert.deepEqual(verified.json().libraryKeys.sort(), [
    createdA.json().item.key,
    createdB.json().item.key,
  ].sort());

  const createdC = await app.inject({
    method: 'POST',
    url: '/api/documents/libraries',
    payload: {
      name: '归档密库',
      datasetSecretGrants: [verified.json().grant],
      activeDatasetSecretGrant: verified.json().grant,
    },
  });
  assert.equal(createdC.statusCode, 200);
  assert.equal(createdC.json().item.secretProtected, true);

  const resolved = await app.inject({
    method: 'POST',
    url: '/api/dataset-secrets/resolve',
    payload: {
      grants: [verified.json().grant],
      activeGrant: verified.json().grant,
    },
  });
  assert.equal(resolved.statusCode, 200);
  assert.deepEqual(resolved.json().unlockedLibraryKeys.sort(), [
    createdA.json().item.key,
    createdB.json().item.key,
    createdC.json().item.key,
  ].sort());

  const cleared = await app.inject({
    method: 'PATCH',
    url: `/api/documents/libraries/${encodeURIComponent(createdA.json().item.key)}`,
    payload: {
      clearSecret: true,
    },
  });
  assert.equal(cleared.statusCode, 200);
  assert.equal(
    cleared.json().items.find((item: { key: string; secretProtected: boolean }) => item.key === createdA.json().item.key)?.secretProtected,
    false,
  );

  const resolvedAfterClear = await app.inject({
    method: 'POST',
    url: '/api/dataset-secrets/resolve',
    payload: {
      grants: [verified.json().grant],
      activeGrant: verified.json().grant,
    },
  });
  assert.equal(resolvedAfterClear.statusCode, 200);
  assert.deepEqual(resolvedAfterClear.json().unlockedLibraryKeys.sort(), [
    createdB.json().item.key,
    createdC.json().item.key,
  ].sort());
  assert.deepEqual(resolvedAfterClear.json().activeLibraryKeys.sort(), [
    createdB.json().item.key,
    createdC.json().item.key,
  ].sort());
});
