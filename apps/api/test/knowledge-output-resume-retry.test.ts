import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import {
  normalizeReportOutput,
  shouldUseResumePageFallbackOutput,
} from '../src/lib/knowledge-output.js';

test('normalizeReportOutput should keep weak resume pages visible for retry when fallback is disabled', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'resume-1.pdf',
      name: 'resume-1.pdf',
      ext: '.pdf',
      title: '夏天宇简历',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '夏天宇，5年经验，参与 AIGC 平台和智慧社区项目。',
      excerpt: '夏天宇，5年经验。',
      extractedChars: 1280,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '夏天宇',
        latestCompany: '广州某智能科技有限公司',
        skills: ['产品设计', 'Axure'],
        projectHighlights: ['AIGC平台产品规划', '智慧社区产品设计'],
      },
    },
  ];

  const output = normalizeReportOutput(
    'page',
    '请基于人才简历知识库中的全部简历，为客户汇报准备一页可视化静态页，需要突出人才概览、代表项目、核心技能、匹配建议和 AI 综合分析。',
    JSON.stringify({
      title: '简历人才维度静态页',
      summary: '产品设计 | 夏天宇简历 | 产品设计 | 创建了一个集成人工智能平台',
      sections: [
        { title: '人才概览', body: '产品设计 | 夏天宇简历 | 产品设计 | 创建了一个集成人工智能平台' },
        { title: '核心技能', body: 'Java | 夏天宇简历 | Java | 创建了一个集成人工智能平台' },
      ],
      charts: [{ title: '技能覆盖分布', items: [{ label: '产品设计', value: 1 }] }],
    }),
    null,
    documents,
    [],
    { allowResumeFallback: false },
  );

  assert.equal(output.type, 'page');
  assert.match(JSON.stringify(output.page), /\s\|\s/);
  assert.equal(shouldUseResumePageFallbackOutput(
    '请基于人才简历知识库中的全部简历，为客户汇报准备一页可视化静态页，需要突出人才概览、代表项目、核心技能、匹配建议和 AI 综合分析。',
    output,
    documents,
  ), true);
});

test('normalizeReportOutput should normalize generic resume page titles into client titles before retry gating', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'resume-1.pdf',
      name: 'resume-1.pdf',
      ext: '.pdf',
      title: '夏天宇简历',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '夏天宇，5年经验，最近公司为广州某智能科技有限公司，参与智慧座舱和 AIGC 平台项目。',
      excerpt: '夏天宇，5年经验。',
      extractedChars: 1280,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '夏天宇',
        latestCompany: '广州某智能科技有限公司',
        skills: ['产品设计', 'Axure'],
        projectHighlights: ['智慧座舱系统产品规划', 'AIGC平台产品规划'],
      },
    },
  ];

  const output = normalizeReportOutput(
    'page',
    '请基于人才简历知识库中的全部简历，为客户汇报准备一页可视化静态页。',
    JSON.stringify({
      title: '简历人才维度静态页',
      summary: '本报告基于 1 份简历生成客户视角的静态页。',
      cards: [
        { label: '候选人覆盖', value: '1', note: '包含 1 位候选人' },
        { label: '公司覆盖', value: '1', note: '包含 1 家企业' },
      ],
      sections: [
        { title: '人才概览', body: '本批次简历共 1 份，适合客户汇报初筛。' },
        { title: '学历与背景', body: '候选人具备稳定的产品背景。' },
        { title: '公司经历', body: '最近公司为广州某智能科技有限公司。' },
        { title: '项目经历', body: '代表项目包括智慧座舱系统产品规划。' },
        { title: '核心能力', body: '核心能力覆盖产品设计与需求分析。' },
        { title: 'AI综合分析', body: '适合创新产品与智能化相关岗位。' },
      ],
      charts: [
        { title: '技能热点分布', items: [{ label: '产品设计', value: 1 }] },
        { title: '公司覆盖分布', items: [{ label: '广州某智能科技有限公司', value: 1 }] },
      ],
    }),
    null,
    documents,
    [],
    { allowResumeFallback: false },
  );

  assert.equal(output.type, 'page');
  assert.equal(output.title, '简历客户汇报静态页');
  assert.equal(shouldUseResumePageFallbackOutput(
    '请基于人才简历知识库中的全部简历，为客户汇报准备一页可视化静态页。',
    output,
    documents,
  ), false);
});

test('normalizeReportOutput should hydrate resume client pages with cards and charts when composer omits them', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'resume-1.pdf',
      name: 'resume-1.pdf',
      ext: '.pdf',
      title: '夏天宇简历',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '夏天宇，5年经验，阿里斑马网络产品经理，负责智能座舱和 AIGC 平台项目。',
      excerpt: '夏天宇，5年经验。',
      extractedChars: 1280,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '夏天宇',
        latestCompany: '阿里斑马网络',
        skills: ['产品设计', 'AIGC', '智能座舱'],
        projectHighlights: ['智能座舱平台项目', 'AIGC 能力平台项目'],
      },
    },
  ];

  const output = normalizeReportOutput(
    'page',
    '请基于简历库生成一页客户汇报静态页',
    JSON.stringify({
      title: '简历人才维度静态页',
      summary: '聚焦一位具备智能座舱与 AIGC 背景的候选人。',
      sections: [
        { title: '人才概览', body: '候选人聚焦产品与平台协同，适合客户沟通场景。' },
        { title: '项目经历', body: '核心项目覆盖智能座舱平台和 AIGC 能力平台。' },
        { title: 'AI综合分析', body: '整体画像更适合作为客户沟通和能力展示样板。' },
      ],
    }),
    null,
    documents,
    [],
    { allowResumeFallback: false },
  );

  assert.equal(output.type, 'page');
  assert.equal(output.title, '简历客户汇报静态页');
  assert.equal(output.page?.sections?.[0]?.title, '人才概览');
  assert.ok((output.page?.cards || []).length > 0);
  assert.ok((output.page?.charts || []).length > 0);
});
