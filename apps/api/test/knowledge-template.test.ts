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

test('inferTemplateTaskHint should identify resume, bids and order template tasks', () => {
  assert.equal(
    inferTemplateTaskHint([makeSelectedTemplate()], 'table'),
    'resume-comparison',
  );

  assert.equal(
    inferTemplateTaskHint([
      makeSelectedTemplate({
        group: {
          key: 'bids',
          label: '标书知识库',
          description: '标书知识库',
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
          triggerKeywords: ['订单', '销售', '库存'],
        },
        template: { key: 'order-static-template', label: '订单经营静态页', type: 'static-page' },
      }),
    ], 'page'),
    'order-static-page',
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

test('adaptSelectedTemplatesForRequest should switch resume skill page envelope when request is skill dashboard', () => {
  const adapted = adaptSelectedTemplatesForRequest(
    [
      makeSelectedTemplate({
        template: {
          key: 'resume-page-template',
          type: 'static-page',
          label: '数据可视化静态页',
        },
      }),
    ],
    '请基于人才简历库按技能维度生成数据可视化静态页。',
  );

  assert.equal(adapted[0]?.envelope.title, '简历技能维度静态页');
  assert.deepEqual(adapted[0]?.envelope.pageSections, [
    '技能概览',
    '技能分布',
    '候选人覆盖',
    '公司关联',
    '项目关联',
    'AI综合分析',
  ]);
});

test('adaptSelectedTemplatesForRequest should keep talent view when request explicitly says talent dimension', () => {
  const adapted = adaptSelectedTemplatesForRequest(
    [
      makeSelectedTemplate({
        template: {
          key: 'resume-page-template',
          type: 'static-page',
          label: '数据可视化静态页',
        },
      }),
    ],
    '请基于简历知识库按人才维度整理学历、最近公司、核心能力和项目经历，生成数据可视化静态页。',
  );

  assert.equal(adapted[0]?.envelope.title, '简历人才维度静态页');
  assert.deepEqual(adapted[0]?.envelope.pageSections, [
    '人才概览',
    '学历与背景',
    '公司经历',
    '项目经历',
    '核心能力',
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
