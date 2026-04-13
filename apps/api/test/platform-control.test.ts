import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
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
const auditCenter = await importFresh<typeof import('../src/lib/audit-center.js')>(
  '../src/lib/audit-center.js',
);
const platformControl = await importFresh<typeof import('../src/lib/platform-control.js')>(
  '../src/lib/platform-control.js',
);
const documentLibraries = await importFresh<typeof import('../src/lib/document-libraries.js')>(
  '../src/lib/document-libraries.js',
);
const documentCacheRepository = await importFresh<typeof import('../src/lib/document-cache-repository.js')>(
  '../src/lib/document-cache-repository.js',
);
const documentConfig = await importFresh<typeof import('../src/lib/document-config.js')>(
  '../src/lib/document-config.js',
);
const documentStore = await importFresh<typeof import('../src/lib/document-store.js')>(
  '../src/lib/document-store.js',
);
const documentDeepParseQueue = await importFresh<typeof import('../src/lib/document-deep-parse-queue.js')>(
  '../src/lib/document-deep-parse-queue.js',
);
const documentUploadIngest = await importFresh<typeof import('../src/lib/document-upload-ingest.js')>(
  '../src/lib/document-upload-ingest.js',
);
const reportCenter = await importFresh<typeof import('../src/lib/report-center.js')>(
  '../src/lib/report-center.js',
);
const syncStatusFile = path.join(storageRoot, 'config', 'openclaw-memory-sync-status.json');

async function startHtmlServer(routes: Record<string, string>) {
  const server = http.createServer((request, response) => {
    const body = routes[request.url || '/'];
    if (!body) {
      response.statusCode = 404;
      response.end('not found');
      return;
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(body);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to start html server');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function removeDirWithRetry(targetPath: string, attempts = 8) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (
        index === attempts - 1
        || !(error && typeof error === 'object' && 'code' in error)
        || !['ENOTEMPTY', 'EPERM', 'EBUSY'].includes(String((error as { code?: string }).code || ''))
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * (index + 1)));
    }
  }
}

test.after(async () => {
  await removeDirWithRetry(storageRoot);
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
  const runId = ((runsResult.data?.items as Array<{ id?: string }>)?.[0]?.id || '');
  assert.ok(runId);

  const deleteRunResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'delete-run',
    '--run',
    runId,
  ]);
  assert.equal(deleteRunResult.ok, true);
  assert.equal(deleteRunResult.action, 'datasources.delete-run');

  const auditSnapshot = await auditCenter.buildAuditSnapshot();
  assert.equal(auditSnapshot.logs[0]?.action, 'delete_datasource_run');
  assert.equal(auditSnapshot.logs[0]?.target, 'External upload intake');
  assert.match(auditSnapshot.logs[0]?.note || '', /已删除运行记录/);

  const runsAfterDelete = await platformControl.executePlatformControlCommand([
    'datasources',
    'runs',
    '--datasource',
    'External upload intake',
    '--limit',
    '3',
  ]);
  assert.equal((runsAfterDelete.data?.items as unknown[])?.length, 0);

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

  const areas = (listResult.data?.areas as Array<{ id?: string; commands?: Array<{ key?: string }> }>) || [];
  const datasourceArea = areas.find((item) => item.id === 'datasources');
  assert.ok(datasourceArea?.commands?.some((item) => item.key === 'datasources.capture-url'));
  assert.ok(datasourceArea?.commands?.some((item) => item.key === 'datasources.create'));
  assert.ok(datasourceArea?.commands?.some((item) => item.key === 'datasources.update'));
  assert.ok(datasourceArea?.commands?.some((item) => item.key === 'datasources.delete'));
  assert.ok(datasourceArea?.commands?.some((item) => item.key === 'datasources.login-capture'));
  assert.ok(datasourceArea?.commands?.some((item) => item.key === 'datasources.web-tasks'));
  assert.ok(datasourceArea?.commands?.some((item) => item.key === 'datasources.run-due'));
  assert.ok(datasourceArea?.commands?.some((item) => item.key === 'datasources.web-run-due'));
  assert.ok(datasourceArea?.commands?.some((item) => item.key === 'datasources.credentials'));
  assert.ok(datasourceArea?.commands?.some((item) => item.key === 'datasources.save-credential'));
  assert.ok(datasourceArea?.commands?.some((item) => item.key === 'datasources.delete-credential'));
  const documentsArea = areas.find((item) => item.id === 'documents');
  assert.ok(documentsArea?.commands?.some((item) => item.key === 'documents.create-library'));
  assert.ok(documentsArea?.commands?.some((item) => item.key === 'documents.update-library'));
  assert.ok(documentsArea?.commands?.some((item) => item.key === 'documents.delete-library'));
  assert.ok(documentsArea?.commands?.some((item) => item.key === 'documents.import-local'));
  assert.ok(documentsArea?.commands?.some((item) => item.key === 'documents.canonical-backfill'));
  const reportsArea = areas.find((item) => item.id === 'reports');
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.templates'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.template-from-document'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.create-template'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.update-template'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.delete-template'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.group-templates'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.set-group-template'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.template-reference-file'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.template-reference-link'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.revise-draft-module'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.revise-draft-structure'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.revise-draft-copy'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.finalize-page'));
  assert.ok(reportsArea?.commands?.some((item) => item.key === 'reports.delete-output'));

  const integrations = (listResult.data?.integrations as Array<{ id?: string }>) || [];
  assert.ok(integrations.some((item) => item.id === 'web-capture'));
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

