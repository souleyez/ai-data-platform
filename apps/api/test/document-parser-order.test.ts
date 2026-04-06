import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from '../src/lib/document-parser.js';

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../default-samples/assets');

test('parseDocument should classify ecommerce order csv as order schema', async () => {
  const doc = await parseDocument(path.join(fixtureDir, 'order-electronics-omni-1000-orders-q1-2026.csv'));

  assert.equal(doc.parseMethod, 'csv-utf8');
  assert.equal(doc.bizCategory, 'order');
  assert.equal(doc.schemaType, 'order');
  assert.ok((doc.topicTags || []).includes('订单分析'));
  assert.ok(doc.orderFields);
  assert.equal(doc.structuredProfile?.domain, 'order');
  assert.match(doc.excerpt, /Douyin|Tmall|JD/);
});

test('parseDocument should classify order summary and inventory snapshot separately', async () => {
  const summaryDoc = await parseDocument(path.join(fixtureDir, 'order-channel-category-summary-q1-2026.csv'));
  const inventoryDoc = await parseDocument(path.join(fixtureDir, 'order-inventory-snapshot-q1-2026.csv'));

  assert.equal(summaryDoc.parseMethod, 'csv-utf8');
  assert.equal(summaryDoc.bizCategory, 'order');
  assert.equal(summaryDoc.schemaType, 'order');
  assert.ok((summaryDoc.topicTags || []).includes('渠道经营'));
  assert.ok(summaryDoc.orderFields);

  assert.equal(inventoryDoc.parseMethod, 'csv-utf8');
  assert.equal(inventoryDoc.bizCategory, 'inventory');
  assert.equal(inventoryDoc.schemaType, 'report');
  assert.ok((inventoryDoc.topicTags || []).includes('库存管理'));
});
