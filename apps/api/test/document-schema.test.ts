import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStructuredProfile, refreshDerivedSchemaProfile } from '../src/lib/document-schema.js';
import type { ParsedDocument } from '../src/lib/document-parser.js';

test('refreshDerivedSchemaProfile should preserve manually edited structured profile', () => {
  const item = {
    path: 'C:/docs/contract.txt',
    name: 'contract.txt',
    ext: '.txt',
    title: '测试合同',
    category: 'contract',
    bizCategory: 'contract',
    parseStatus: 'parsed',
    parseStage: 'detailed',
    parseMethod: 'text-utf8',
    summary: '手工修正后的合同摘要',
    excerpt: '手工修正后的合同摘要',
    extractedChars: 24,
    topicTags: ['合同'],
    structuredProfile: {
      title: '测试合同',
      summary: '手工结构化摘要',
      contractNo: 'HT-001',
      amount: '1000',
    },
    manualStructuredProfile: true,
  } satisfies ParsedDocument;

  const refreshed = refreshDerivedSchemaProfile(item);

  assert.deepEqual(refreshed.structuredProfile, item.structuredProfile);
  assert.equal(refreshed.schemaType, 'contract');
});

test('buildStructuredProfile should include contract field metadata details and focused field template metadata', () => {
  const profile = buildStructuredProfile({
    schemaType: 'contract',
    title: '采购合同',
    topicTags: ['合同'],
    summary: '合同摘要',
    contractFields: {
      contractNo: 'HT-2026-018',
      partyA: '广州轻工集团',
      partyB: '广州廉明建筑有限公司',
      amount: '￥120000',
      signDate: '2026-04-01',
      effectiveDate: '2026-04-02',
      paymentTerms: '签约后7日内付款',
      duration: '12个月',
    },
    evidenceChunks: [
      {
        id: 'chunk-1',
        order: 0,
        text: '合同编号 HT-2026-018，甲方广州轻工集团，乙方广州廉明建筑有限公司，合同金额￥120000，签约后7日内付款。',
        charLength: 65,
      },
    ],
    extractionProfile: {
      fieldSet: 'contract',
      preferredFieldKeys: ['partyA', 'partyB', 'amount'],
      requiredFieldKeys: ['partyA', 'amount'],
      fieldAliases: {
        partyA: '甲方',
        partyB: '乙方',
        amount: '合同金额',
      },
    },
  });

  assert.equal(profile.contractNo, 'HT-2026-018');
  assert.equal(profile.partyA, '广州轻工集团');
  assert.equal(profile.partyB, '广州廉明建筑有限公司');
  assert.equal(profile.amount, '￥120000');
  assert.equal(profile.signDate, '2026-04-01');
  assert.equal(profile.effectiveDate, '2026-04-02');
  assert.ok(profile.fieldDetails);
  assert.equal(profile.fieldDetails.contractNo?.source, 'rule');
  assert.equal(profile.fieldDetails.contractNo?.value, 'HT-2026-018');
  assert.equal(profile.fieldDetails.contractNo?.evidenceChunkId, 'chunk-1');
  assert.equal(profile.fieldDetails.partyA?.value, '广州轻工集团');
  assert.equal(profile.fieldDetails.partyB?.value, '广州廉明建筑有限公司');
  assert.equal(profile.fieldDetails.amount?.source, 'rule');
  assert.equal(profile.fieldDetails.amount?.evidenceChunkId, 'chunk-1');
  assert.equal(profile.fieldTemplate?.fieldSet, 'contract');
  assert.deepEqual(profile.fieldTemplate?.preferredFieldKeys, ['partyA', 'partyB', 'amount']);
  assert.deepEqual(profile.fieldTemplate?.requiredFieldKeys, ['partyA', 'amount']);
  assert.equal(profile.fieldTemplate?.fieldAliases?.partyA, '甲方');
  assert.equal(profile.focusedFields?.partyA, '广州轻工集团');
  assert.equal(profile.focusedFieldDetails?.amount?.value, '￥120000');
  assert.equal(profile.focusedFieldEntries?.[0]?.key, 'partyA');
  assert.equal(profile.focusedFieldEntries?.[0]?.alias, '甲方');
  assert.equal(profile.focusedFieldEntries?.[0]?.required, true);
});

