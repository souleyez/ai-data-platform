import test from 'node:test';
import assert from 'node:assert/strict';

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const appModule = await importFresh<typeof import('../src/app.js')>(
  '../src/app.js',
);
const app = appModule.createApp();

test.after(async () => {
  await app.close();
});

test('operations overview endpoint should expose capture parse and output summaries', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/operations-overview',
  });

  assert.equal(response.statusCode, 200);

  const payload = response.json();
  assert.equal(payload.status, 'ok');
  assert.equal(typeof payload.generatedAt, 'string');
  assert.equal(typeof payload.capture.datasourceSummary.total, 'number');
  assert.equal(typeof payload.parse.scanSummary.totalFiles, 'number');
  assert.equal(typeof payload.parse.memorySync.status, 'string');
  assert.equal(typeof payload.output.summary.templates, 'number');
  assert.equal(typeof payload.audit.summary.cleanupRecommendedDocuments, 'number');
  assert.equal(Array.isArray(payload.capture.recentRuns), true);
  assert.equal(Array.isArray(payload.parse.recentDocuments), true);
  assert.equal(Array.isArray(payload.output.recentOutputs), true);
});
