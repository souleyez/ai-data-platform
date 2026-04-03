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

test('report standards endpoint should expose template and output mappings', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/report-standards',
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.status, 'ok');
  assert.equal(Array.isArray(payload.templates), true);
  assert.equal(Array.isArray(payload.outputKinds), true);

  const staticPage = payload.templates.find((item: { type: string }) => item.type === 'static-page');
  assert.equal(staticPage?.defaultKind, 'page');
  assert.equal(staticPage?.defaultFormat, 'html');

  const doc = payload.outputKinds.find((item: { id: string }) => item.id === 'doc');
  assert.equal(doc?.defaultFormat, 'docx');
  assert.equal(doc?.templateType, 'document');
});
