import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-datasource-routes-delete-run-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const datasourceDefinitions = await importFresh<typeof import('../src/lib/datasource-definitions.js')>(
  '../src/lib/datasource-definitions.js',
);
const auditCenter = await importFresh<typeof import('../src/lib/audit-center.js')>(
  '../src/lib/audit-center.js',
);
const appModule = await importFresh<typeof import('../src/app.js')>(
  '../src/app.js',
);
const app = appModule.createApp();

test.after(async () => {
  await app.close();
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('datasource delete-run route should remove the run and append an audit log entry', async () => {
  await datasourceDefinitions.upsertDatasourceDefinition({
    id: 'ds-route-delete-run',
    name: 'Route delete run demo',
    kind: 'upload_public',
    status: 'active',
    targetLibraries: [{ key: 'resume', label: '简历', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'none',
    config: {},
  });

  await datasourceDefinitions.appendDatasourceRun({
    id: 'run-route-delete-old',
    datasourceId: 'ds-route-delete-run',
    startedAt: '2026-04-08T01:00:00.000Z',
    finishedAt: '2026-04-08T01:02:00.000Z',
    status: 'success',
    discoveredCount: 1,
    capturedCount: 1,
    ingestedCount: 1,
    documentIds: ['C:\\temp\\older.md'],
    libraryKeys: ['resume'],
    summary: 'older route run',
  });
  await datasourceDefinitions.appendDatasourceRun({
    id: 'run-route-delete-new',
    datasourceId: 'ds-route-delete-run',
    startedAt: '2026-04-08T02:00:00.000Z',
    finishedAt: '2026-04-08T02:05:00.000Z',
    status: 'failed',
    discoveredCount: 1,
    capturedCount: 1,
    ingestedCount: 0,
    documentIds: [],
    libraryKeys: ['resume'],
    summary: 'newest route run',
    errorMessage: 'latest failed',
  });

  const response = await app.inject({
    method: 'DELETE',
    url: '/api/datasources/runs/run-route-delete-new',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, 'deleted');

  const runs = await datasourceDefinitions.listDatasourceRuns('ds-route-delete-run');
  const definition = await datasourceDefinitions.getDatasourceDefinition('ds-route-delete-run');
  const auditSnapshot = await auditCenter.buildAuditSnapshot();

  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.id, 'run-route-delete-old');
  assert.equal(definition?.lastStatus, 'success');
  assert.equal(auditSnapshot.logs[0]?.action, 'delete_datasource_run');
  assert.equal(auditSnapshot.logs[0]?.target, 'Route delete run demo');
  assert.match(auditSnapshot.logs[0]?.note || '', /回退至最近保留记录 run-route-delete-old/);
});
