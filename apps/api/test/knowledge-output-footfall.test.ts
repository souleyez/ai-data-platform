import assert from 'node:assert/strict';
import test from 'node:test';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import { normalizeReportOutput } from '../src/lib/knowledge-output.js';

function makeFootfallDocument(): ParsedDocument {
  return {
    path: 'mall-footfall.csv',
    name: 'mall-footfall.csv',
    ext: '.csv',
    title: '广州 AI 商场客流日报',
    category: 'report',
    bizCategory: 'footfall',
    parseStatus: 'parsed',
    parseMethod: 'csv-utf8',
    summary: '包含商场分区、楼层分区和单间粒度的客流原始数据，当前用于商场分区汇总输出。',
    excerpt: 'report_date,mall_zone,floor_zone,room_unit,visitor_count',
    extractedChars: 520,
    schemaType: 'report',
    topicTags: ['客流分析', '商场分区', '楼层明细', '单间明细', '客流报表'],
    structuredProfile: {
      reportFocus: 'footfall',
      totalFootfall: '4830',
      topMallZone: 'A区',
      mallZoneCount: '3',
      aggregationLevel: 'mall-zone',
      mallZones: ['A区', 'B区', 'C区'],
      tableSummary: {
        recordInsights: {
          totalFootfall: 4830,
          topMallZones: ['A区', 'B区', 'C区'],
          mallZoneBreakdown: [
            { mallZone: 'A区', rowCount: 2, footfall: 2180, floorZoneCount: 2, roomUnitCount: 2 },
            { mallZone: 'B区', rowCount: 2, footfall: 1650, floorZoneCount: 2, roomUnitCount: 2 },
            { mallZone: 'C区', rowCount: 2, footfall: 1000, floorZoneCount: 2, roomUnitCount: 2 },
          ],
        },
      },
    },
  };
}

test('normalizeReportOutput should fall back to mall-zone footfall page output', () => {
  const output = normalizeReportOutput(
    'page',
    '请基于广州AI知识库生成商场客流报表静态页，按商场分区汇总输出。',
    '请基于广州AI知识库生成商场客流报表静态页，按商场分区汇总输出。',
    {
      title: '商场客流分区驾驶舱',
      fixedStructure: [],
      variableZones: [],
      outputHint: '输出商场客流报表，统一按商场分区汇总。',
      pageSections: ['客流总览', '商场分区贡献', '重点分区对比', '商场动线提示', '行动建议', 'AI综合分析'],
    },
    [makeFootfallDocument()],
  );

  assert.equal(output.type, 'page');
  assert.equal(output.title, '商场客流分区驾驶舱');
  assert.match(output.page?.summary || '', /按商场分区汇总/);
  assert.ok((output.page?.cards || []).some((item) => item.label === '总客流' && /4,830/.test(item.value || '')));
  assert.ok((output.page?.sections || []).every((section) => !/覆盖 .*楼层分区|单间/.test((section.bullets || []).join(' '))));
});

test('normalizeReportOutput should emit mall-zone-only table columns for footfall reports', () => {
  const output = normalizeReportOutput(
    'table',
    '请基于广州AI知识库输出商场客流分区表。',
    '请基于广州AI知识库输出商场客流分区表。',
    {
      title: '商场客流分区表',
      fixedStructure: [],
      variableZones: [],
      outputHint: '输出商场客流分区表。',
      tableColumns: ['商场分区', '客流', '说明'],
    },
    [makeFootfallDocument()],
  );

  assert.equal(output.type, 'table');
  assert.deepEqual(output.table?.columns, ['商场分区', '客流', '说明']);
  assert.deepEqual(output.table?.rows?.[0], ['A区', '2,180 人次', '仅输出商场分区汇总，楼层和单间明细不展开']);
});
