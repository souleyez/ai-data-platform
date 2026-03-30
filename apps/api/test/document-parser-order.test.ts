import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument } from '../src/lib/document-parser.js';

test('parseDocument should classify ecommerce order csv as utf8 order report', async () => {
  const doc = await parseDocument('../../default-samples/assets/order-electronics-omni-1000-orders-q1-2026.csv');

  assert.equal(doc.parseMethod, 'csv-utf8');
  assert.equal(doc.bizCategory, 'order');
  assert.equal(doc.schemaType, 'report');
  assert.ok((doc.topicTags || []).includes('订单分析'));
  assert.match(doc.excerpt, /Douyin|Tmall|JD/);
});

test('parseDocument should classify order summary and inventory snapshot csv as report documents', async () => {
  const summaryDoc = await parseDocument('../../default-samples/assets/order-channel-category-summary-q1-2026.csv');
  const inventoryDoc = await parseDocument('../../default-samples/assets/order-inventory-snapshot-q1-2026.csv');

  assert.equal(summaryDoc.parseMethod, 'csv-utf8');
  assert.equal(summaryDoc.bizCategory, 'order');
  assert.equal(summaryDoc.schemaType, 'report');
  assert.ok((summaryDoc.topicTags || []).includes('渠道经营'));

  assert.equal(inventoryDoc.parseMethod, 'csv-utf8');
  assert.equal(inventoryDoc.bizCategory, 'inventory');
  assert.equal(inventoryDoc.schemaType, 'report');
  assert.ok((inventoryDoc.topicTags || []).includes('库存管理'));
});
