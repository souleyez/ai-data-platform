import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getDefaultProjectSampleOutputs } from '../src/lib/default-project-samples.js';

test('default project samples should keep three premium order cockpit pages', () => {
  const outputs = getDefaultProjectSampleOutputs();
  const orderPages = outputs.filter((item) => (
    item.groupLabel === '订单分析' && item.kind === 'page'
  ));

  const titles = orderPages.map((item) => item.title);
  assert.ok(titles.includes('[系统样例] 订单经营静态页'));
  assert.ok(titles.includes('[系统样例] 库存与补货驾驶舱'));
  assert.ok(titles.includes('[系统样例] SKU与品类结构页'));

  for (const item of orderPages) {
    assert.ok((item.page?.cards || []).length >= 5, `${item.title} should keep a premium card shell`);
    assert.ok((item.page?.charts || []).length >= 4, `${item.title} should keep a premium chart shell`);
    assert.ok((item.page?.sections || []).length >= 6, `${item.title} should keep a structured section shell`);
  }
});

test('default order sample assets should include a 1000-order dataset and inventory companions', async () => {
  const ordersPath = fileURLToPath(new URL('../../../default-samples/assets/order-electronics-omni-1000-orders-q1-2026.csv', import.meta.url));
  const summaryPath = fileURLToPath(new URL('../../../default-samples/assets/order-channel-category-summary-q1-2026.csv', import.meta.url));
  const inventoryPath = fileURLToPath(new URL('../../../default-samples/assets/order-inventory-snapshot-q1-2026.csv', import.meta.url));
  const notesPath = fileURLToPath(new URL('../../../default-samples/assets/order-cockpit-notes-q1-2026.md', import.meta.url));

  const [ordersRaw, summaryRaw, inventoryRaw, notesRaw] = await Promise.all([
    readFile(ordersPath, 'utf8'),
    readFile(summaryPath, 'utf8'),
    readFile(inventoryPath, 'utf8'),
    readFile(notesPath, 'utf8'),
  ]);

  assert.equal(ordersRaw.trim().split(/\r?\n/).length - 1, 1000);
  assert.ok(summaryRaw.trim().split(/\r?\n/).length - 1 >= 30);
  assert.ok(inventoryRaw.trim().split(/\r?\n/).length - 1 >= 24);
  assert.match(notesRaw, /1000/);
  assert.match(notesRaw, /多渠道/);
});
