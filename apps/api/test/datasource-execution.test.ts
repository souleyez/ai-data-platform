import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xlsx from 'xlsx';

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
const documentParser = await importFresh<typeof import('../src/lib/document-parser.js')>(
  '../src/lib/document-parser.js',
);
const documentCacheRepository = await importFresh<typeof import('../src/lib/document-cache-repository.js')>(
  '../src/lib/document-cache-repository.js',
);
const documentLibraries = await importFresh<typeof import('../src/lib/document-libraries.js')>(
  '../src/lib/document-libraries.js',
);

async function startHtmlServer(routes: Record<string, string | { body: string | Buffer; contentType?: string; headers?: Record<string, string> }>) {
  const server = http.createServer((request, response) => {
    const route = routes[request.url || '/'];
    if (!route) {
      response.statusCode = 404;
      response.end('not found');
      return;
    }

    const body = typeof route === 'string' || Buffer.isBuffer(route)
      ? route
      : route.body;
    const contentType = typeof route === 'string' || Buffer.isBuffer(route)
      ? 'text/html; charset=utf-8'
      : route.contentType || 'text/html; charset=utf-8';
    response.statusCode = 200;
    response.setHeader('Content-Type', contentType);
    if (typeof route !== 'string' && !Buffer.isBuffer(route)) {
      Object.entries(route.headers || {}).forEach(([key, value]) => response.setHeader(key, value));
    }
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
  assert.ok((runs[0]?.resultSummaries?.length || 0) >= 11);
  assert.match(runs[0]?.resultSummaries?.[0]?.summary || '', /target|transport|readiness/i);
  assert.match(runs[0]?.resultSummaries?.[1]?.summary || '', /GET \/openapi\/ping|GET \/portal\/login|GET \/snapshot/i);
  assert.ok(
    (runs[0]?.resultSummaries || []).some((item) =>
      item.label === 'capture:objective' && /list_then_detail|portal_export|hybrid/.test(item.summary || ''),
    ),
  );
  assert.ok(
    (runs[0]?.resultSummaries || []).some((item) =>
      item.label === 'capture:orders' && /cursor|dedupe/.test(item.summary || ''),
    ),
  );
  assert.ok(
    (runs[0]?.resultSummaries || []).some((item) =>
      /list_then_detail|portal_export|dashboard_snapshot/.test(item.summary || ''),
    ),
  );
  assert.match(runs[0]?.summary || '', /Order capture contract:/i);
});

test('web_public datasource run should create a successful run with an ingested document', async () => {
  const html = encodeURIComponent('<html><head><title>医疗设备招标公告</title></head><body><header><p>广州采购平台</p><p>第1页 共1页</p></header><article><h1>医疗设备招标公告</h1><p>本次招标涉及影像设备与配套维保服务。</p><p>要求供应商提供安装、培训和验收支持。</p></article><footer><p>广州采购平台</p><p>第1页 共1页</p></footer></body></html>');
  await documentLibraries.createDocumentLibrary({ name: 'bids', description: 'Bid documents', permissionLevel: 0 }).catch(() => undefined);

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
  assert.equal(runs[0]?.resultSummaries?.length, 1);
  assert.ok(runs[0]?.resultSummaries?.[0]?.label);
  assert.match(runs[0]?.resultSummaries?.[0]?.summary || '', /医疗设备招标公告|影像设备|维保服务/i);
  assert.ok(runs[0]?.documentIds[0]);

  const documentPath = runs[0]?.documentIds[0] || '';
  const stat = await fs.stat(documentPath);
  const markdown = await fs.readFile(documentPath, 'utf8');
  const captureSummarySection = markdown.split('## 采集摘要')[1] || '';
  const pageBodySection = markdown.split('## 页面正文')[1] || '';
  const cache = await documentCacheRepository.readDocumentCache();
  assert.ok(stat.isFile());
  assert.match(documentPath, /\.md$/i);
  assert.match(markdown, /## 采集元数据/);
  assert.match(markdown, /## 页面正文/);
  assert.doesNotMatch(captureSummarySection, /第1页 共1页/);
  assert.doesNotMatch(pageBodySection, /第1页 共1页/);
  assert.ok(cache?.items.some((item) => item.path === documentPath && (item.confirmedGroups || []).includes('bids')));

  const items = datasourceService.buildDatasourceRunReadModels({
    runs,
    definitions: await datasourceDefinitions.listDatasourceDefinitions(),
    libraryLabelMap: datasourceService.buildDatasourceLibraryLabelMap([{ key: 'bids', label: '标书' }]),
    documentSummaryMap: new Map(),
  });
  assert.equal(items[0]?.documentSummaries?.length, 1);
  assert.equal(items[0]?.documentSummaries?.[0]?.label, runs[0]?.resultSummaries?.[0]?.label);
});

test('web_public datasource run should preserve downloadable xlsx captures and keep footfall parsing intact', async () => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ['区域', '设备SN', '通道SN', '位置', '时间', '进入人数', '离开人数'],
    ['商场', 'SN001', 'CH001', '南门', '2026-04-01 10:00:00', 120, 110],
    ['商场', 'SN001', 'CH002', '北门', '2026-04-01 11:00:00', 100, 95],
    ['层一', 'SN002', 'CH010', '中庭', '2026-04-01 10:30:00', 80, 70],
    ['停车', 'SN003', 'CH020', '停车场入口', '2026-04-01 10:45:00', 60, 55],
  ]), '4月');
  const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const server = await startHtmlServer({
    '/gaoming-footfall': {
      body: fileBuffer,
      contentType: 'application/octet-stream',
      headers: {
        'Content-Disposition': "attachment; filename*=UTF-8''%E9%AB%98%E6%98%8E%E4%B8%AD%E6%B8%AF%E5%9F%8E%E5%AE%A2%E6%B5%81.xlsx",
      },
    },
  });

  try {
    await documentLibraries.createDocumentLibrary({ name: 'guangzhou-ai', description: 'Mall footfall library', permissionLevel: 0 }).catch(() => undefined);
    await datasourceDefinitions.upsertDatasourceDefinition({
      id: 'ds-web-footfall',
      name: 'Gaoming footfall collector',
      kind: 'web_public',
      status: 'active',
      targetLibraries: [{ key: 'guangzhou-ai', label: '广州AI', mode: 'primary' }],
      schedule: { kind: 'manual', maxItemsPerRun: 1 },
      authMode: 'none',
      config: {
        url: `${server.baseUrl}/gaoming-footfall`,
        focus: '客流报表 商场分区汇总',
        maxItems: 1,
      },
    });

    const result = await datasourceExecution.runDatasourceDefinition('ds-web-footfall');
    const runs = await datasourceDefinitions.listDatasourceRuns('ds-web-footfall');
    const documentPath = runs[0]?.documentIds[0] || '';
    const markdownPath = String(result.task?.markdownPath || '').trim();
    const markdown = markdownPath ? await fs.readFile(markdownPath, 'utf8') : '';
    const cache = await documentCacheRepository.readDocumentCache();
    const parsed = await documentParser.parseDocument(documentPath);

    assert.equal(result.run?.status, 'success');
    assert.equal(runs[0]?.ingestedCount, 1);
    assert.match(documentPath, /\.xlsx$/i);
    assert.match(runs[0]?.summary || '', /可下载文件|XLSX/i);
    assert.ok(markdownPath);
    assert.match(markdownPath, /-normalized\.md$/i);
    assert.match(markdown, /## 提取摘要/);
    assert.match(markdown, /工作表：4月|商场/);
    assert.ok(cache?.items.some((item) => item.path === documentPath && (item.confirmedGroups || []).includes('guangzhou-ai')));
    assert.equal(parsed.bizCategory, 'footfall');
    assert.equal(parsed.footfallFields?.aggregationLevel, 'mall-zone');
    assert.equal(parsed.footfallFields?.totalFootfall, '360');
    assert.equal(parsed.footfallFields?.topMallZone, '商场');
  } finally {
    await server.close();
  }
});

