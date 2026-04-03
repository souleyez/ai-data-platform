import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-platform-control-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const datasourceDefinitions = await importFresh<typeof import('../src/lib/datasource-definitions.js')>(
  '../src/lib/datasource-definitions.js',
);
const platformControl = await importFresh<typeof import('../src/lib/platform-control.js')>(
  '../src/lib/platform-control.js',
);

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('platform control should run, pause, activate, and list datasource runs', async () => {
  await datasourceDefinitions.upsertDatasourceDefinition({
    id: 'ds-upload-public',
    name: 'External upload intake',
    kind: 'upload_public',
    status: 'active',
    targetLibraries: [{ key: 'bids', label: '标书', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'none',
    config: {},
  });

  const runResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'run',
    '--datasource',
    'External upload intake',
  ]);
  assert.equal(runResult.ok, true);
  assert.equal(runResult.action, 'datasources.run');
  assert.match(runResult.summary, /External upload intake/);

  const runsResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'runs',
    '--datasource',
    'External upload intake',
    '--limit',
    '3',
  ]);
  assert.equal(runsResult.ok, true);
  assert.equal(runsResult.action, 'datasources.runs');
  assert.equal(Array.isArray(runsResult.data?.items), true);
  assert.equal((runsResult.data?.items as unknown[])?.length, 1);

  const pauseResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'pause',
    '--datasource',
    'External upload intake',
  ]);
  assert.equal(pauseResult.ok, true);
  assert.equal(pauseResult.action, 'datasources.pause');
  assert.equal((pauseResult.data?.datasource as { status?: string })?.status, 'paused');

  const activateResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'activate',
    '--datasource',
    'External upload intake',
  ]);
  assert.equal(activateResult.ok, true);
  assert.equal(activateResult.action, 'datasources.activate');
  assert.equal((activateResult.data?.datasource as { status?: string })?.status, 'active');
});

test('platform control should expose capability registry metadata', async () => {
  const listResult = await platformControl.executePlatformControlCommand([
    'capabilities',
    'list',
  ]);
  assert.equal(listResult.ok, true);
  assert.equal(listResult.action, 'capabilities.list');
  assert.equal(Array.isArray(listResult.data?.areas), true);
  assert.equal(Array.isArray(listResult.data?.integrations), true);
  assert.equal(Array.isArray(listResult.data?.outputFormats), true);

  const showAreaResult = await platformControl.executePlatformControlCommand([
    'capabilities',
    'show',
    '--area',
    'reports',
  ]);
  assert.equal(showAreaResult.ok, true);
  assert.equal((showAreaResult.data?.area as { id?: string })?.id, 'reports');

  const showIntegrationResult = await platformControl.executePlatformControlCommand([
    'capabilities',
    'show',
    '--integration',
    'openclaw',
  ]);
  assert.equal(showIntegrationResult.ok, true);
  assert.equal((showIntegrationResult.data?.integration as { id?: string })?.id, 'openclaw');
});

test('platform control should tolerate pnpm forwarded separator args', async () => {
  const result = await platformControl.executePlatformControlCommand([
    '--',
    'capabilities',
    'list',
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.action, 'capabilities.list');
});
