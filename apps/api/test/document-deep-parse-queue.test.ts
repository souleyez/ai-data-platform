import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('applyDetailedParseQueueMetadata should preserve failed status for detailed documents', async () => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-deep-queue-'));
  process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

  const cacheDir = path.join(storageRoot, 'cache');
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(
    path.join(cacheDir, 'document-deep-parse-queue.json'),
    JSON.stringify({
      updatedAt: '2026-04-03T00:00:00.000Z',
      items: [
        {
          path: '/tmp/failed-image.png',
          status: 'failed',
          queuedAt: '2026-04-03T00:00:00.000Z',
          completedAt: '2026-04-03T00:00:02.000Z',
          attempts: 1,
          error: 'ocr-text-not-extracted',
        },
      ],
    }),
    'utf8',
  );

  try {
    const { applyDetailedParseQueueMetadata } = await import('../src/lib/document-deep-parse-queue.js');
    const [item] = await applyDetailedParseQueueMetadata([
      {
        path: '/tmp/failed-image.png',
        name: 'failed-image.png',
        ext: '.png',
        title: 'failed-image',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'error',
        parseMethod: 'image-ocr-empty',
        summary: 'OCR failed',
        excerpt: 'OCR failed',
        fullText: 'OCR text was not extracted from this image.',
        extractedChars: 0,
        evidenceChunks: [],
        entities: [],
        claims: [],
        intentSlots: {},
        topicTags: [],
        groups: [],
        parseStage: 'detailed',
        detailParseStatus: 'failed',
        detailParsedAt: '2026-04-03T00:00:02.000Z',
        detailParseAttempts: 1,
        detailParseError: 'ocr-text-not-extracted',
        schemaType: 'generic',
        structuredProfile: {},
      },
    ]);

    assert.equal(item.detailParseStatus, 'failed');
    assert.equal(item.detailParseError, 'ocr-text-not-extracted');
  } finally {
    delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
    await fs.rm(storageRoot, { recursive: true, force: true });
  }
});

test('runDetailedParseBatch should mark deep-parse runtime metrics when no queued items exist', async () => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-deep-queue-empty-'));
  process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

  try {
    const queueModule = await import(`../src/lib/document-deep-parse-queue.js?t=${Date.now()}-${Math.random()}`);
    const metricsModule = await import(`../src/lib/task-runtime-metrics.js?t=${Date.now()}-${Math.random()}`);

    const result = await queueModule.runDetailedParseBatch(4);
    const metrics = await metricsModule.readTaskRuntimeMetrics();
    const deepParseMetrics = metrics.items.find((item: { family?: string }) => item.family === 'deep-parse');

    assert.equal(result.processedCount, 0);
    assert.equal(result.succeededCount, 0);
    assert.equal(result.failedCount, 0);
    assert.equal(deepParseMetrics?.status, 'skipped');
    assert.equal(deepParseMetrics?.lastMessage, 'no-queued-items');
  } finally {
    delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
    await fs.rm(storageRoot, { recursive: true, force: true });
  }
});
