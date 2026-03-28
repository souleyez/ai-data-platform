import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSharedTemplateEnvelope,
  findDuplicateSharedTemplateReference,
  inferReportReferenceSourceType,
  inferReportTemplateTypeFromSource,
  isUserSharedReportTemplate,
  resolveReportGroup,
  type ReportGroup,
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
    origin: 'system',
    referenceImages: [],
    ...overrides,
  };
}

function makeGroup(overrides: Partial<ReportGroup>): ReportGroup {
  return {
    key: '简历',
    label: '简历',
    description: '简历知识库',
    triggerKeywords: ['简历', '候选人'],
    defaultTemplateKey: 'resume-table-template',
    templates: [],
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
      description: '用于招投标项目摘要静态页模板',
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
      description: '适用于多平台订单经营分析的数据可视化静态页',
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

test('buildSharedTemplateEnvelope should return paper sections for paper static page templates', () => {
  const envelope = buildSharedTemplateEnvelope(
    makeTemplate({
      key: 'paper-static-template',
      label: '论文综述静态页',
      type: 'static-page',
      description: '适用于学术论文综述和研究结论梳理的静态页模板',
    }),
  );

  assert.deepEqual(envelope.pageSections, [
    '研究概览',
    '方法设计',
    '核心结论',
    '关键指标与证据',
    '局限与风险',
    'AI综合分析',
  ]);
});

test('buildSharedTemplateEnvelope should return iot sections for iot static page templates', () => {
  const envelope = buildSharedTemplateEnvelope(
    makeTemplate({
      key: 'iot-static-template',
      label: 'IOT解决方案静态页',
      type: 'static-page',
      description: '适用于物联网方案讲解和平模块梳理的静态页模板',
    }),
  );

  assert.deepEqual(envelope.pageSections, [
    '方案概览',
    '核心模块',
    '平台与接口',
    '实施路径',
    '业务价值',
    'AI综合分析',
  ]);
});

test('resolveReportGroup should match by key or label', () => {
  const groups = [
    makeGroup({ key: '简历', label: '简历' }),
    makeGroup({ key: '人才简历', label: '人才简历' }),
  ];

  assert.equal(resolveReportGroup(groups, '简历')?.key, '简历');
  assert.equal(resolveReportGroup(groups, '人才简历')?.label, '人才简历');
});

test('inferReportReferenceSourceType should detect office files and links', () => {
  assert.equal(inferReportReferenceSourceType({ fileName: '报价模板.docx' }), 'word');
  assert.equal(inferReportReferenceSourceType({ fileName: '汇报提纲.pptx' }), 'ppt');
  assert.equal(inferReportReferenceSourceType({ fileName: '经营分析.xlsx' }), 'spreadsheet');
  assert.equal(inferReportReferenceSourceType({ fileName: '样式参考.png' }), 'image');
  assert.equal(
    inferReportReferenceSourceType({ url: 'https://example.com/report-template' }),
    'web-link',
  );
});

test('inferReportTemplateTypeFromSource should map uploads to internal template types', () => {
  assert.equal(inferReportTemplateTypeFromSource({ fileName: '报价模板.docx' }), 'document');
  assert.equal(inferReportTemplateTypeFromSource({ fileName: '汇报提纲.pptx' }), 'ppt');
  assert.equal(inferReportTemplateTypeFromSource({ fileName: '经营分析.xlsx' }), 'table');
  assert.equal(
    inferReportTemplateTypeFromSource({ url: 'https://example.com/report-template' }),
    'static-page',
  );
});

test('isUserSharedReportTemplate should only allow user templates', () => {
  assert.equal(isUserSharedReportTemplate(makeTemplate({ key: 'shared-static-page-default', origin: 'system' })), false);
  assert.equal(isUserSharedReportTemplate(makeTemplate({ key: 'template-user-1', origin: 'user' })), true);
});

test('findDuplicateSharedTemplateReference should detect duplicate file names and links across user templates', () => {
  const templates = [
    makeTemplate({
      key: 'shared-static-page-default',
      origin: 'system',
      referenceImages: [
        { id: 'system-ref', originalName: '系统模板.docx', uploadedAt: '2026-03-28T08:00:00.000Z', relativePath: '' },
      ],
    }),
    makeTemplate({
      key: 'template-user-link',
      origin: 'user',
      referenceImages: [
        {
          id: 'tmplref-link',
          originalName: '官网样式',
          uploadedAt: '2026-03-28T08:00:00.000Z',
          relativePath: '',
          kind: 'link',
          url: 'https://example.com/report-template',
        },
      ],
    }),
    makeTemplate({
      key: 'template-user-file',
      origin: 'user',
      referenceImages: [
        {
          id: 'tmplref-file',
          originalName: '周报模板.docx',
          uploadedAt: '2026-03-28T08:00:00.000Z',
          relativePath: 'storage/files/report-references/tmplref-file.docx',
        },
      ],
    }),
  ];

  assert.equal(
    findDuplicateSharedTemplateReference(templates, { fileName: '周报模板.docx' })?.templateKey,
    'template-user-file',
  );
  assert.equal(
    findDuplicateSharedTemplateReference(templates, { url: 'https://example.com/report-template' })?.templateKey,
    'template-user-link',
  );
  assert.equal(findDuplicateSharedTemplateReference(templates, { fileName: '全新模板.docx' }), null);
});
