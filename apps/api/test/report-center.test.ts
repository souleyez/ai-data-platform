import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSharedTemplateEnvelope,
  type SharedReportTemplate,
} from '../src/lib/report-center.js';

function makeTemplate(overrides: Partial<SharedReportTemplate>): SharedReportTemplate {
  return {
    key: 'shared-table-default',
    label: '默认结构化表格',
    type: 'table',
    description: '默认用于生成结构稳定的表格报表。',
    supported: true,
    isDefault: true,
    referenceImages: [],
    ...overrides,
  };
}

test('buildSharedTemplateEnvelope should return resume comparison columns for resume table templates', () => {
  const envelope = buildSharedTemplateEnvelope(
    makeTemplate({
      key: 'resume-table-template',
      label: '简历对比表格',
      description: '用于候选人简历横向对比的模板',
    }),
  );

  assert.deepEqual(envelope.tableColumns, [
    '候选人',
    '第一学历',
    '最近就职公司',
    '核心能力',
    '年龄',
    '工作年限',
    '匹配判断',
    '证据来源',
  ]);
});

test('buildSharedTemplateEnvelope should return bid sections for bid static page templates', () => {
  const envelope = buildSharedTemplateEnvelope(
    makeTemplate({
      key: 'bid-static-template',
      label: '标书摘要静态页',
      type: 'static-page',
      description: '用于招投标项目的摘要静态页模板',
    }),
  );

  assert.deepEqual(envelope.pageSections, [
    '项目概况',
    '资格条件',
    '关键时间节点',
    '应答重点',
    '风险提醒',
    'AI综合分析',
  ]);
});

test('buildSharedTemplateEnvelope should return order sections for order static page templates', () => {
  const envelope = buildSharedTemplateEnvelope(
    makeTemplate({
      key: 'order-static-template',
      label: '订单经营静态页',
      type: 'static-page',
      description: '适用于多平台订单经营分析的可视化静态页',
    }),
  );

  assert.deepEqual(envelope.pageSections, [
    '经营摘要',
    '平台对比',
    '品类对比',
    '库存与备货建议',
    '异常波动说明',
    'AI综合分析',
  ]);
});