test('web_discovery datasource run should discover listing-detail entries and preserve discovery config', async () => {
  const server = await startHtmlServer({
    '/listing': `
      <html><head><title>广州公共资源交易中心列表</title></head><body>
        <a href="/detail-a">广州医疗设备采购公告（第一批）</a>
        <a href="/detail-b">广州体外诊断项目中标结果公告</a>
        <a href="/help">服务指南</a>
      </body></html>
    `,
    '/seed-2': `
      <html><head><title>广州公共资源交易中心结果列表</title></head><body>
        <a href="/detail-b">广州体外诊断项目中标结果公告</a>
        <a href="/detail-c">广州影像设备补充更正公告</a>
      </body></html>
    `,
    '/detail-a': `
      <html><head><title>广州医疗设备采购公告（第一批）</title></head><body>
        <article>
          <p>本次公告围绕广州医疗设备采购项目，明确采购范围、交付周期、响应要求和评审标准，适合作为招标详情页样本。</p>
          <p>项目要求供应商提供影像设备与配套维保服务，并说明项目预算、资格条件、采购单位和开标安排。</p>
        </article>
      </body></html>
    `,
    '/detail-b': `
      <html><head><title>广州体外诊断项目中标结果公告</title></head><body>
        <article>
          <p>本次结果公告汇总广州体外诊断项目的成交供应商、报价结果、评审结论和履约节点，属于典型的交易结果详情页。</p>
          <p>公告同时列出了采购单位、项目编号、中标金额和服务范围，适合落入 bids 发现链路。</p>
        </article>
      </body></html>
    `,
    '/detail-c': `
      <html><head><title>广州影像设备补充更正公告</title></head><body>
        <article>
          <p>补充更正公告说明了影像设备项目参数修订、答疑要点和时间调整，可作为关联发现的候选条目。</p>
        </article>
      </body></html>
    `,
    '/help': '<html><head><title>服务指南</title></head><body><p>帮助中心</p></body></html>',
  });

  try {
    await datasourceDefinitions.upsertDatasourceDefinition({
      id: 'ds-web-discovery',
      name: 'Guangzhou bids discovery',
      kind: 'web_discovery',
      status: 'active',
      targetLibraries: [{ key: 'bids', label: 'bids', mode: 'primary' }],
      schedule: { kind: 'manual', maxItemsPerRun: 2 },
      authMode: 'none',
      config: {
        url: `${server.baseUrl}/listing`,
        focus: '广州 医疗设备 采购 公告',
        maxItems: 2,
        keywords: ['医疗设备', '体外诊断'],
        siteHints: ['listing-detail', '公告列表'],
        seedUrls: [`${server.baseUrl}/listing`, `${server.baseUrl}/seed-2`],
        crawlMode: 'listing-detail',
      },
    });

    const result = await datasourceExecution.runDatasourceDefinition('ds-web-discovery');
    const runs = await datasourceDefinitions.listDatasourceRuns('ds-web-discovery');
    const latestDefinition = await datasourceDefinitions.getDatasourceDefinition('ds-web-discovery');

    assert.equal(result.run?.status, 'success');
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.ingestedCount, 1);
    assert.equal(runs[0]?.resultSummaries?.length, 2);
    assert.ok((runs[0]?.resultSummaries || []).every((item) => /公告|结果/.test(item.label)));
    assert.ok((runs[0]?.resultSummaries || []).every((item) => !/服务指南/.test(item.label)));
    assert.doesNotMatch(runs[0]?.summary || '', /did not find listing\/detail candidates/i);
    assert.equal(latestDefinition?.kind, 'web_discovery');
    assert.equal(String(latestDefinition?.config?.crawlMode || ''), 'listing-detail');
    assert.deepEqual(latestDefinition?.config?.keywords, ['医疗设备', '体外诊断']);
    assert.deepEqual(latestDefinition?.config?.siteHints, ['listing-detail', '公告列表']);
    assert.deepEqual(latestDefinition?.config?.seedUrls, [`${server.baseUrl}/listing`, `${server.baseUrl}/seed-2`]);
  } finally {
    await server.close();
  }
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