test('platform control should expose document memory sync status', async () => {
  await fs.mkdir(path.dirname(syncStatusFile), { recursive: true });
  await fs.writeFile(syncStatusFile, JSON.stringify({
    status: 'success',
    lastRequestedAt: '2026-04-03T10:00:00.000Z',
    lastStartedAt: '2026-04-03T10:00:01.000Z',
    lastFinishedAt: '2026-04-03T10:00:02.000Z',
    lastSuccessAt: '2026-04-03T10:00:02.000Z',
    lastErrorAt: '',
    lastErrorMessage: '',
    pendingReasons: [],
    lastReasons: ['document-merge-detailed'],
    lastResult: {
      generatedAt: '2026-04-03T10:00:02.000Z',
      libraryCount: 3,
      documentCount: 12,
      templateCount: 2,
      outputCount: 1,
      changeCount: 4,
      changedThisRun: 2,
    },
  }, null, 2), 'utf8');

  const result = await platformControl.executePlatformControlCommand([
    'documents',
    'sync-status',
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.action, 'documents.sync-status');
  assert.equal((result.data as { status?: string })?.status, 'success');
  assert.equal((result.data as { lastResult?: { documentCount?: number } })?.lastResult?.documentCount, 12);
});

test('platform control should queue canonical markdown backfill candidates into the detailed parse queue', async () => {
  const generatedAt = '2026-04-12T08:00:00.000Z';
  const scanRoot = path.join(storageRoot, 'files');
  const configFile = path.join(storageRoot, 'config', 'document-categories.json');
  const librariesFile = path.join(storageRoot, 'config', 'document-libraries.json');
  const cacheFile = path.join(storageRoot, 'cache', 'documents-cache.json');
  const queueFile = path.join(storageRoot, 'cache', 'document-deep-parse-queue.json');

  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(configFile, JSON.stringify({
    scanRoot,
    scanRoots: [scanRoot],
    updatedAt: generatedAt,
  }, null, 2), 'utf8');
  await fs.writeFile(librariesFile, JSON.stringify({
    items: [
      {
        key: 'ungrouped',
        label: '未分组',
        description: '系统保留未分组文档',
        permissionLevel: 0,
        createdAt: generatedAt,
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(cacheFile, JSON.stringify({
    generatedAt,
    scanRoot,
    scanRoots: [scanRoot],
    totalFiles: 4,
    scanSignature: 'sig-canonical-backfill',
    indexedPaths: [
      path.join(scanRoot, 'legacy.html'),
      path.join(scanRoot, 'note.md'),
      path.join(scanRoot, 'ready.html'),
      path.join(scanRoot, 'failed.mp3'),
    ],
    items: [
      {
        path: path.join(scanRoot, 'legacy.html'),
        name: 'legacy.html',
        ext: '.html',
        title: 'Legacy html',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        fullText: 'Legacy body only',
        summary: 'legacy',
      },
      {
        path: path.join(scanRoot, 'note.md'),
        name: 'note.md',
        ext: '.md',
        title: 'Existing markdown',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseStage: 'quick',
        detailParseStatus: 'queued',
        fullText: '# Title',
        summary: 'note',
      },
      {
        path: path.join(scanRoot, 'ready.html'),
        name: 'ready.html',
        ext: '.html',
        title: 'Ready html',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        fullText: 'Canonical body',
        markdownText: '# Canonical body',
        markdownMethod: 'markitdown',
        summary: 'ready',
      },
      {
        path: path.join(scanRoot, 'failed.mp3'),
        name: 'failed.mp3',
        ext: '.mp3',
        title: 'Failed audio',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'error',
        parseStage: 'detailed',
        detailParseStatus: 'failed',
        summary: 'failed',
        markdownError: 'markitdown-unavailable',
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(queueFile, JSON.stringify({
    updatedAt: generatedAt,
    items: [],
  }, null, 2), 'utf8');

  const result = await platformControl.executePlatformControlCommand([
    'documents',
    'canonical-backfill',
    '--limit',
    '10',
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.action, 'documents.canonical-backfill');
  assert.equal((result.data as { matchedCount?: number })?.matchedCount, 3);
  assert.equal((result.data as { queuedCount?: number })?.queuedCount, 3);

  const queueState = await documentDeepParseQueue.readDetailedParseQueueState();
  const queuedPaths = queueState.items.map((item) => item.path).sort();
  assert.deepEqual(queuedPaths, [
    path.join(scanRoot, 'failed.mp3'),
    path.join(scanRoot, 'legacy.html'),
    path.join(scanRoot, 'note.md'),
  ]);
});

test('platform control should finalize one static-page draft into a ready output', async () => {
  const library = await documentLibraries.createDocumentLibrary({
    name: 'ops-draft',
    description: 'Operations draft library',
    permissionLevel: 0,
  });
  const state = await reportCenter.loadReportCenterState();
  const group = state.groups[0];
  assert.ok(group);

  const draftRecord = await reportCenter.createReportOutput({
    groupKey: group.key,
    title: '经营静态页草稿',
    triggerSource: 'chat',
    kind: 'page',
    page: {
      summary: '本周经营总览',
      sections: [
        { title: '经营概览', body: '收入稳定增长。', bullets: ['转化率提升'] },
      ],
      cards: [{ label: '订单', value: '128', note: '环比 +12%' }],
    },
    libraries: [{ key: library.key, label: library.label }],
  });

  assert.equal(draftRecord.status, 'draft_generated');

  const draftCopyResult = await platformControl.executePlatformControlCommand([
    'reports',
    'revise-draft-copy',
    '--output',
    draftRecord.id,
    '--instruction',
    '整体改成更客户化语气，并压缩字数。',
  ]);
  assert.equal(draftCopyResult.ok, true);
  assert.equal(draftCopyResult.action, 'reports.revise-draft-copy');

  const finalizeResult = await platformControl.executePlatformControlCommand([
    'reports',
    'finalize-page',
    '--output',
    draftRecord.id,
  ]);

  assert.equal(finalizeResult.ok, true);
  assert.equal(finalizeResult.action, 'reports.finalize-page');
  assert.equal((finalizeResult.data?.item as { status?: string })?.status, 'ready');

  const outputsResult = await platformControl.executePlatformControlCommand([
    'reports',
    'outputs',
    '--library',
    library.label,
    '--limit',
    '10',
  ]);
  const matched = ((outputsResult.data?.items as Array<{ id?: string; status?: string }>) || [])
    .find((item) => item.id === draftRecord.id);
  assert.equal(matched?.status, 'ready');
});

test('platform control should capture one url into the requested knowledge library', async () => {
  await documentLibraries.createDocumentLibrary({ name: 'bids', description: 'Bid knowledge base', permissionLevel: 0 }).catch(() => undefined);
  const server = await startHtmlServer({
    '/capture': `
      <html>
        <head><title>医疗设备采购公告</title></head>
        <body>
          <article>
            <h1>医疗设备采购公告</h1>
            <p>本公告包含采购范围、投标资格、交付节点与验收要求。</p>
            <p>适合作为标书资料沉淀到 bids 知识库。</p>
          </article>
        </body>
      </html>
    `,
  });

  try {
    const result = await platformControl.executePlatformControlCommand([
      'datasources',
      'capture-url',
      '--url',
      `${server.baseUrl}/capture`,
      '--focus',
      '标书相关内容',
      '--library',
      'bids',
      '--name',
      'Medical bids capture',
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.action, 'datasources.capture-url');
    assert.match(result.summary, /Captured URL/);
    assert.equal((result.data?.datasource as { name?: string })?.name, 'Medical bids capture');
    assert.equal((result.data?.captureStatus as string), 'success');
    assert.equal((result.data?.successCount as number), 1);

    const cache = await documentCacheRepository.readDocumentCache();
    assert.ok(
      cache?.items.some((item) =>
        String(item.path || '').includes(`${path.sep}web-captures${path.sep}`)
        && (item.confirmedGroups || []).includes('bids')),
    );
  } finally {
    await server.close();
  }
});

test('platform control should promote a document-center file into a reusable report template', async () => {
  const library = await documentLibraries.createDocumentLibrary({
    name: 'bids',
    description: 'Bid knowledge base',
    permissionLevel: 0,
  }).catch(async () => {
    const libraries = await documentLibraries.loadDocumentLibraries();
    return libraries.find((item) => item.key === 'bids')!;
  });

  const uploadDir = path.join(storageRoot, 'files', 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, '投标模板.md');
  await fs.writeFile(filePath, '# 投标模板\n\n## 项目概况\n\n- 示例段落', 'utf8');

  const config = await documentConfig.loadDocumentCategoryConfig(documentStore.DEFAULT_SCAN_DIR);
  const libraries = await documentLibraries.loadDocumentLibraries();
  await documentUploadIngest.ingestExistingLocalFiles({
    filePaths: [filePath],
    documentConfig: config,
    libraries,
    forcedLibraryKeys: [library.key],
    preferredLibraryKeys: [library.key],
  });

  const documentId = documentStore.buildDocumentId(filePath);
  const result = await platformControl.executePlatformControlCommand([
    'reports',
    'template-from-document',
    '--document',
    documentId,
    '--label',
    '投标输出模板',
    '--type',
    'static-page',
    '--layout',
    'risk-brief',
    '--default',
    'true',
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.action, 'reports.template-from-document');
  assert.equal((result.data?.template as { label?: string })?.label, '投标输出模板');
  assert.equal((result.data?.template as { preferredLayoutVariant?: string })?.preferredLayoutVariant, 'risk-brief');
  assert.equal((result.data?.document as { id?: string })?.id, documentId);

  const templatesResult = await platformControl.executePlatformControlCommand([
    'reports',
    'templates',
    '--type',
    'static-page',
  ]);
  assert.equal(templatesResult.ok, true);
  assert.equal(templatesResult.action, 'reports.templates');
  assert.ok(
    ((templatesResult.data?.items as Array<{ label?: string }>) || [])
      .some((item) => item.label === '投标输出模板'),
  );
});

test('platform control should manage dataset libraries and import local files', async () => {
  const createLibraryResult = await platformControl.executePlatformControlCommand([
    'documents',
    'create-library',
    '--name',
    '采集测试库',
    '--description',
    '用于 CLI 采集导入测试',
    '--permission',
    '1',
  ]);
  assert.equal(createLibraryResult.ok, true);
  assert.equal(createLibraryResult.action, 'documents.create-library');
  const libraryKey = String((createLibraryResult.data?.item as { key?: string })?.key || '');
  assert.ok(libraryKey);

  const updateLibraryResult = await platformControl.executePlatformControlCommand([
    'documents',
    'update-library',
    '--library',
    libraryKey,
    '--label',
    '采集测试库-更新',
    '--permission',
    '2',
  ]);
  assert.equal(updateLibraryResult.ok, true);
  assert.equal(updateLibraryResult.action, 'documents.update-library');
  assert.equal((updateLibraryResult.data?.item as { label?: string })?.label, '采集测试库-更新');

  const localFilePath = path.join(storageRoot, 'local-ingest-source.md');
  await fs.writeFile(localFilePath, '# 本地采集测试\n\n这是一份通过 system:control 导入的数据集文件。', 'utf8');
  const importResult = await platformControl.executePlatformControlCommand([
    'documents',
    'import-local',
    '--path',
    localFilePath,
    '--library',
    libraryKey,
  ]);
  assert.equal(importResult.ok, true);
  assert.equal(importResult.action, 'documents.import-local');
  assert.equal((importResult.data?.summary as { successCount?: number })?.successCount, 1);
  assert.ok(((importResult.data?.confirmedLibraryKeys as string[]) || []).includes(libraryKey));

  const cache = await documentCacheRepository.readDocumentCache();
  assert.ok(
    cache?.items.some((item) =>
      String(item.name || '').includes('local-ingest-source.md')
      && (item.confirmedGroups || []).includes(libraryKey)),
  );

  const deleteLibraryResult = await platformControl.executePlatformControlCommand([
    'documents',
    'delete-library',
    '--library',
    libraryKey,
  ]);
  assert.equal(deleteLibraryResult.ok, true);
  assert.equal(deleteLibraryResult.action, 'documents.delete-library');
  assert.equal((deleteLibraryResult.data?.item as { key?: string })?.key, libraryKey);
});

test('platform control should manage datasource definitions and credentials', async () => {
  await documentLibraries.createDocumentLibrary({
    name: 'source-ops',
    description: 'Datasource control library',
    permissionLevel: 0,
  }).catch(() => undefined);

  const saveCredentialResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'save-credential',
    '--label',
    'CLI API Token',
    '--kind',
    'api_token',
    '--token',
    'secret-token',
  ]);
  assert.equal(saveCredentialResult.ok, true);
  assert.equal(saveCredentialResult.action, 'datasources.save-credential');
  const credentialId = String((saveCredentialResult.data?.item as { id?: string })?.id || '');
  assert.ok(credentialId);

  const credentialsResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'credentials',
  ]);
  assert.equal(credentialsResult.ok, true);
  assert.equal(credentialsResult.action, 'datasources.credentials');
  assert.ok(
    ((credentialsResult.data?.items as Array<{ id?: string }>) || [])
      .some((item) => item.id === credentialId),
  );

  const scanDir = path.join(storageRoot, 'local-datasource');
  await fs.mkdir(scanDir, { recursive: true });
  const createDatasourceResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'create',
    '--name',
    'CLI Local Datasource',
    '--kind',
    'local_directory',
    '--library',
    'source-ops',
    '--path',
    scanDir,
    '--schedule',
    'daily',
  ]);
  assert.equal(createDatasourceResult.ok, true);
  assert.equal(createDatasourceResult.action, 'datasources.create');
  const datasourceId = String((createDatasourceResult.data?.item as { id?: string })?.id || '');
  assert.ok(datasourceId);

  const updateDatasourceResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'update',
    '--datasource',
    datasourceId,
    '--name',
    'CLI Local Datasource Updated',
    '--status',
    'paused',
  ]);
  assert.equal(updateDatasourceResult.ok, true);
  assert.equal(updateDatasourceResult.action, 'datasources.update');
  assert.equal((updateDatasourceResult.data?.item as { status?: string })?.status, 'paused');

  const listDatasourceResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'list',
  ]);
  assert.ok(
    ((listDatasourceResult.data?.items as Array<{ id?: string }>) || [])
      .some((item) => item.id === datasourceId),
  );

  const runDueResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'run-due',
  ]);
  assert.equal(runDueResult.ok, true);
  assert.equal(runDueResult.action, 'datasources.run-due');

  const deleteDatasourceResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'delete',
    '--datasource',
    datasourceId,
  ]);
  assert.equal(deleteDatasourceResult.ok, true);
  assert.equal(deleteDatasourceResult.action, 'datasources.delete');

  const deleteCredentialResult = await platformControl.executePlatformControlCommand([
    'datasources',
    'delete-credential',
    '--credential',
    credentialId,
  ]);
  assert.equal(deleteCredentialResult.ok, true);
  assert.equal(deleteCredentialResult.action, 'datasources.delete-credential');
});

