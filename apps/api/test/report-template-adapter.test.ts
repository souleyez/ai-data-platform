import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReportGroup, ReportTemplateEnvelope } from '../src/lib/report-center.js';
import { adaptTemplateEnvelopeForRequest } from '../src/lib/report-template-adapter.js';

function makeGroup(overrides: Partial<ReportGroup>): ReportGroup {
  return {
    key: '简历',
    label: '人才简历',
    description: '人才简历知识库',
    triggerKeywords: ['简历', '候选人', '人才'],
    defaultTemplateKey: 'shared-static-page-default',
    templates: [],
    referenceImages: [],
    ...overrides,
  };
}

function makeEnvelope(): ReportTemplateEnvelope {
  return {
    title: '默认数据可视化静态页',
    fixedStructure: ['默认结构'],
    variableZones: ['默认区域'],
    outputHint: '默认说明',
    pageSections: ['摘要', '核心指标', '重点分析', '行动建议', 'AI综合分析'],
    tableColumns: ['列A', '列B'],
  };
}

test('adaptTemplateEnvelopeForRequest should keep resume company page sections', () => {
  const result = adaptTemplateEnvelopeForRequest(
    makeGroup({ key: '人才简历', label: '人才简历' }),
    makeEnvelope(),
    'page',
    '请基于人才简历知识库中全部时间范围的简历，按公司维度整理涉及公司的IT项目信息，生成数据可视化静态页报表。',
  );

  assert.equal(result.title, '简历公司维度 IT 项目静态页');
  assert.deepEqual(result.pageSections, ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析']);
});

test('adaptTemplateEnvelopeForRequest should keep bid risk page sections', () => {
  const result = adaptTemplateEnvelopeForRequest(
    makeGroup({
      key: 'bids',
      label: '标书知识库',
      description: '标书资料库',
      triggerKeywords: ['标书', '招标', '投标'],
    }),
    makeEnvelope(),
    'page',
    '请基于标书知识库按风险维度输出静态页，重点看资格风险、材料缺口和时间风险。',
  );

  assert.equal(result.title, '标书风险维度静态页');
  assert.deepEqual(result.pageSections, ['风险概览', '资格风险', '材料缺口', '时间风险', '应答建议', 'AI综合分析']);
});

test('adaptTemplateEnvelopeForRequest should keep order platform page sections', () => {
  const result = adaptTemplateEnvelopeForRequest(
    makeGroup({
      key: '订单分析',
      label: '订单分析',
      description: '订单经营知识库',
      triggerKeywords: ['订单', '销售', '库存'],
    }),
    makeEnvelope(),
    'page',
    '请基于订单分析知识库按平台维度输出静态页，重点看天猫、京东、抖音平台的销量趋势和库存。',
  );

  assert.equal(result.title, '订单平台维度静态页');
  assert.deepEqual(result.pageSections, ['经营摘要', '平台对比', '品类覆盖', '销量趋势', '库存与备货建议', 'AI综合分析']);
});

test('adaptTemplateEnvelopeForRequest should keep paper result page sections', () => {
  const result = adaptTemplateEnvelopeForRequest(
    makeGroup({
      key: '学术论文',
      label: '学术论文',
      description: '学术论文知识库',
      triggerKeywords: ['论文', '研究', '期刊'],
    }),
    makeEnvelope(),
    'page',
    '请基于学术论文知识库按研究结果维度输出静态页，重点整理核心发现、结果指标和局限性。',
  );

  assert.equal(result.title, '论文结果维度静态页');
  assert.deepEqual(result.pageSections, ['研究概览', '核心发现', '结果指标', '证据来源', '局限与风险', 'AI综合分析']);
});

test('adaptTemplateEnvelopeForRequest should keep iot module page sections', () => {
  const result = adaptTemplateEnvelopeForRequest(
    makeGroup({
      key: 'IOT解决方案',
      label: 'IOT解决方案',
      description: '物联网解决方案知识库',
      triggerKeywords: ['iot', '物联网', '设备', '网关'],
    }),
    makeEnvelope(),
    'page',
    '请基于IOT解决方案知识库按模块维度输出静态页，重点梳理设备、网关、平台和接口集成。',
  );

  assert.equal(result.title, 'IOT 模块维度静态页');
  assert.deepEqual(result.pageSections, ['模块概览', '设备与网关', '平台能力', '接口集成', '交付关系', 'AI综合分析']);
});
