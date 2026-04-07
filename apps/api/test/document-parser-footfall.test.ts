import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import xlsx from 'xlsx';

import { parseDocument } from '../src/lib/document-parser.js';

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../default-samples/assets');

test('parseDocument should understand mall footfall tables and aggregate at mall-zone level', async () => {
  const doc = await parseDocument(path.join(fixtureDir, 'mall-footfall-guangzhou-ai-sample.csv'));
  const profile = doc.structuredProfile as Record<string, unknown> | undefined;
  const tableSummary = profile?.tableSummary as Record<string, unknown> | undefined;
  const recordFieldRoles = tableSummary?.recordFieldRoles as Record<string, string> | undefined;
  const recordInsights = tableSummary?.recordInsights as Record<string, unknown> | undefined;
  const mallZoneBreakdown = recordInsights?.mallZoneBreakdown as Array<Record<string, unknown>> | undefined;

  assert.equal(doc.parseMethod, 'csv-utf8');
  assert.equal(doc.schemaType, 'report');
  assert.equal(doc.bizCategory, 'footfall');
  assert.equal(doc.footfallFields?.aggregationLevel, 'mall-zone');
  assert.equal(Number(doc.footfallFields?.totalFootfall || 0), 4830);
  assert.equal(doc.footfallFields?.topMallZone, 'A区');
  assert.equal(doc.footfallFields?.mallZoneCount, '3');

  assert.equal(profile?.reportFocus, 'footfall');
  assert.equal(profile?.aggregationLevel, 'mall-zone');
  assert.equal(Number(profile?.totalFootfall || 0), 4830);
  assert.deepEqual(profile?.mallZones, ['A区', 'B区', 'C区']);

  assert.equal(recordFieldRoles?.mallZoneField, 'mall_zone');
  assert.equal(recordFieldRoles?.floorZoneField, 'floor_zone');
  assert.equal(recordFieldRoles?.roomUnitField, 'room_unit');
  assert.equal(recordFieldRoles?.footfallField, 'visitor_count');

  assert.equal(Number(recordInsights?.totalFootfall || 0), 4830);
  assert.deepEqual(recordInsights?.topMallZones, ['A区', 'B区', 'C区']);
  assert.equal(mallZoneBreakdown?.length, 3);
  assert.deepEqual(mallZoneBreakdown?.[0], {
    mallZone: 'A区',
    rowCount: 2,
    footfall: 2180,
    floorZoneCount: 2,
    roomUnitCount: 2,
  });
});

test('parseDocument should understand real-style footfall xlsx detail sheets', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-footfall-xlsx-'));
  const filePath = path.join(tempDir, 'gaoming-footfall.xlsx');

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ['区域', '设备SN', '通道SN', '位置', '时间', '进入人数', '离开人数'],
    ['商场', 'SN001', 'CH001', '南门', '2026-04-01 10:00:00', 120, 110],
    ['商场', 'SN001', 'CH002', '北门', '2026-04-01 11:00:00', 100, 95],
    ['层一', 'SN002', 'CH010', '中庭', '2026-04-01 10:30:00', 80, 70],
    ['停车', 'SN003', 'CH020', '停车场入口', '2026-04-01 10:45:00', 60, 55],
  ]), '4月');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ['日期', '停车', '层一', '商场', '合计'],
    ['2026-04-01', 60, 80, 220, 360],
  ]), '汇总');
  xlsx.writeFile(workbook, filePath);

  try {
    const doc = await parseDocument(filePath);
    const profile = doc.structuredProfile as Record<string, unknown> | undefined;
    const tableSummary = profile?.tableSummary as Record<string, unknown> | undefined;
    const recordFieldRoles = tableSummary?.recordFieldRoles as Record<string, string> | undefined;
    const recordInsights = tableSummary?.recordInsights as Record<string, unknown> | undefined;
    const mallZoneBreakdown = recordInsights?.mallZoneBreakdown as Array<Record<string, unknown>> | undefined;

    assert.equal(doc.parseMethod, 'xlsx-sheet-reader');
    assert.equal(doc.bizCategory, 'footfall');
    assert.equal(doc.footfallFields?.aggregationLevel, 'mall-zone');
    assert.equal(doc.footfallFields?.totalFootfall, '360');
    assert.equal(doc.footfallFields?.topMallZone, '商场');
    assert.equal(doc.footfallFields?.mallZoneCount, '3');

    assert.equal(tableSummary?.primarySheetName, '汇总');
    assert.equal(recordFieldRoles?.periodField, '日期');
    assert.equal(recordFieldRoles?.footfallField, '合计');
    assert.deepEqual(mallZoneBreakdown?.[0], {
      mallZone: '商场',
      rowCount: 1,
      footfall: 220,
      floorZoneCount: 0,
      roomUnitCount: 0,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('parseDocument should derive mall-zone breakdown from wide summary footfall sheets', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-footfall-wide-'));
  const filePath = path.join(tempDir, 'gaoming-footfall-summary.xlsx');

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ['日期', '停车', '层一', '商场', '合计'],
    ['2026-04-01', 60, 80, 220, 360],
    ['2026-04-02', 70, 90, 240, 400],
  ]), '汇总');
  xlsx.writeFile(workbook, filePath);

  try {
    const doc = await parseDocument(filePath);
    const profile = doc.structuredProfile as Record<string, unknown> | undefined;
    const tableSummary = profile?.tableSummary as Record<string, unknown> | undefined;
    const recordInsights = tableSummary?.recordInsights as Record<string, unknown> | undefined;
    const mallZoneBreakdown = recordInsights?.mallZoneBreakdown as Array<Record<string, unknown>> | undefined;

    assert.equal(doc.parseMethod, 'xlsx-sheet-reader');
    assert.equal(doc.bizCategory, 'footfall');
    assert.equal(doc.footfallFields?.aggregationLevel, 'mall-zone');
    assert.equal(doc.footfallFields?.totalFootfall, '760');
    assert.equal(doc.footfallFields?.topMallZone, '商场');
    assert.equal(doc.footfallFields?.mallZoneCount, '3');
    assert.equal(recordInsights?.totalFootfall, 760);
    assert.deepEqual(mallZoneBreakdown?.map((item) => item.mallZone), ['商场', '层一', '停车']);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
