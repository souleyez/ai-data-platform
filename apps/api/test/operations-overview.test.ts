import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-ops-overview-test-'));
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
const queueFile = path.join(storageRoot, 'cache', 'document-deep-parse-queue.json');
const reportStateFile = path.join(storageRoot, 'config', 'report-center.json');

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
});

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function seedState() {
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  const generatedAt = '2026-04-07T10:00:00.000Z';
  const scanRoot = path.join(storageRoot, 'files');
  await fs.mkdir(path.dirname(documentConfigFile), { recursive: true });
  await fs.writeFile(documentConfigFile, JSON.stringify({
    scanRoot,
    scanRoots: [scanRoot],
    updatedAt: generatedAt,
  }, null, 2), 'utf8');
  await fs.writeFile(cacheFile, JSON.stringify({
    generatedAt,
    scanRoot,
    scanRoots: [scanRoot],
    totalFiles: 1,
    scanSignature: 'sig-ops-1',
    indexedPaths: [path.join(scanRoot, 'order-report.xlsx')],
    items: [
      {
        path: path.join(scanRoot, 'order-report.xlsx'),
        name: 'order-report.xlsx',
        ext: '.xlsx',
        title: 'Order report',
        category: 'report',
        bizCategory: 'order',
        parseStatus: 'parsed',
        summary: '订单经营概览',
        excerpt: '订单经营概览',
        extractedChars: 160,
        groups: ['order'],
        confirmedGroups: ['order'],
        parseStage: 'quick',
        schemaType: 'order',
        topicTags: ['订单', '经营'],
        structuredProfile: {
          reportFocus: 'order',
        },
      },
    ],
  }, null, 2), 'utf8');

  await fs.mkdir(path.dirname(reportStateFile), { recursive: true });
  await fs.writeFile(reportStateFile, JSON.stringify({
    version: reportCenter.REPORT_STATE_VERSION,
    groups: [],
    templates: [],
    outputs: [
      {
        id: 'report-dynamic-order-1',
        groupKey: 'order',
        groupLabel: '订单分析',
        templateKey: 'shared-static-page-default',
        templateLabel: '默认静态页',
        title: '订单动态页',
        outputType: 'page',
        kind: 'page',
        format: 'md',
        createdAt: '2026-04-07T10:05:00.000Z',
        status: 'ready',
        summary: 'stale summary',
        triggerSource: 'chat',
        content: 'stale content',
        page: {
          summary: 'stale page',
          cards: [],
          sections: [
            { title: 'AI综合分析', body: 'existing analysis', bullets: [] },
          ],
          charts: [],
        },
        libraries: [{ key: 'order', label: '订单分析' }],
        dynamicSource: {
          enabled: true,
          request: '按订单情况生成静态页',
          outputType: 'page',
          conceptMode: true,
          libraries: [{ key: 'order', label: '订单分析' }],
          sourceFingerprint: '',
        },
      },
    ],
  }, null, 2), 'utf8');
}

test('operations overview should stay read-only for documents and dynamic report outputs', async () => {
  await seedState();
  const rawBefore = await fs.readFile(reportStateFile, 'utf8');

  const payload = await operationsOverview.loadOperationsOverviewPayload();
  const rawAfter = await fs.readFile(reportStateFile, 'utf8');

  assert.equal(rawAfter, rawBefore);
  assert.equal(await fileExists(queueFile), false);
  assert.equal(payload.parse.scanSummary.cacheHit, true);
  assert.equal(payload.output.summary.outputs, 1);
  assert.equal(payload.capture.runSummary.totalRuns, 0);
  assert.equal(Array.isArray(payload.runtime.tasks), true);
});
