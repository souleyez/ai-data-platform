import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-datasource-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const datasourceDefinitions = await importFresh<typeof import('../src/lib/datasource-definitions.js')>(
  '../src/lib/datasource-definitions.js',
);
const datasourceExecution = await importFresh<typeof import('../src/lib/datasource-execution.js')>(
  '../src/lib/datasource-execution.js',
);
const datasourceService = await importFresh<typeof import('../src/lib/datasource-service.js')>(
  '../src/lib/datasource-service.js',
);

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('upload_public datasource run should create a partial run and update definition runtime', async () => {
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

  const result = await datasourceExecution.runDatasourceDefinition('ds-upload-public');
  const latestDefinition = await datasourceDefinitions.getDatasourceDefinition('ds-upload-public');

  assert.equal(result.run?.status, 'partial');
  assert.deepEqual(result.run?.libraryKeys, ['bids']);
  assert.equal(latestDefinition?.lastStatus, 'partial');
  assert.ok(latestDefinition?.lastRunAt);
  assert.ok((result.run?.summary || '').length > 0);
});

test('paused datasource should not execute', async () => {
  await datasourceDefinitions.upsertDatasourceDefinition({
    id: 'ds-upload-paused',
    name: 'Paused upload intake',
    kind: 'upload_public',
    status: 'paused',
    targetLibraries: [{ key: 'resume', label: '简历', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'none',
    config: {},
  });

  await assert.rejects(
    datasourceExecution.runDatasourceDefinition('ds-upload-paused'),
    /paused datasource definition cannot be run until activated/i,
  );

  const runs = await datasourceDefinitions.listDatasourceRuns('ds-upload-paused');
  assert.equal(runs.length, 0);
});

test('database datasource run should emit readonly execution summaries', async () => {
  await datasourceDefinitions.upsertDatasourceDefinition({
    id: 'ds-db-run',
    name: 'Order warehouse',
    kind: 'database',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: '订单分析', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'database_password',
    config: {
      url: 'postgresql://demo:secret@localhost:5432/ops_dw',
      focus: '最近30天订单 客诉 库存',
    },
  });

  const result = await datasourceExecution.runDatasourceDefinition('ds-db-run');
  const runs = await datasourceDefinitions.listDatasourceRuns('ds-db-run');

  assert.equal(result.run?.status, 'success');
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.resultSummaries?.length, 8);
  assert.match(runs[0]?.resultSummaries?.[0]?.summary || '', /target|connection|readiness/i);
  assert.match(runs[0]?.resultSummaries?.[1]?.summary || '', /SELECT 1/);
  assert.match(runs[0]?.resultSummaries?.[3]?.summary || '', /READ ONLY|transaction_read_only/i);

  const items = datasourceService.buildDatasourceRunReadModels({
    runs,
    definitions: await datasourceDefinitions.listDatasourceDefinitions(),
    libraryLabelMap: datasourceService.buildDatasourceLibraryLabelMap([{ key: 'orders', label: '订单分析' }]),
    documentSummaryMap: new Map(),
  });
  assert.equal(items[0]?.documentSummaries?.length, 8);
  assert.ok(items[0]?.documentLabels?.includes('orders'));
});

test('erp datasource run should emit readonly module summaries', async () => {
  await datasourceDefinitions.upsertDatasourceDefinition({
    id: 'ds-erp-run',
    name: 'ERP order backend',
    kind: 'erp',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: '订单分析', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'api_token',
    config: {
      url: 'https://erp.example.com/openapi',
      focus: '订单 客诉 库存',
    },
  });

  const result = await datasourceExecution.runDatasourceDefinition('ds-erp-run');
  const runs = await datasourceDefinitions.listDatasourceRuns('ds-erp-run');

  assert.equal(result.run?.status, 'success');
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.resultSummaries?.length, 8);
  assert.match(runs[0]?.resultSummaries?.[0]?.summary || '', /target|transport|readiness/i);
  assert.match(runs[0]?.resultSummaries?.[1]?.summary || '', /GET \/openapi\/ping|GET \/portal\/login|GET \/snapshot/i);
  assert.ok(
    (runs[0]?.resultSummaries || []).some((item) =>
      /list_then_detail|portal_export|dashboard_snapshot/.test(item.summary || ''),
    ),
  );
});

test('web_public datasource run should create a successful run with an ingested document', async () => {
  const html = encodeURIComponent('<html><head><title>医疗设备招标公告</title></head><body><article><h1>医疗设备招标公告</h1><p>本次招标涉及影像设备与配套维保服务。</p></article></body></html>');

  await datasourceDefinitions.upsertDatasourceDefinition({
    id: 'ds-web-public',
    name: 'Medical bids collector',
    kind: 'web_public',
    status: 'active',
    targetLibraries: [{ key: 'bids', label: '标书', mode: 'primary' }],
    schedule: { kind: 'manual', maxItemsPerRun: 1 },
    authMode: 'none',
    config: {
      url: `data:text/html,${html}`,
      focus: '招标公告 正文',
      maxItems: 1,
    },
  });

  const result = await datasourceExecution.runDatasourceDefinition('ds-web-public');
  const runs = await datasourceDefinitions.listDatasourceRuns('ds-web-public');

  assert.equal(result.run?.status, 'success');
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.ingestedCount, 1);
  assert.equal(runs[0]?.documentIds.length, 1);
  assert.ok(runs[0]?.documentIds[0]);

  const documentPath = runs[0]?.documentIds[0] || '';
  const stat = await fs.stat(documentPath);
  assert.ok(stat.isFile());
});

test('datasource run read model should expose datasourceName, libraryLabels, documentLabels and document summaries', async () => {
  const runDocumentPath = 'C:\\temp\\exports\\resume-company-table.md';
  const runs = [
    {
      id: 'run-1',
      datasourceId: 'ds-run-model',
      startedAt: '2026-03-28T01:00:00.000Z',
      finishedAt: '2026-03-28T01:05:00.000Z',
      status: 'success',
      discoveredCount: 2,
      capturedCount: 2,
      ingestedCount: 1,
      documentIds: [runDocumentPath],
      libraryKeys: ['resume'],
      summary: 'One resume ingest finished.',
      errorMessage: '',
    },
  ];
  const definitions = [
    {
      id: 'ds-run-model',
      name: 'Resume intake',
      kind: 'upload_public',
      status: 'active',
      targetLibraries: [{ key: 'resume', label: '简历', mode: 'primary' }],
      schedule: { kind: 'manual' },
      authMode: 'none',
      config: { uploadToken: 'upl_testtoken' },
      notes: '',
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:00.000Z',
      lastRunAt: '',
      nextRunAt: '',
      lastStatus: undefined,
      lastSummary: '',
    },
  ];
  const libraryLabelMap = datasourceService.buildDatasourceLibraryLabelMap([{ key: 'resume', label: '简历' }]);
  const documentSummaryMap = datasourceService.buildDatasourceDocumentSummaryMap([
    {
      path: runDocumentPath,
      title: 'Resume company table',
      summary: 'Summarizes IT project experience by company from uploaded resumes.',
    },
  ]);

  const items = datasourceService.buildDatasourceRunReadModels({
    runs,
    definitions,
    libraryLabelMap,
    documentSummaryMap,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.datasourceName, 'Resume intake');
  assert.deepEqual(items[0]?.libraryLabels, ['简历']);
  assert.deepEqual(items[0]?.documentLabels, ['resume-company-table.md']);
  assert.equal(items[0]?.documentSummaries?.[0]?.label, 'Resume company table');
  assert.match(items[0]?.documentSummaries?.[0]?.summary || '', /IT project/i);
});