test('platform control should run authenticated capture and expose web tasks', async () => {
  await documentLibraries.createDocumentLibrary({
    name: '登录采集库',
    description: 'Authenticated capture library',
    permissionLevel: 0,
  }).catch(() => undefined);

  const server = await startHtmlServer({
    '/secure-capture': `
      <html>
        <head><title>登录后采购公告</title></head>
        <body>
          <article>
            <h1>登录后采购公告</h1>
            <p>这是需要登录态抓取的测试正文。</p>
          </article>
        </body>
      </html>
    `,
  });

  try {
    const loginCaptureResult = await platformControl.executePlatformControlCommand([
      'datasources',
      'login-capture',
      '--url',
      `${server.baseUrl}/secure-capture`,
      '--username',
      'tester',
      '--password',
      'secret',
      '--remember',
      'true',
      '--library',
      '登录采集库',
      '--name',
      'Secure bids capture',
    ]);
    assert.equal(loginCaptureResult.ok, true);
    assert.equal(loginCaptureResult.action, 'datasources.login-capture');
    assert.equal((loginCaptureResult.data?.captureStatus as string), 'error');
    assert.match(String(loginCaptureResult.data?.captureSummary || ''), /login form not detected/i);

    const webTasksResult = await platformControl.executePlatformControlCommand([
      'datasources',
      'web-tasks',
    ]);
    assert.equal(webTasksResult.ok, true);
    assert.equal(webTasksResult.action, 'datasources.web-tasks');
    assert.ok(
      ((webTasksResult.data?.items as Array<{ url?: string }>) || [])
        .some((item) => item.url === `${server.baseUrl}/secure-capture`),
    );

    const webRunDueResult = await platformControl.executePlatformControlCommand([
      'datasources',
      'web-run-due',
    ]);
    assert.equal(webRunDueResult.ok, true);
    assert.equal(webRunDueResult.action, 'datasources.web-run-due');
  } finally {
    await server.close();
  }
});

