import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseDocument } from '../src/lib/document-parser.js';

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../default-samples/assets');

test('parseDocument should include lightweight table summary for csv order documents', async () => {
  const doc = await parseDocument(path.join(fixtureDir, 'order-electronics-omni-1000-orders-q1-2026.csv'));
  const tableSummary = doc.structuredProfile?.tableSummary as Record<string, unknown> | undefined;

  assert.equal(doc.parseMethod, 'csv-utf8');
  assert.equal(doc.schemaType, 'order');
  assert.ok(tableSummary);
  assert.equal(tableSummary?.format, 'csv');
  assert.equal(tableSummary?.rowCount, 1000);
  assert.equal(tableSummary?.recordKeyField, 'order_id');
  assert.equal((tableSummary?.recordFieldRoles as Record<string, string>)?.periodField, 'order_date');
  assert.equal((tableSummary?.recordFieldRoles as Record<string, string>)?.platformField, 'platform');
  assert.equal((tableSummary?.recordFieldRoles as Record<string, string>)?.netSalesField, 'net_amount');
  assert.equal((tableSummary?.recordFieldRoles as Record<string, string>)?.refundAmountField, 'refund_amount');
  assert.deepEqual(tableSummary?.columns, [
    'order_id',
    'order_date',
    'platform',
    'shop_name',
    'region',
    'category',
    'sku',
    'unit_price',
    'quantity',
    'gross_amount',
    'discount_amount',
    'refund_amount',
    'net_amount',
    'gross_profit',
    'payment_channel',
    'warehouse',
    'traffic_source',
    'promo_type',
    'customer_type',
    'inventory_before',
    'inventory_after',
    'inventory_risk',
    'anomaly_note',
  ]);
  assert.equal((tableSummary?.sampleRows as Array<Record<string, string>>)[0]?.order_id, 'ORD202602080001');
  assert.equal((tableSummary?.recordRows as Array<Record<string, unknown>>)?.[0]?.keyValue, 'ORD202602080001');
  assert.equal(
    ((tableSummary?.recordRows as Array<Record<string, unknown>>)?.[0]?.values as Record<string, string>)?.platform,
    'Douyin',
  );
  assert.equal(
    ((tableSummary?.recordRows as Array<Record<string, unknown>>)?.[0]?.derivedFields as Record<string, string>)?.period,
    '2026-02-08',
  );
  assert.equal(
    ((tableSummary?.recordRows as Array<Record<string, unknown>>)?.[0]?.derivedFields as Record<string, string>)?.netSales,
    '223.53',
  );
  assert.deepEqual((tableSummary?.recordInsights as Record<string, unknown>)?.topPlatforms, ['Douyin', 'Tmall', 'JD']);
  assert.equal((tableSummary?.recordInsights as Record<string, unknown>)?.highRefundRowCount, 2);
  assert.equal((tableSummary?.recordInsights as Record<string, unknown>)?.inventoryRiskRowCount, 4);
  assert.equal(
    ((tableSummary?.recordInsights as Record<string, unknown>)?.alerts as Array<Record<string, string>>)?.[0]?.type,
    'high_refund',
  );
  assert.equal((tableSummary?.insights?.dateColumns as Array<Record<string, string>>)?.[0]?.min, '2026-01-01');
  assert.equal((tableSummary?.insights?.dateColumns as Array<Record<string, string>>)?.[0]?.max, '2026-03-31');
  assert.equal(
    (tableSummary?.insights?.dimensionColumns as Array<Record<string, unknown>>)
      ?.find((entry) => entry.column === 'platform')
      ?.topValues?.[0]?.value,
    'Douyin',
  );
  assert.equal(
    (tableSummary?.insights?.metricColumns as Array<Record<string, number>>)
      ?.find((entry) => entry.column === 'net_amount')
      ?.sum,
    414791.92,
  );
});

test('parseDocument should include workbook sheet summaries for xlsx documents', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-table-test-'));
  const filePath = path.join(tempDir, 'inventory-report.xlsx');

  try {
    const { utils, writeFile } = await import('xlsx');
    const workbook = utils.book_new();
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet([
        ['month', 'platform', 'net_sales'],
        ['2026-01', 'Douyin', '3450.08'],
        ['2026-02', 'Tmall', '6200.12'],
      ]),
      'summary',
    );
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet([
        ['sku', 'inventory_after'],
        ['USB-C扩展坞7合1', '64'],
      ]),
      'inventory',
    );
    writeFile(workbook, filePath);

    const doc = await parseDocument(filePath);
    const tableSummary = doc.structuredProfile?.tableSummary as Record<string, unknown> | undefined;
    const sheets = tableSummary?.sheets as Array<Record<string, unknown>> | undefined;

    assert.equal(doc.parseMethod, 'xlsx-sheet-reader');
    assert.ok(tableSummary);
    assert.equal(tableSummary?.format, 'xlsx');
    assert.equal(tableSummary?.sheetCount, 2);
    assert.equal(tableSummary?.primarySheetName, 'summary');
    assert.equal(tableSummary?.recordKeyField, 'month');
    assert.equal((tableSummary?.recordFieldRoles as Record<string, string>)?.periodField, 'month');
    assert.equal((tableSummary?.recordFieldRoles as Record<string, string>)?.platformField, 'platform');
    assert.equal((tableSummary?.recordFieldRoles as Record<string, string>)?.netSalesField, 'net_sales');
    assert.deepEqual(tableSummary?.columns, ['month', 'platform', 'net_sales']);
    assert.equal((tableSummary?.sampleRows as Array<Record<string, string>>)[0]?.platform, 'Douyin');
    assert.equal(
      ((tableSummary?.recordRows as Array<Record<string, unknown>>)?.[0]?.values as Record<string, string>)?.month,
      '2026-01',
    );
    assert.equal(
      ((tableSummary?.recordRows as Array<Record<string, unknown>>)?.[0]?.derivedFields as Record<string, string>)?.period,
      '2026-01',
    );
    assert.equal((tableSummary?.insights?.metricColumns as Array<Record<string, number>>)?.[0]?.column, 'net_sales');
    assert.equal(sheets?.[1]?.name, 'inventory');
    assert.deepEqual(sheets?.[1]?.columns, ['sku', 'inventory_after']);
    assert.equal(sheets?.[1]?.recordKeyField, 'sku');
    assert.equal((sheets?.[1]?.recordFieldRoles as Record<string, string>)?.skuField, 'sku');
    assert.equal((sheets?.[1]?.recordFieldRoles as Record<string, string>)?.inventoryAfterField, 'inventory_after');
    assert.ok(!('recordInsights' in (tableSummary || {})) || typeof (tableSummary?.recordInsights) === 'object');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
