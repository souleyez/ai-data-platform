import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import { runResumePageComposer } from '../src/lib/resume-page-composer.js';
import type { ResumeDisplayProfile } from '../src/lib/resume-display-profile-provider.js';

test('runResumePageComposer should return null when gateway is not configured', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  const documents: ParsedDocument[] = [
    {
      path: 'storage/files/uploads/resume-a.docx',
      name: 'resume-a.docx',
      ext: '.docx',
      title: '曹伟煊简历',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '曹伟煊，最近聚焦智慧园区和支付平台场景。',
      excerpt: '曹伟煊，最近聚焦智慧园区和支付平台场景。',
      extractedChars: 2048,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '曹伟煊',
        latestCompany: '康为科技有限公司',
        projectHighlights: ['智慧园区中台'],
        skills: ['产品规划'],
      },
    },
  ];

  const displayProfiles: ResumeDisplayProfile[] = [
    {
      sourcePath: 'storage/files/uploads/resume-a.docx',
      sourceName: 'resume-a.docx',
      displayName: '曹伟煊',
      displayCompany: '康为科技有限公司',
      displayProjects: ['智慧园区中台'],
      displaySkills: ['产品规划'],
      displaySummary: '适合客户汇报展示。',
    },
  ];

  try {
    const result = await runResumePageComposer({
      requestText: '生成简历客户汇报静态页',
      documents,
      displayProfiles,
      envelope: {
        title: '简历客户汇报静态页',
        fixedStructure: [],
        variableZones: [],
        outputHint: '按客户汇报视角生成简历静态页',
        pageSections: ['客户概览', '代表候选人', '代表项目', '技能覆盖', '匹配建议', 'AI综合分析'],
      },
      reportPlan: null,
    });
    assert.equal(result, null);
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;

    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});
