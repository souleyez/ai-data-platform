import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-ops-telemetry-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const operationsOverview = await importFresh<typeof import('../src/lib/operations-overview.js')>(
  '../src/lib/operations-overview.js',
);
const reportCenter = await importFresh<typeof import('../src/lib/report-center.js')>(
  '../src/lib/report-center.js',
);

const cacheFile = path.join(storageRoot, 'cache', 'documents-cache.json');
const documentConfigFile = path.join(storageRoot, 'config', 'document-categories.json');
const documentLibrariesFile = path.join(storageRoot, 'config', 'document-libraries.json');
const datasourceDefinitionsFile = path.join(storageRoot, 'config', 'datasources', 'definitions.json');
const datasourceRunsFile = path.join(storageRoot, 'config', 'datasources', 'runs.json');
const queueFile = path.join(storageRoot, 'cache', 'document-deep-parse-queue.json');
const reportStateFile = path.join(storageRoot, 'config', 'report-center.json');
const memorySyncStatusFile = path.join(storageRoot, 'config', 'openclaw-memory-sync-status.json');
const taskRuntimeMetricsFile = path.join(storageRoot, 'config', 'task-runtime-metrics.json');
const webCaptureTasksFile = path.join(storageRoot, 'web-captures', 'tasks.json');

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