test('buildStructuredProfile should include enterprise guidance fields for technical documents', () => {
  const profile = buildStructuredProfile({
    schemaType: 'technical',
    title: 'IOA Budget Adjustment Guide',
    topicTags: ['企业规范', '审批流程', '预算调整'],
    summary: 'Guide for budget adjustment approval and system operations.',
    enterpriseGuidanceFields: {
      businessSystem: 'IOA',
      documentKind: 'budget-adjustment',
      applicableScope: 'Non-engineering contract workflows',
      operationEntry: 'IOA > Contract > Budget Adjustment',
      approvalLevels: ['部门负责人', '集团审批'],
      policyFocus: ['企业规范', '预算调整'],
      contacts: ['finance-support@example.com'],
    },
    evidenceChunks: [
      {
        id: 'chunk-1',
        order: 0,
        text: 'IOA budget adjustment guide for non-engineering contract workflows. Entry path: IOA > Contract > Budget Adjustment. Group approval is required.',
        charLength: 142,
      },
    ],
  });

  assert.equal(profile.domain, 'technical');
  assert.equal(profile.businessSystem, 'IOA');
  assert.equal(profile.documentKind, 'budget-adjustment');
  assert.equal(profile.applicableScope, 'Non-engineering contract workflows');
  assert.ok(Array.isArray(profile.approvalLevels));
  assert.ok(profile.fieldDetails);
  assert.equal(profile.fieldDetails.businessSystem?.value, 'IOA');
});

test('buildStructuredProfile should include order fields for order documents', () => {
  const profile = buildStructuredProfile({
    schemaType: 'order',
    title: 'Channel Order Summary',
    topicTags: ['订单分析', '渠道经营'],
    summary: 'Q1 order summary for Tmall and JD channels.',
    orderFields: {
      period: 'Q1 2026',
      platform: 'tmall',
      orderCount: '1280',
      netSales: '￥325000',
      grossMargin: '32%',
      topCategory: 'Consumer Electronics',
      inventoryStatus: 'inventory-related',
      replenishmentAction: 'replenishment-needed',
    },
    evidenceChunks: [
      {
        id: 'chunk-1',
        order: 0,
        text: 'Q1 2026 order summary. Tmall order count 1280, net sales ￥325000, gross margin 32%.',
        charLength: 86,
      },
    ],
  });

  assert.equal(profile.domain, 'order');
  assert.equal(profile.platform, 'tmall');
  assert.equal(profile.orderCount, '1280');
  assert.equal(profile.netSales, '￥325000');
  assert.equal(profile.fieldDetails.platform?.value, 'tmall');
});

test('buildStructuredProfile should retain lightweight table summary metadata', () => {
  const profile = buildStructuredProfile({
    schemaType: 'report',
    title: 'Order table overview',
    topicTags: ['订单分析'],
    summary: 'Structured table summary test',
    tableSummary: {
      format: 'csv',
      rowCount: 12,
      columnCount: 4,
      columns: ['month', 'platform', 'category', 'net_sales'],
      sampleRows: [
        {
          month: '2026-01',
          platform: 'Douyin',
          category: '手机配件',
          net_sales: '3450.08',
        },
      ],
      sheetCount: 1,
      primarySheetName: 'Sheet1',
    },
  });

  assert.equal(profile.tableSummary?.format, 'csv');
  assert.equal(profile.tableSummary?.rowCount, 12);
  assert.deepEqual(profile.tableSummary?.columns, ['month', 'platform', 'category', 'net_sales']);
});

test('buildStructuredProfile should expose mall-zone footfall fields for footfall reports', () => {
  const profile = buildStructuredProfile({
    schemaType: 'report',
    title: '广州 AI 商场客流日报',
    topicTags: ['客流分析', '商场分区', '客流报表'],
    summary: '统一按商场分区汇总商场客流，楼层和单间仅参与聚合。',
    footfallFields: {
      period: '2026-04-01',
      totalFootfall: '4830',
      topMallZone: 'A区',
      mallZoneCount: '3',
      aggregationLevel: 'mall-zone',
    },
    tableSummary: {
      format: 'csv',
      rowCount: 6,
      columnCount: 5,
      columns: ['report_date', 'mall_zone', 'floor_zone', 'room_unit', 'visitor_count'],
      sampleRows: [],
      sheetCount: 1,
      recordInsights: {
        mallZoneBreakdown: [
          { mallZone: 'A区', rowCount: 2, footfall: 2180, floorZoneCount: 1, roomUnitCount: 2 },
          { mallZone: 'B区', rowCount: 2, footfall: 1650, floorZoneCount: 1, roomUnitCount: 2 },
          { mallZone: 'C区', rowCount: 2, footfall: 1000, floorZoneCount: 1, roomUnitCount: 2 },
        ],
      },
    },
  });

  assert.equal(profile.domain, 'report');
  assert.equal(profile.reportFocus, 'footfall');
  assert.equal(profile.totalFootfall, '4830');
  assert.equal(profile.topMallZone, 'A区');
  assert.equal(profile.mallZoneCount, '3');
  assert.equal(profile.aggregationLevel, 'mall-zone');
  assert.deepEqual(profile.mallZones, ['A区', 'B区', 'C区']);
});
