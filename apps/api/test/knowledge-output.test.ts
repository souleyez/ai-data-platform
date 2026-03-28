import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnowledgeFallbackOutput,
  normalizeReportOutput,
} from '../src/lib/knowledge-output.js';
import type { ParsedDocument } from '../src/lib/document-parser.js';

test('normalizeReportOutput should accept root-level columns and rows', () => {
  const output = normalizeReportOutput(
    'table',
    '按技能维度输出表格',
    JSON.stringify({
      title: '候选人技能维度信息表',
      content: '根据人才简历知识库整理',
      columns: ['技能类别', '候选人', '技能详情', '证据来源'],
      rows: [
        ['Java', '张三', 'Spring Boot / 微服务', 'resume-a.pdf'],
        ['Python', '李四', '数据分析 / 自动化脚本', 'resume-b.pdf'],
      ],
    }),
    {
      title: '简历技能维度表',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按技能维度整理',
      tableColumns: ['技能类别', '候选人', '技能详情', '证据来源'],
    },
  );

  assert.equal(output.type, 'table');
  assert.deepEqual(output.table?.columns, ['技能类别', '候选人', '技能详情', '证据来源']);
  assert.equal(output.table?.rows?.length, 2);
});

test('normalizeReportOutput should align object rows to envelope columns', () => {
  const output = normalizeReportOutput(
    'table',
    '按公司维度整理 IT 项目信息',
    JSON.stringify({
      title: '简历 IT 项目公司维度表',
      rows: [
        {
          公司: '甲公司',
          候选人: '王某',
          IT项目: 'ERP 升级',
          '项目角色/职责': '负责方案与交付',
          '技术栈/系统关键词': 'SAP / ERP',
          时间线: '2023-2024',
          证据来源: 'resume-1.pdf',
        },
      ],
    }),
    {
      title: '简历 IT 项目公司维度表',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按公司维度整理简历中的 IT 项目经历',
      tableColumns: ['公司', '候选人', 'IT项目', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源'],
    },
  );

  assert.equal(output.type, 'table');
  assert.deepEqual(output.table?.columns, ['公司', '候选人', 'IT项目', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源']);
  assert.deepEqual(output.table?.rows?.[0], ['甲公司', '王某', 'ERP 升级', '负责方案与交付', 'SAP / ERP', '2023-2024', 'resume-1.pdf']);
});

test('normalizeReportOutput should align page sections to envelope sections', () => {
  const output = normalizeReportOutput(
    'page',
    '按公司维度生成静态页',
    JSON.stringify({
      title: '简历公司维度 IT 项目静态页',
      summary: '这是摘要。',
      sections: [
        { title: '公司概览', body: '公司维度概览。' },
        { title: '技术关键词', body: '技术关键词内容。' },
      ],
      cards: [{ label: '公司数', value: '5', note: '样例' }],
    }),
    {
      title: '简历公司维度 IT 项目静态页',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按公司维度整理简历中的 IT 项目经历',
      pageSections: ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析'],
    },
  );

  assert.equal(output.type, 'page');
  assert.deepEqual(output.page?.sections?.map((item) => item.title), ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析']);
  assert.equal(output.page?.sections?.[0]?.body, '公司维度概览。');
  assert.equal(output.page?.sections?.[3]?.body, '技术关键词内容。');
});

test('normalizeReportOutput should prefer envelope title for template-aligned pages', () => {
  const output = normalizeReportOutput(
    'page',
    '按人才维度生成静态页',
    JSON.stringify({
      title: '一个泛化标题',
      summary: '摘要',
      sections: [{ title: '人才概览', body: '内容' }],
    }),
    {
      title: '简历人才维度静态页',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按人才维度整理简历信息',
      pageSections: ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'],
    },
  );

  assert.equal(output.title, '简历人才维度静态页');
});

test('buildKnowledgeFallbackOutput should produce resume company table when cloud output is unavailable', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'resume-1.pdf',
      name: 'resume-1.pdf',
      ext: '.pdf',
      title: '张三简历',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '简历摘要',
      excerpt: '简历摘要',
      extractedChars: 1280,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '张三',
        latestCompany: '甲公司',
        companies: ['甲公司'],
        skills: ['Java', 'ERP'],
        itProjectHighlights: ['负责甲公司 ERP 升级项目，担任实施负责人，时间 2023-2024'],
      },
    },
  ];

  const output = buildKnowledgeFallbackOutput(
    'table',
    '基于人才简历知识库中全部时间范围的简历，按公司维度整理涉及公司的 IT 项目信息，输出表格。',
    documents,
    {
      title: '简历 IT 项目公司维度表',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按公司维度输出简历 IT 项目经历',
      tableColumns: ['公司', '候选人', 'IT项目', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源'],
    },
  );

  assert.equal(output.type, 'table');
  assert.equal(output.table?.columns?.[0], '公司');
  assert.equal(output.table?.rows?.[0]?.[0], '甲公司');
  assert.equal(output.table?.rows?.[0]?.[1], '张三');
});