async function seedTelemetryState() {
  const generatedAt = '2026-04-07T10:00:00.000Z';
  const staleTime = '2026-04-06T00:00:00.000Z';
  const scanRoot = path.join(storageRoot, 'files');

  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.mkdir(path.dirname(documentConfigFile), { recursive: true });
  await fs.mkdir(path.dirname(datasourceDefinitionsFile), { recursive: true });
  await fs.mkdir(path.dirname(reportStateFile), { recursive: true });
  await fs.mkdir(path.dirname(memorySyncStatusFile), { recursive: true });
  await fs.mkdir(path.dirname(taskRuntimeMetricsFile), { recursive: true });
  await fs.mkdir(path.dirname(webCaptureTasksFile), { recursive: true });

  await fs.writeFile(documentConfigFile, JSON.stringify({
    scanRoot,
    scanRoots: [scanRoot],
    updatedAt: generatedAt,
  }, null, 2), 'utf8');
  await fs.writeFile(documentLibrariesFile, JSON.stringify({
    items: [
      {
        key: 'ioa',
        label: 'IOA',
        permissionLevel: 0,
        knowledgePagesEnabled: false,
        knowledgePagesMode: 'none',
        createdAt: generatedAt,
      },
      {
        key: 'order',
        label: '订单分析',
        permissionLevel: 0,
        knowledgePagesEnabled: false,
        knowledgePagesMode: 'none',
        createdAt: generatedAt,
      },
      {
        key: 'guangzhou-ai',
        label: '广州AI',
        permissionLevel: 0,
        knowledgePagesEnabled: false,
        knowledgePagesMode: 'none',
        createdAt: generatedAt,
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(cacheFile, JSON.stringify({
    generatedAt,
    scanRoot,
    scanRoots: [scanRoot],
    totalFiles: 3,
    scanSignature: 'sig-ops-telemetry',
    indexedPaths: [
      path.join(scanRoot, 'ioa-procedure.docx'),
      path.join(scanRoot, 'bid-spec.pdf'),
      path.join(scanRoot, 'briefing.mp3'),
    ],
    items: [
      {
        path: path.join(scanRoot, 'ioa-procedure.docx'),
        name: 'ioa-procedure.docx',
        ext: '.docx',
        title: 'IOA Procedure',
        category: 'process',
        bizCategory: 'process',
        parseStatus: 'parsed',
        summary: '流程规范摘要',
        excerpt: '流程规范摘要',
        extractedChars: 320,
        groups: ['ioa'],
        confirmedGroups: ['ioa'],
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        markdownText: '# IOA Procedure\n\n流程规范摘要',
        markdownMethod: 'markitdown',
        schemaType: 'procedure',
        topicTags: ['流程', '制度'],
      },
      {
        path: path.join(scanRoot, 'bid-spec.pdf'),
        name: 'bid-spec.pdf',
        ext: '.pdf',
        title: '招标文件',
        category: 'contract',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseMethod: 'pdf-ocr+pdf-vlm',
        summary: '招标控制价与评分办法',
        excerpt: '招标控制价与评分办法',
        fullText: '[PDF VLM understanding]\n\n招标控制价 437.69 万元',
        extractedChars: 120,
        groups: ['order'],
        confirmedGroups: ['order'],
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        schemaType: 'contract',
        topicTags: ['招标', '评分'],
      },
      {
        path: path.join(scanRoot, 'briefing.mp3'),
        name: 'briefing.mp3',
        ext: '.mp3',
        title: 'Briefing Audio',
        category: 'meeting',
        bizCategory: 'general',
        parseStatus: 'error',
        parseMethod: 'audio-markdown',
        summary: '音频详细解析失败',
        excerpt: '音频详细解析失败',
        extractedChars: 0,
        groups: ['ioa'],
        confirmedGroups: ['ioa'],
        parseStage: 'detailed',
        detailParseStatus: 'failed',
        markdownError: 'markitdown-unavailable',
        schemaType: 'generic',
        topicTags: ['音频'],
      },
    ],
  }, null, 2), 'utf8');

  await fs.writeFile(datasourceDefinitionsFile, JSON.stringify({
    items: [
      {
        id: 'ds-footfall',
        name: '广州AI客流',
        kind: 'web_public',
        status: 'active',
        targetLibraries: [{ key: 'guangzhou-ai', label: '广州AI', mode: 'primary' }],
        schedule: { kind: 'daily', timezone: 'Asia/Shanghai', maxItemsPerRun: 10 },
        authMode: 'none',
        config: { url: 'https://example.com/footfall.xlsx', focus: '客流' },
        createdAt: generatedAt,
        updatedAt: generatedAt,
        lastRunAt: staleTime,
        nextRunAt: generatedAt,
        lastStatus: 'failed',
        lastSummary: '最近采集失败',
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(datasourceRunsFile, JSON.stringify({
    items: [
      {
        id: 'run-3',
        datasourceId: 'ds-footfall',
        startedAt: '2026-04-07T09:00:00.000Z',
        finishedAt: '2026-04-07T09:05:00.000Z',
        status: 'failed',
        discoveredCount: 1,
        capturedCount: 0,
        ingestedCount: 0,
        failedCount: 1,
        documentIds: [],
        libraryKeys: ['guangzhou-ai'],
        summary: '第三次失败',
        errorMessage: 'timeout',
      },
      {
        id: 'run-2',
        datasourceId: 'ds-footfall',
        startedAt: '2026-04-07T08:00:00.000Z',
        finishedAt: '2026-04-07T08:04:00.000Z',
        status: 'failed',
        discoveredCount: 1,
        capturedCount: 0,
        ingestedCount: 0,
        failedCount: 1,
        documentIds: [],
        libraryKeys: ['guangzhou-ai'],
        summary: '第二次失败',
        errorMessage: 'timeout',
      },
      {
        id: 'run-1',
        datasourceId: 'ds-footfall',
        startedAt: '2026-04-07T07:00:00.000Z',
        finishedAt: '2026-04-07T07:06:00.000Z',
        status: 'failed',
        discoveredCount: 1,
        capturedCount: 0,
        ingestedCount: 0,
        failedCount: 1,
        documentIds: [],
        libraryKeys: ['guangzhou-ai'],
        summary: '第一次失败',
        errorMessage: 'timeout',
      },
    ],
  }, null, 2), 'utf8');

  await fs.writeFile(queueFile, JSON.stringify({
    updatedAt: generatedAt,
    items: Array.from({ length: 24 }, (_, index) => ({
      path: path.join(scanRoot, `queued-${index + 1}.docx`),
      status: 'queued',
      queuedAt: generatedAt,
      attempts: 0,
    })),
  }, null, 2), 'utf8');

  await fs.writeFile(reportStateFile, JSON.stringify({
    version: reportCenter.REPORT_STATE_VERSION,
    groups: [],
    templates: [],
    outputs: [
      {
        id: 'report-dynamic-1',
        groupKey: 'order',
        groupLabel: '订单分析',
        templateKey: 'shared-static-page-default',
        templateLabel: '默认静态页',
        title: '动态经营页',
        outputType: 'page',
        kind: 'page',
        createdAt: staleTime,
        status: 'ready',
        summary: 'stale summary',
        triggerSource: 'chat',
        page: {
          summary: 'stale page',
          cards: [],
          sections: [{ title: 'AI综合分析', body: 'existing analysis', bullets: [] }],
          charts: [],
        },
        libraries: [{ key: 'order', label: '订单分析' }],
        dynamicSource: {
          enabled: true,
          request: '生成动态页',
          outputType: 'page',
          libraries: [{ key: 'order', label: '订单分析' }],
          lastRenderedAt: staleTime,
        },
      },
      {
        id: 'report-draft-blocked-1',
        groupKey: 'ioa',
        groupLabel: 'IOA',
        templateKey: 'shared-static-page-default',
        templateLabel: '默认静态页',
        title: '阻塞草稿页',
        outputType: 'page',
        kind: 'page',
        createdAt: generatedAt,
        status: 'draft_reviewing',
        summary: 'draft summary',
        triggerSource: 'chat',
        page: {
          summary: 'draft page',
          cards: [],
          sections: [{ title: '页面摘要', body: '只有摘要。', bullets: [] }],
          charts: [],
        },
        draft: {
          reviewStatus: 'draft_reviewing',
          version: 2,
          readiness: 'blocked',
          mustHaveModules: ['能力模块'],
          missingMustHaveModules: ['能力模块'],
          qualityChecklist: [
            { key: 'must-have-modules', label: '关键模块完整度', status: 'fail', detail: '缺少关键模块：能力模块', blocking: true },
          ],
          modules: [
            {
              moduleId: 'draftmod-hero',
              moduleType: 'hero',
              title: '页面摘要',
              purpose: '开场摘要',
              contentDraft: '只有摘要。',
              evidenceRefs: ['page.summary'],
              enabled: true,
              status: 'generated',
              order: 0,
              layoutType: 'hero',
            },
          ],
        },
      },
    ],
  }, null, 2), 'utf8');

  await fs.writeFile(memorySyncStatusFile, JSON.stringify({
    status: 'success',
    lastRequestedAt: staleTime,
    lastStartedAt: staleTime,
    lastFinishedAt: staleTime,
    lastSuccessAt: staleTime,
    lastErrorAt: '',
    lastErrorMessage: '',
    pendingReasons: [],
    lastReasons: ['document-cache-write'],
    lastResult: {
      generatedAt,
      libraryCount: 1,
      documentCount: 1,
      templateCount: 0,
      outputCount: 1,
      changeCount: 1,
      changedThisRun: 1,
    },
  }, null, 2), 'utf8');

  await fs.writeFile(taskRuntimeMetricsFile, JSON.stringify({
    updatedAt: generatedAt,
    items: [
      {
        family: 'deep-parse',
        status: 'running',
        queuedCount: 24,
        processingCount: 1,
        retryCount: 0,
        skipCount: 0,
        lastRequestedAt: generatedAt,
        lastStartedAt: generatedAt,
        lastFinishedAt: '',
        lastSuccessAt: '',
        lastFailureAt: '',
        lastSkippedAt: '',
        lastDurationMs: 0,
        avgDurationMs: 4500,
        lastErrorMessage: '',
        lastMessage: 'processing queue',
        recentDurationsMs: [4200, 4800],
      },
      {
        family: 'memory-sync',
        status: 'success',
        queuedCount: 0,
        processingCount: 0,
        retryCount: 0,
        skipCount: 0,
        lastRequestedAt: staleTime,
        lastStartedAt: staleTime,
        lastFinishedAt: staleTime,
        lastSuccessAt: staleTime,
        lastFailureAt: '',
        lastSkippedAt: '',
        lastDurationMs: 2300,
        avgDurationMs: 2300,
        lastErrorMessage: '',
        lastMessage: 'document-cache-write',
        recentDurationsMs: [2300],
      },
      {
        family: 'dataviz',
        status: 'skipped',
        queuedCount: 0,
        processingCount: 0,
        retryCount: 0,
        skipCount: 2,
        lastRequestedAt: generatedAt,
        lastStartedAt: '',
        lastFinishedAt: generatedAt,
        lastSuccessAt: '',
        lastFailureAt: '',
        lastSkippedAt: generatedAt,
        lastDurationMs: 0,
        avgDurationMs: 0,
        lastErrorMessage: '',
        lastMessage: 'renderer-unavailable',
        recentDurationsMs: [],
      },
    ],
  }, null, 2), 'utf8');

  await fs.writeFile(webCaptureTasksFile, JSON.stringify({
    items: [
      {
        id: 'capture-1',
        url: 'https://example.com/listing',
        focus: '客流',
        frequency: 'daily',
        createdAt: generatedAt,
        updatedAt: generatedAt,
        lastRunAt: generatedAt,
        lastStatus: 'error',
        lastSummary: '采集失败',
        captureStatus: 'active',
      },
    ],
  }, null, 2), 'utf8');
}

test('operations overview should surface phase1 stability telemetry and warnings', async () => {
  await seedTelemetryState();

  const payload = await operationsOverview.loadOperationsOverviewPayload();

  assert.equal(payload.capture.taskSummary.errorTasks, 1);
  assert.equal(payload.parse.queueSummary.queued, 24);
  assert.equal(payload.output.summary.staleDynamicOutputs, 1);
  assert.equal(payload.output.summary.draftOutputs, 1);
  assert.equal(payload.output.summary.draftBlockedOutputs, 1);
  assert.equal(payload.output.benchmark.totals.drafts, 1);
  assert.equal(payload.output.benchmark.totals.blocked, 1);
  assert.equal(payload.output.benchmark.scenarios.length, 1);
  assert.equal(payload.stability.summary.deepParseBacklog, 24);
  assert.equal(payload.stability.summary.datasourceFailedRuns, 3);
  assert.equal(payload.stability.summary.draftBlockedCount, 1);
  assert.equal(payload.stability.failures.datavizStatus, 'skipped');
  assert.equal(payload.parse.markdownSummary.canonicalReady, 2);
  assert.equal(payload.parse.markdownSummary.markdownReady, 1);
  assert.equal(payload.parse.markdownSummary.markdownFailed, 1);
  assert.equal(payload.parse.markdownSummary.vlmFallbackCount, 1);
  assert.equal(payload.parse.markdownSummary.audioParseFailedCount, 1);
  assert.ok(payload.stability.warnings.some((item: { key: string }) => item.key === 'deep-parse-backlog-warning'));
  assert.ok(payload.stability.warnings.some((item: { key: string }) => item.key === 'datasource-failed-runs-warning'));
  assert.ok(payload.stability.warnings.some((item: { key: string }) => item.key === 'capture-error-tasks-warning'));
  assert.ok(payload.stability.warnings.some((item: { key: string }) => item.key === 'memory-sync-stale-critical'));
  assert.ok(payload.stability.warnings.some((item: { key: string }) => item.key === 'dataviz-runtime-warning'));
  assert.ok(payload.stability.warnings.some((item: { key: string }) => item.key === 'draft-output-blocked-warning'));
});
