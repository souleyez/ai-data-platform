import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-datasource-plan-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const datasourcePlanning = await importFresh<typeof import('../src/lib/datasource-planning.js')>(
  '../src/lib/datasource-planning.js',
);

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('public recurring bids prompt should plan as web_discovery and target bids library', async () => {
  const plan = await datasourcePlanning.planDatasourceFromPrompt(
    '每周抓取中国政府采购网里医疗设备相关的招标公告，落到 bids 知识库。',
  );

  assert.equal(plan.kind, 'web_discovery');
  assert.equal(plan.schedule.kind, 'weekly');
  assert.equal(plan.targetLibraries[0]?.key, 'bids');
  assert.match(String(plan.config?.url || ''), /ccgp|采购网|gov/i);
});