test('platform control should manage reusable templates and saved outputs', async () => {
  await documentLibraries.createDocumentLibrary({
    name: 'bids',
    description: 'Bid knowledge base',
    permissionLevel: 0,
  }).catch(() => undefined);

  const createTemplateResult = await platformControl.executePlatformControlCommand([
    'reports',
    'create-template',
    '--label',
    'CLI投标模板',
    '--type',
    'static-page',
    '--description',
    '通过 CLI 创建的投标模板',
    '--layout',
    'risk-brief',
    '--default',
    'true',
  ]);
  assert.equal(createTemplateResult.ok, true);
  assert.equal(createTemplateResult.action, 'reports.create-template');
  const createdTemplateKey = String((createTemplateResult.data?.template as { key?: string })?.key || '');
  assert.ok(createdTemplateKey);
  assert.equal((createTemplateResult.data?.template as { preferredLayoutVariant?: string })?.preferredLayoutVariant, 'risk-brief');

  const addLinkResult = await platformControl.executePlatformControlCommand([
    'reports',
    'template-reference-link',
    '--template',
    createdTemplateKey,
    '--url',
    'https://example.com/tender-template',
    '--label',
    '招标模板参考链接',
  ]);
  assert.equal(addLinkResult.ok, true);
  assert.equal(addLinkResult.action, 'reports.template-reference-link');
  assert.equal((addLinkResult.data?.reference as { url?: string })?.url, 'https://example.com/tender-template');

  const templateSourcePath = path.join(storageRoot, 'template-source.md');
  await fs.writeFile(templateSourcePath, '# 模板参考', 'utf8');
  const addFileResult = await platformControl.executePlatformControlCommand([
    'reports',
    'template-reference-file',
    '--template',
    createdTemplateKey,
    '--path',
    templateSourcePath,
    '--name',
    '模板参考文件.md',
  ]);
  assert.equal(addFileResult.ok, true);
  assert.equal(addFileResult.action, 'reports.template-reference-file');
  assert.equal((addFileResult.data?.reference as { originalName?: string })?.originalName, '模板参考文件.md');

  const updateTemplateResult = await platformControl.executePlatformControlCommand([
    'reports',
    'update-template',
    '--template',
    createdTemplateKey,
    '--label',
    'CLI投标模板-更新',
    '--description',
    '更新后的模板说明',
    '--layout',
    'operations-cockpit',
    '--default',
    'false',
  ]);
  assert.equal(updateTemplateResult.ok, true);
  assert.equal(updateTemplateResult.action, 'reports.update-template');
  assert.equal((updateTemplateResult.data?.template as { label?: string })?.label, 'CLI投标模板-更新');
  assert.equal((updateTemplateResult.data?.template as { preferredLayoutVariant?: string })?.preferredLayoutVariant, 'operations-cockpit');

  const groupTemplatesResult = await platformControl.executePlatformControlCommand([
    'reports',
    'group-templates',
    '--library',
    'bids',
  ]);
  assert.equal(groupTemplatesResult.ok, true);
  assert.equal(groupTemplatesResult.action, 'reports.group-templates');
  const groupTemplateKey = String(((groupTemplatesResult.data?.items as Array<{ key?: string }>) || [])[0]?.key || '');
  assert.ok(groupTemplateKey);

  const setGroupTemplateResult = await platformControl.executePlatformControlCommand([
    'reports',
    'set-group-template',
    '--library',
    'bids',
    '--template',
    groupTemplateKey,
  ]);
  assert.equal(setGroupTemplateResult.ok, true);
  assert.equal(setGroupTemplateResult.action, 'reports.set-group-template');
  assert.equal((setGroupTemplateResult.data?.group as { defaultTemplateKey?: string })?.defaultTemplateKey, groupTemplateKey);

  const output = await reportCenter.createReportOutput({
    groupKey: 'bids',
    title: 'CLI测试输出',
    triggerSource: 'chat',
    kind: 'md',
    format: 'markdown',
    content: '# 测试输出',
  });
  const outputsBeforeDelete = await platformControl.executePlatformControlCommand([
    'reports',
    'outputs',
    '--library',
    'bids',
  ]);
  assert.ok(
    ((outputsBeforeDelete.data?.items as Array<{ id?: string }>) || [])
      .some((item) => item.id === output.id),
  );

  const deleteOutputResult = await platformControl.executePlatformControlCommand([
    'reports',
    'delete-output',
    '--output',
    output.id,
  ]);
  assert.equal(deleteOutputResult.ok, true);
  assert.equal(deleteOutputResult.action, 'reports.delete-output');

  const outputsAfterDelete = await platformControl.executePlatformControlCommand([
    'reports',
    'outputs',
    '--library',
    'bids',
  ]);
  assert.ok(
    !((outputsAfterDelete.data?.items as Array<{ id?: string }>) || [])
      .some((item) => item.id === output.id),
  );

  const deleteTemplateResult = await platformControl.executePlatformControlCommand([
    'reports',
    'delete-template',
    '--template',
    createdTemplateKey,
  ]);
  assert.equal(deleteTemplateResult.ok, true);
  assert.equal(deleteTemplateResult.action, 'reports.delete-template');

  const templatesAfterDelete = await platformControl.executePlatformControlCommand([
    'reports',
    'templates',
    '--type',
    'document',
  ]);
  assert.ok(
    !((templatesAfterDelete.data?.items as Array<{ key?: string }>) || [])
      .some((item) => item.key === createdTemplateKey),
  );
});
