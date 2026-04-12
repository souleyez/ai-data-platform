import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-runtime-state-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const datasourceStateRepository = await importFresh<typeof import('../src/lib/datasource-state-repository.js')>(
  '../src/lib/datasource-state-repository.js',
);
const webCapture = await importFresh<typeof import('../src/lib/web-capture.js')>(
  '../src/lib/web-capture.js',
);
const reportCenter = await importFresh<typeof import('../src/lib/report-center.js')>(
  '../src/lib/report-center.js',
);
const memorySync = await importFresh<typeof import('../src/lib/openclaw-memory-sync.js')>(
  '../src/lib/openclaw-memory-sync.js',
);
const documentCacheRepository = await importFresh<typeof import('../src/lib/document-cache-repository.js')>(
  '../src/lib/document-cache-repository.js',
);
const documentDeepParseQueue = await importFresh<typeof import('../src/lib/document-deep-parse-queue.js')>(
  '../src/lib/document-deep-parse-queue.js',
);
const retainedDocuments = await importFresh<typeof import('../src/lib/retained-documents.js')>(
  '../src/lib/retained-documents.js',
);
const documentAnswerUsage = await importFresh<typeof import('../src/lib/document-answer-usage.js')>(
  '../src/lib/document-answer-usage.js',
);
const openclawMemorySelection = await importFresh<typeof import('../src/lib/openclaw-memory-selection.js')>(
  '../src/lib/openclaw-memory-selection.js',
);
const runtimeStateFile = await importFresh<typeof import('../src/lib/runtime-state-file.js')>(
  '../src/lib/runtime-state-file.js',
);
const runtimeStateManifest = await importFresh<typeof import('../src/lib/runtime-state-manifest.js')>(
  '../src/lib/runtime-state-manifest.js',
);

const definitionsFile = path.join(storageRoot, 'config', 'datasources', 'definitions.json');
const webCaptureTasksFile = path.join(storageRoot, 'web-captures', 'tasks.json');
const reportStateFile = path.join(storageRoot, 'config', 'report-center.json');
const memorySyncStatusFile = path.join(storageRoot, 'config', 'openclaw-memory-sync-status.json');
const librariesFile = path.join(storageRoot, 'config', 'document-libraries.json');
const documentCacheFile = path.join(storageRoot, 'cache', 'documents-cache.json');
const deepParseQueueFile = path.join(storageRoot, 'cache', 'document-deep-parse-queue.json');
const retainedDocumentsFile = path.join(storageRoot, 'config', 'retained-documents.json');
const answerUsageFile = path.join(storageRoot, 'config', 'document-answer-usage.json');
const memoryCatalogFile = path.join(storageRoot, 'config', 'openclaw-memory-catalog.json');

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('runtime state manifest should describe unique owned runtime files', () => {
  const manifest = runtimeStateManifest.listRuntimeStateManifest();
  const keys = manifest.map((item) => item.key);
  const filePaths = manifest.map((item) => item.filePath);

  assert.ok(keys.includes('datasource-definitions'));
  assert.ok(keys.includes('datasource-runs'));
  assert.ok(keys.includes('report-center'));
  assert.ok(keys.includes('memory-sync-status'));
  assert.ok(keys.includes('task-runtime-metrics'));
  assert.ok(keys.includes('document-deep-parse-queue'));
  assert.ok(keys.includes('retained-documents'));
  assert.ok(keys.includes('document-answer-usage'));
  assert.ok(keys.includes('openclaw-memory-catalog'));
  assert.ok(keys.includes('bot-memory-catalogs'));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(filePaths).size, filePaths.length);
});

test('datasource state repository should create backups and recover from corrupted main payload', async () => {
  await datasourceStateRepository.writeDatasourceDefinitionPayload([
    {
      id: 'ds-one',
      name: 'Datasource One',
      kind: 'upload_public',
      status: 'active',
      targetLibraries: [{ key: 'order', label: '订单分析', mode: 'primary' }],
      schedule: { kind: 'manual' },
      authMode: 'none',
      config: {},
      createdAt: '2026-04-07T00:00:00.000Z',
      updatedAt: '2026-04-07T00:00:00.000Z',
    },
  ]);
  await datasourceStateRepository.writeDatasourceDefinitionPayload([
    {
      id: 'ds-two',
      name: 'Datasource Two',
      kind: 'upload_public',
      status: 'active',
      targetLibraries: [{ key: 'order', label: '订单分析', mode: 'primary' }],
      schedule: { kind: 'manual' },
      authMode: 'none',
      config: {},
      createdAt: '2026-04-07T00:10:00.000Z',
      updatedAt: '2026-04-07T00:10:00.000Z',
    },
  ]);

  const backupFile = runtimeStateFile.buildRuntimeStateBackupPath(definitionsFile);
  const backupRaw = await fs.readFile(backupFile, 'utf8');
  assert.match(backupRaw, /ds-one/);

  await fs.writeFile(definitionsFile, '{bad json', 'utf8');
  const recovered = await datasourceStateRepository.readDatasourceDefinitionPayload();
  assert.equal(recovered?.items?.[0]?.id, 'ds-one');
});

