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
    '请基于人才简历知识库中全部时间范围的简历，为客户汇报准备一页可视化静态页，需要突出人才概览、代表项目、核心技能、匹配建议和 AI 综合分析。',
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
    '请基于人才简历知识库中全部时间范围的简历，为客户汇报准备一页可视化静态页，需要突出人才概览、代表项目、核心技能、匹配建议和 AI 综合分析。',
    output,
    documents,
  ), true);
});
