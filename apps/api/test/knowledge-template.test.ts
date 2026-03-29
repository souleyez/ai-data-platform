import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReportGroup, SharedReportTemplate } from '../src/lib/report-center.js';
import {
  adaptSelectedTemplatesForRequest,
  buildTemplateContextBlock,
  buildTemplateSearchHints,
  inferTemplateTaskHint,
  selectSharedTemplateForGroup,
  type SelectedKnowledgeTemplate,
} from '../src/lib/knowledge-template.js';

function makeGroup(overrides: Partial<ReportGroup>): ReportGroup {
  return {
    key: 'resume',
    label: '人才简历库',
    description: '简历知识库',
    triggerKeywords: ['简历', '候选人'],
    defaultTemplateKey: 'shared-table-default',
    templates: [],
    referenceImages: [],
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<SharedReportTemplate>): SharedReportTemplate {
  return {
    key: 'resume-table-template',
    label: '简历对比表格',
    type: 'table',
    description: '用于候选人简历横向对比的模板',
    supported: true,
    isDefault: true,
    referenceImages: [],
    ...overrides,
  };
}

function makeSelectedTemplate(overrides?: {
  group?: Partial<ReportGroup>;
  template?: Partial<SharedReportTemplate>;
}): SelectedKnowledgeTemplate {
  const group = makeGroup(overrides?.group || {});
  const template = makeTemplate(overrides?.template || {});
  return {
    group,
    template,
    envelope: {
      title: template.label,
      fixedStructure: ['固定结构A'],
      variableZones: ['可变区域A'],
      outputHint: template.description,
      tableColumns: ['列A', '列B'],
      pageSections: ['摘要', '重点分析'],
    },
  };
}

test('inferTemplateTaskHint should identify resume, bids, order, paper and iot tasks', () => {
  assert.equal(inferTemplateTaskHint([makeSelectedTemplate()], 'table'), 'resume-comparison');

  assert.equal(
    inferTemplateTaskHint([
      makeSelectedTemplate({
        group: {
          key: 'bids',
          label: '标书知识库',
          description: '标书资料库',
          triggerKeywords: ['标书', '招标', '投标'],
        },
        template: { key: 'bids-table-template', label: '标书应答表格' },
      }),
    ], 'table'),
    'bids-table',
  );

  assert.equal(
    inferTemplateTaskHint([
      makeSelectedTemplate({
        group: {
          key: 'order',
          label: '订单分析',
          description: '订单经营知识库',
          triggerKeywords: ['订单', '销量', '库存'],
        },
        template: { key: 'order-static-template', label: '订单经营静态页', type: 'static-page' },
      }),
    ], 'page'),
    'order-static-page',
  );

  assert.equal(
    inferTemplateTaskHint([
      makeSelectedTemplate({
        group: {
          key: 'paper',
          label: '学术论文',
          description: '学术论文知识库',
          triggerKeywords: ['论文', '研究', '期刊'],
        },
        template: { key: 'paper-page-template', label: '论文综述静态页', type: 'static-page' },
      }),
    ], 'page'),
    'paper-static-page',
  );

  assert.equal(
    inferTemplateTaskHint([
      makeSelectedTemplate({
        group: {
          key: 'iot解决方案',
          label: 'IOT解决方案',
          description: '物联网解决方案知识库',
          triggerKeywords: ['iot', '物联网', '设备', '网关'],
        },
        template: { key: 'iot-page-template', label: 'IOT 解决方案静态页', type: 'static-page' },
      }),
    ], 'page'),
    'iot-static-page',
  );
});

test('adaptSelectedTemplatesForRequest should switch resume company table envelope when request is explicit', () => {
  const adapted = adaptSelectedTemplatesForRequest(
    [makeSelectedTemplate()],
    '基于人才简历库中全部时间范围的简历，按公司维度整理涉及公司的IT项目信息，输出表格。',
  );

  assert.equal(adapted[0]?.envelope.title, '简历 IT 项目公司维度表');
  assert.deepEqual(adapted[0]?.envelope.tableColumns, [
    '公司',
    '候选人',
    'IT项目',
    '项目角色/职责',
    '技术栈/系统关键词',
    '时间线',
    '证据来源',
  ]);
});

test('adaptSelectedTemplatesForRequest should switch bid page envelope by risk view', () => {
  const adapted = adaptSelectedTemplatesForRequest(
    [
      makeSelectedTemplate({
        group: {
          key: 'bids',
          label: '标书知识库',
          description: '标书资料库',
          triggerKeywords: ['标书', '招标', '投标'],
        },
        template: {
          key: 'bid-page-template',
          label: '标书摘要静态页',
          type: 'static-page',
          description: '标书共享模板',
        },
      }),
    ],
    '请基于标书知识库按风险维度输出静态页，重点看资格风险、材料缺口和时间风险。',
  );

  assert.equal(adapted[0]?.envelope.title, '标书风险维度静态页');
  assert.deepEqual(adapted[0]?.envelope.pageSections, [
    '风险概览',
    '资格风险',
    '材料缺口',
    '时间风险',
    '应答建议',
    'AI综合分析',
  ]);
});

test('adaptSelectedTemplatesForRequest should switch order page envelope by platform view', () => {
  const adapted = adaptSelectedTemplatesForRequest(
    [
      makeSelectedTemplate({
        group: {
          key: 'order',
          label: '订单分析',
          description: '订单经营知识库',
          triggerKeywords: ['订单', '销量', '库存'],
        },
        template: {
          key: 'order-page-template',
          label: '订单经营静态页',
          type: 'static-page',
          description: '订单共享模板',
        },
      }),
    ],
    '请基于订单分析库按平台维度输出静态页，重点看天猫、京东、抖音的销量趋势和库存。',
  );

  assert.equal(adapted[0]?.envelope.title, '订单渠道经营驾驶舱');
  assert.deepEqual(adapted[0]?.envelope.pageSections, [
    '经营总览',
    '渠道结构',
    '平台角色与增量来源',
    'SKU动销焦点',
    '库存与补货',
    '异常波动解释',
    'AI综合分析',
  ]);
});

test('adaptSelectedTemplatesForRequest should switch iot page envelope by module view', () => {
  const adapted = adaptSelectedTemplatesForRequest(
    [
      makeSelectedTemplate({
        group: {
          key: 'iot解决方案',
          label: 'IOT解决方案',
          description: '物联网解决方案知识库',
          triggerKeywords: ['iot', '物联网', '设备', '网关'],
        },
        template: {
          key: 'iot-page-template',
          label: 'IOT 解决方案静态页',
          type: 'static-page',
          description: 'IOT 共享模板',
        },
      }),
    ],
    '请基于IOT解决方案知识库按模块维度输出静态页，重点梳理设备、网关、平台和接口集成。',
  );

  assert.equal(adapted[0]?.envelope.title, 'IOT 模块维度静态页');
  assert.deepEqual(adapted[0]?.envelope.pageSections, [
    '模块概览',
    '设备与网关',
    '平台能力',
    '接口集成',
    '交付关系',
    'AI综合分析',
  ]);
});

test('buildTemplateSearchHints and context block should include envelope structure and references', () => {
  const selected = makeSelectedTemplate({
    template: {
      referenceImages: [
        {
          id: 'ref-1',
          fileName: 'resume-template.docx',
          originalName: 'resume-template.docx',
          uploadedAt: '2026-03-28T00:00:00.000Z',
          relativePath: 'storage/files/report-references/resume-template.docx',
        },
      ],
    },
  });

  const context = buildTemplateContextBlock([selected]);
  const hints = buildTemplateSearchHints([selected]);

  assert.match(context, /Knowledge base: 人才简历库/);
  assert.match(context, /Reference files: resume-template\.docx/);
  assert.ok(hints.includes('resume-template.docx'));
  assert.ok(hints.includes('列A'));
  assert.ok(hints.includes('固定结构A'));
});

test('selectSharedTemplateForGroup should prefer semantic matches over generic defaults', () => {
  const group = makeGroup({});
  const genericDefault = makeTemplate({
    key: 'shared-table-default',
    label: '默认结构化表格',
    description: '默认用于生成结构稳定的表格报表。',
    isDefault: true,
  });
  const resumeTemplate = makeTemplate({
    key: 'resume-table-template',
    label: '简历对比表格',
    description: '用于候选人简历横向对比的模板',
    isDefault: false,
  });

  const selected = selectSharedTemplateForGroup([genericDefault, resumeTemplate], group, 'table');
  assert.equal(selected?.key, 'resume-table-template');
});