test('web capture, report center, and memory sync repositories should recover from backup payloads', async () => {
  const webBackupFile = runtimeStateFile.buildRuntimeStateBackupPath(webCaptureTasksFile);
  const reportBackupFile = runtimeStateFile.buildRuntimeStateBackupPath(reportStateFile);
  const syncBackupFile = runtimeStateFile.buildRuntimeStateBackupPath(memorySyncStatusFile);
  const cacheBackupFile = runtimeStateFile.buildRuntimeStateBackupPath(documentCacheFile);

  await fs.mkdir(path.dirname(webCaptureTasksFile), { recursive: true });
  await fs.mkdir(path.dirname(reportStateFile), { recursive: true });
  await fs.mkdir(path.dirname(memorySyncStatusFile), { recursive: true });
  await fs.mkdir(path.dirname(documentCacheFile), { recursive: true });
  await fs.writeFile(librariesFile, JSON.stringify({
    items: [
      {
        key: 'order',
        label: '订单分析',
        description: '订单与库存运营资料',
        permissionLevel: 0,
        createdAt: '2026-04-07T00:00:00.000Z',
      },
    ],
  }, null, 2), 'utf8');

  await fs.writeFile(webBackupFile, JSON.stringify({
    items: [
      {
        id: 'web-1',
        url: 'https://example.com/capture',
        focus: '客流',
        frequency: 'daily',
        createdAt: '2026-04-07T01:00:00.000Z',
        updatedAt: '2026-04-07T01:00:00.000Z',
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(webCaptureTasksFile, '{bad json', 'utf8');

  await fs.writeFile(reportBackupFile, JSON.stringify({
    version: reportCenter.REPORT_STATE_VERSION,
    groups: [],
    templates: [],
    outputs: [
      {
        id: 'report-1',
        groupKey: 'order',
        groupLabel: '订单分析',
        templateKey: 'shared-static-page-default',
        templateLabel: '默认静态页',
        title: 'Recovered report',
        outputType: 'page',
        kind: 'page',
        createdAt: '2026-04-07T01:05:00.000Z',
        status: 'ready',
        summary: 'Recovered report summary',
        triggerSource: 'chat',
        page: {
          summary: 'Recovered page',
          cards: [],
          sections: [{ title: 'AI综合分析', body: 'Recovered', bullets: [] }],
          charts: [],
        },
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(reportStateFile, '{bad json', 'utf8');

  await fs.writeFile(syncBackupFile, JSON.stringify({
    status: 'success',
    lastRequestedAt: '2026-04-07T01:10:00.000Z',
    lastStartedAt: '2026-04-07T01:10:00.000Z',
    lastFinishedAt: '2026-04-07T01:10:05.000Z',
    lastSuccessAt: '2026-04-07T01:10:05.000Z',
    pendingReasons: ['document-cache-write'],
    lastReasons: ['manual'],
    lastResult: {
      generatedAt: '2026-04-07T01:10:05.000Z',
      libraryCount: 2,
      documentCount: 5,
      templateCount: 1,
      outputCount: 1,
      changeCount: 3,
      changedThisRun: 2,
    },
  }, null, 2), 'utf8');
  await fs.writeFile(memorySyncStatusFile, '{bad json', 'utf8');

  await fs.writeFile(cacheBackupFile, JSON.stringify({
    generatedAt: '2026-04-07T01:15:00.000Z',
    scanRoot: path.join(storageRoot, 'files'),
    scanRoots: [path.join(storageRoot, 'files')],
    totalFiles: 1,
    scanSignature: 'cache-backup',
    indexedPaths: [path.join(storageRoot, 'files', 'backup.docx')],
    items: [
      {
        path: path.join(storageRoot, 'files', 'backup.docx'),
        name: 'backup.docx',
        ext: '.docx',
        title: 'Backup doc',
        category: 'contract',
        bizCategory: 'contract',
        parseStatus: 'parsed',
        summary: 'Backup summary',
        excerpt: 'Backup summary',
        extractedChars: 12,
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(documentCacheFile, '{bad json', 'utf8');

  const tasks = await webCapture.listWebCaptureTasks();
  const state = await reportCenter.loadReportCenterReadState();
  const syncStatus = await memorySync.readOpenClawMemorySyncStatus();
  const cache = await documentCacheRepository.readDocumentCache();

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.id, 'web-1');
  assert.equal(state.outputs.length, 1);
  assert.equal(state.outputs[0]?.id, 'report-1');
  assert.equal(syncStatus.status, 'success');
  assert.equal(syncStatus.lastResult?.documentCount, 5);
  assert.equal(cache?.items.length, 1);
  assert.equal(cache?.items[0]?.name, 'backup.docx');
});

test('deep parse queue, retained documents, answer usage, and memory catalog should recover from backup payloads', async () => {
  const deepParseBackupFile = runtimeStateFile.buildRuntimeStateBackupPath(deepParseQueueFile);
  const retainedBackupFile = runtimeStateFile.buildRuntimeStateBackupPath(retainedDocumentsFile);
  const answerUsageBackupFile = runtimeStateFile.buildRuntimeStateBackupPath(answerUsageFile);
  const memoryCatalogBackupFile = runtimeStateFile.buildRuntimeStateBackupPath(memoryCatalogFile);
  const docOnePath = path.join(storageRoot, 'files', 'doc-one.docx');
  const docTwoPath = path.join(storageRoot, 'files', 'doc-two.docx');

  await documentDeepParseQueue.enqueueDetailedParse([docOnePath]);
  await documentDeepParseQueue.enqueueDetailedParse([docTwoPath]);
  await fs.access(deepParseBackupFile);
  await fs.writeFile(deepParseQueueFile, '{bad json', 'utf8');

  await retainedDocuments.saveRetainedDocuments([
    {
      path: docOnePath,
      name: 'doc-one.docx',
      title: 'Doc One',
      retentionStatus: 'structured-only',
      retainedAt: '2026-04-07T02:00:00.000Z',
      originalDeletedAt: '2026-04-07T02:00:00.000Z',
    } as never,
  ]);
  await retainedDocuments.saveRetainedDocuments([
    {
      path: docTwoPath,
      name: 'doc-two.docx',
      title: 'Doc Two',
      retentionStatus: 'structured-only',
      retainedAt: '2026-04-07T02:05:00.000Z',
      originalDeletedAt: '2026-04-07T02:05:00.000Z',
    } as never,
  ]);
  await fs.access(retainedBackupFile);
  await fs.writeFile(retainedDocumentsFile, '{bad json', 'utf8');

  await documentAnswerUsage.recordDocumentAnswerUsage({
    traceId: 'trace-1',
    botId: 'bot-1',
    sessionUser: 'tester',
    references: [{ id: 'doc-one', path: docOnePath, name: 'Doc One' }],
  });
  await documentAnswerUsage.recordDocumentAnswerUsage({
    traceId: 'trace-2',
    botId: 'bot-1',
    sessionUser: 'tester',
    references: [{ id: 'doc-two', path: docTwoPath, name: 'Doc Two' }],
  });
  await fs.access(answerUsageBackupFile);
  await fs.writeFile(answerUsageFile, '{bad json', 'utf8');

  await fs.mkdir(path.dirname(memoryCatalogFile), { recursive: true });
  await fs.writeFile(memoryCatalogBackupFile, JSON.stringify({
    version: 1,
    generatedAt: '2026-04-07T02:10:00.000Z',
    documents: {
      'memory-doc-1': {
        id: 'memory-doc-1',
        title: 'Memory Doc One',
        summary: 'Recovered memory catalog entry',
        libraryKeys: ['ioa'],
        availability: 'available',
        updatedAt: '2026-04-07T02:10:00.000Z',
      },
    },
    recentChanges: [],
  }, null, 2), 'utf8');
  await fs.writeFile(memoryCatalogFile, '{bad json', 'utf8');

  const recoveredQueue = await documentDeepParseQueue.readDetailedParseQueueState();
  const recoveredRetainedDocuments = await retainedDocuments.loadRetainedDocuments();
  const recoveredAnswerUsage = await documentAnswerUsage.loadDocumentAnswerUsageState();
  const recoveredMemoryCatalog = await openclawMemorySelection.loadOpenClawMemorySelectionState();

  assert.equal(recoveredQueue.items.length, 1);
  assert.equal(recoveredQueue.items[0]?.path, docOnePath);
  assert.equal(recoveredRetainedDocuments.length, 1);
  assert.equal(recoveredRetainedDocuments[0]?.path, docOnePath);
  assert.equal(recoveredAnswerUsage.items.length, 1);
  assert.equal(recoveredAnswerUsage.items[0]?.documentId, 'doc-one');
  assert.equal(recoveredMemoryCatalog?.documents?.['memory-doc-1']?.title, 'Memory Doc One');
});

test('runtime state file writes should serialize concurrent updates to the same file', async () => {
  const concurrentFile = path.join(storageRoot, 'config', 'concurrent-state.json');
  const originalNow = Date.now;
  Date.now = () => 1776000000000;

  try {
    await Promise.all(
      Array.from({ length: 16 }, (_, index) => runtimeStateFile.writeRuntimeStateJson({
        filePath: concurrentFile,
        payload: {
          value: index,
          label: `state-${index}`,
        },
      })),
    );
  } finally {
    Date.now = originalNow;
  }

  const raw = await fs.readFile(concurrentFile, 'utf8');
  const parsed = JSON.parse(raw) as { value: number; label: string };
  assert.equal(typeof parsed.value, 'number');
  assert.match(parsed.label, /^state-\d+$/);
});
