import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-task-metrics-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const metrics = await importFresh<typeof import('../src/lib/task-runtime-metrics.js')>(
  '../src/lib/task-runtime-metrics.js',
);

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('task runtime metrics should record lifecycle transitions and duration averages', async () => {
  await metrics.markTaskScheduled('deep-parse', {
    queuedCount: 3,
    lastMessage: 'queued documents',
  });
  await metrics.markTaskStarted('deep-parse', {
    queuedCount: 3,
    processingCount: 2,
    lastMessage: 'processing documents',
  });
  await metrics.markTaskSucceeded('deep-parse', {
    queuedCount: 1,
    processingCount: 0,
    durationMs: 120,
    lastMessage: 'processed 2 documents',
  });
  await metrics.markTaskFailed('deep-parse', 'ocr failed', {
    processingCount: 0,
    durationMs: 60,
    retryDelta: 1,
    lastMessage: 'retry needed',
  });
  await metrics.markTaskSkipped('deep-parse', 'deep-parse-already-running', {
    processingCount: 0,
  });

  const payload = await metrics.readTaskRuntimeMetrics();
  const record = payload.items.find((item) => item.family === 'deep-parse');

  assert.ok(record);
  assert.equal(record?.status, 'skipped');
  assert.equal(record?.queuedCount, 1);
  assert.equal(record?.processingCount, 0);
  assert.equal(record?.retryCount, 1);
  assert.equal(record?.skipCount, 1);
  assert.equal(record?.lastErrorMessage, 'ocr failed');
  assert.equal(record?.lastMessage, 'deep-parse-already-running');
  assert.equal(record?.lastDurationMs, 60);
  assert.equal(record?.avgDurationMs, 90);
  assert.deepEqual(record?.recentDurationsMs, [120, 60]);
});
