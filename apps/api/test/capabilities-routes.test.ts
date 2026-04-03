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

test('capabilities endpoint should expose runtime format support data', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/capabilities',
  });

  assert.equal(response.statusCode, 200);

  const payload = response.json();
  assert.equal(payload.status, 'ok');
  assert.equal(typeof payload.generatedAt, 'string');
  assert.equal(payload.summary.totalFormats > 0, true);
  assert.equal(Array.isArray(payload.formats), true);
  assert.equal(Array.isArray(payload.sections), true);

  const pdf = payload.formats.find((item: { id: string }) => item.id === 'pdf');
  assert.equal(pdf?.capabilities?.parse, true);
  assert.equal(pdf?.status, 'confirmed');

  const datasourceTypes = payload.sections.find((item: { id: string }) => item.id === 'datasource-types');
  assert.equal(Array.isArray(datasourceTypes?.items), true);
  assert.equal(datasourceTypes.items.length > 0, true);
});
