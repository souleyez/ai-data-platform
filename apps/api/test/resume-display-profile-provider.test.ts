import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import {
  buildResumeDisplayProfileContextBlock,
  parseResumeDisplayProfileResponse,
  runResumeDisplayProfileResolver,
} from '../src/lib/resume-display-profile-provider.js';

test('parseResumeDisplayProfileResponse should normalize strict json payloads', () => {
  const resolution = parseResumeDisplayProfileResponse(JSON.stringify({
    profiles: [
      {
        sourcePath: 'storage/files/uploads/resume-a.docx',
        sourceName: 'resume-a.docx',
        displayName: '曹伟煊',
        displayCompany: '康为科技有限公司',
        displayProjects: ['智慧园区中台', '支付平台整合'],
        displaySkills: ['产品规划', '数字化解决方案'],
        displaySummary: '候选人最近聚焦智慧园区和支付场景。',
      },
    ],
  }));

  assert.deepEqual(resolution, {
    profiles: [
      {
        sourcePath: 'storage/files/uploads/resume-a.docx',
        sourceName: 'resume-a.docx',
        displayName: '曹伟煊',
        displayCompany: '康为科技有限公司',
        displayProjects: ['智慧园区中台', '支付平台整合'],
        displaySkills: ['产品规划', '数字化解决方案'],
        displaySummary: '候选人最近聚焦智慧园区和支付场景。',
      },
    ],
  });
});

test('buildResumeDisplayProfileContextBlock should expose reusable display profiles', () => {
  const block = buildResumeDisplayProfileContextBlock({
    profiles: [
      {
        sourcePath: 'storage/files/uploads/resume-a.docx',
        sourceName: 'resume-a.docx',
        displayName: '曹伟煊',
        displayCompany: '康为科技有限公司',
        displayProjects: ['智慧园区中台'],
        displaySkills: ['产品规划'],
        displaySummary: '适合客户汇报展示。',
      },
    ],
  });

  assert.match(block, /Resume display profiles:/);
  assert.match(block, /曹伟煊/);
  assert.match(block, /康为科技有限公司/);
  assert.match(block, /智慧园区中台/);
});

test('runResumeDisplayProfileResolver should return null when gateway is not configured', async () => {
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

  try {
    const resolution = await runResumeDisplayProfileResolver({
      requestText: '生成简历客户汇报静态页',
      documents,
    });
    assert.equal(resolution, null);
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;

    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});
