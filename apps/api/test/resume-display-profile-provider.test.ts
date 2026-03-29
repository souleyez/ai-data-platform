import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import {
  buildResumeDisplayProfileContextBlock,
  buildResumeDisplaySeedProfiles,
  parseResumeDisplayProfileResponse,
  runResumeDisplayProfileResolver,
} from '../src/lib/resume-display-profile-provider.js';

test('parseResumeDisplayProfileResponse should normalize strict json payloads', () => {
  const resolution = parseResumeDisplayProfileResponse(JSON.stringify({
    profiles: [
      {
        sourcePath: 'storage/files/uploads/resume-a.docx',
        sourceName: 'resume-a.docx',
        displayName: 'Alice Chen',
        displayCompany: '康为科技有限公司',
        displayProjects: ['Smart Park Platform', 'Payment Integration'],
        displaySkills: ['Product Design', 'SQL'],
        displaySummary: 'Product-oriented profile with smart park and payment delivery experience.',
      },
    ],
  }));

  assert.deepEqual(resolution, {
    profiles: [
      {
        sourcePath: 'storage/files/uploads/resume-a.docx',
        sourceName: 'resume-a.docx',
        displayName: 'Alice Chen',
        displayCompany: '康为科技有限公司',
        displayProjects: ['Smart Park Platform', 'Payment Integration'],
        displaySkills: ['Product Design', 'SQL'],
        displaySummary: 'Product-oriented profile with smart park and payment delivery experience.',
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
        displayName: 'Alice Chen',
        displayCompany: '康为科技有限公司',
        displayProjects: ['Smart Park Platform'],
        displaySkills: ['Product Design'],
        displaySummary: 'Useful for a client-facing resume report page.',
      },
    ],
  });

  assert.match(block, /Resume display profiles:/);
  assert.match(block, /Alice Chen/);
  assert.match(block, /康为科技有限公司/);
  assert.match(block, /Smart Park Platform/);
});

test('buildResumeDisplaySeedProfiles should derive stable local seed profiles from resume documents', () => {
  const profiles = buildResumeDisplaySeedProfiles([
    {
      path: 'storage/files/uploads/resume-a.docx',
      name: 'resume-a.docx',
      ext: '.docx',
      title: 'Alice Chen Resume',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: 'Alice Chen, product manager, recently worked at 康为科技有限公司 on 智慧园区平台.',
      excerpt: 'Alice Chen, product manager, recently worked at 康为科技有限公司 on 智慧园区平台.',
      extractedChars: 2048,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: 'Alice Chen',
        currentRole: 'Product Manager',
        latestCompany: '康为科技有限公司',
        projectHighlights: ['智慧园区平台'],
        skills: ['SQL', 'Product Design'],
      },
    },
  ] as ParsedDocument[]);

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0]?.displayName, 'Alice Chen');
  assert.equal(profiles[0]?.displayCompany, '康为科技有限公司');
  assert.ok(profiles[0]?.displayProjects.includes('智慧园区平台'));
  assert.ok(profiles[0]?.displaySkills.includes('SQL'));
});

test('buildResumeDisplaySeedProfiles should suppress weak project phrases and noisy summaries', () => {
  const profiles = buildResumeDisplaySeedProfiles([
    {
      path: 'storage/files/uploads/resume-b.docx',
      name: 'resume-b.docx',
      ext: '.docx',
      title: 'Xie Zeqiang Resume',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: 'a、负责建筑智能化项目立项，制定完整的销售方案，完成项目的投标、签约；',
      excerpt: 'a、负责建筑智能化项目立项，制定完整的销售方案，完成项目的投标、签约；',
      extractedChars: 2048,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '谢泽强',
        currentRole: '解决方案经理',
        latestCompany: '深圳达实智能股份有限公司',
        yearsOfExperience: '16年',
        projectHighlights: ['完整的销售方案', '优化了平台', '智慧园区管理平台'],
        skills: ['Java', '数据分析'],
      },
    },
  ] as ParsedDocument[]);

  assert.equal(profiles.length, 1);
  assert.deepEqual(profiles[0]?.displayProjects, ['智慧园区管理平台']);
  assert.doesNotMatch(profiles[0]?.displaySummary || '', /负责建筑智能化项目立项|完整的销售方案/);
  assert.match(profiles[0]?.displaySummary || '', /解决方案经理|深圳达实智能股份有限公司|Java/);
});

test('buildResumeDisplaySeedProfiles should prefer enterprise employers over association labels', () => {
  const profiles = buildResumeDisplaySeedProfiles([
    {
      path: 'storage/files/uploads/resume-c.docx',
      name: 'resume-c.docx',
      ext: '.docx',
      title: 'Li Ming Resume',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '李明，8年经验，曾任川渝MBA企业家联合会及西南校友经济研究院项目顾问，后加入广州阿凡提电子科技有限公司。',
      excerpt: '李明，8年经验。',
      extractedChars: 2048,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '李明',
        latestCompany: '川渝MBA企业家联合会及西南校友经济研究院',
        companies: ['川渝MBA企业家联合会及西南校友经济研究院', '广州阿凡提电子科技有限公司'],
        yearsOfExperience: '8年',
        skills: ['Java', 'SQL'],
        projectHighlights: ['智慧园区管理平台'],
      },
    },
  ] as ParsedDocument[]);

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0]?.displayCompany, '广州阿凡提电子科技有限公司');
  assert.doesNotMatch(profiles[0]?.displaySummary || '', /联合会|研究院/);
});

test('buildResumeDisplaySeedProfiles should recover enterprise employer from summary text', () => {
  const profiles = buildResumeDisplaySeedProfiles([
    {
      path: 'storage/files/uploads/resume-d.docx',
      name: 'resume-d.docx',
      ext: '.docx',
      title: 'Wang Lei Resume',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '王磊，10年经验，先后服务于川渝MBA企业家联合会及西南校友经济研究院、广州汇聚智能科技，负责智慧园区管理平台。',
      excerpt: '王磊，10年经验。',
      extractedChars: 2048,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '王磊',
        latestCompany: '',
        companies: [],
        yearsOfExperience: '10年',
        skills: ['Java', 'SQL'],
        projectHighlights: ['智慧园区管理平台'],
      },
    },
  ] as ParsedDocument[]);

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0]?.displayCompany, '广州汇聚智能科技');
});

test('buildResumeDisplaySeedProfiles should prefer full names over honorific-only aliases when context is stronger', () => {
  const profiles = buildResumeDisplaySeedProfiles([
    {
      path: 'storage/files/uploads/resume-e.docx',
      name: 'resume-e.docx',
      ext: '.docx',
      title: '曾海峰简历',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '曾海峰，11年经验，广州正善诚合互联网科技有限公司，全栈工程师，负责支付中台和数据服务交付。',
      excerpt: '曾海峰，11年经验。',
      extractedChars: 2048,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '曾先生',
        latestCompany: '广州正善诚合互联网科技有限公司',
        yearsOfExperience: '11年',
        skills: ['Python', 'Go', 'SQL'],
        projectHighlights: ['支付中台'],
      },
    },
  ] as ParsedDocument[]);

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0]?.displayName, '曾海峰');
  assert.equal(profiles[0]?.displayCompany, '广州正善诚合互联网科技有限公司');
});

test('buildResumeDisplaySeedProfiles should recover concise project labels from summary context when highlights are empty', () => {
  const profiles = buildResumeDisplaySeedProfiles([
    {
      path: 'storage/files/uploads/resume-f.docx',
      name: 'resume-f.docx',
      ext: '.docx',
      title: '\u9648\u68ee\u806a\u7b80\u5386',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '\u9648\u68ee\u806a\u5728\u5e7f\u5dde\u5353\u52e4\u4fe1\u606f\u6280\u672f\u6709\u9650\u516c\u53f8\u4e3b\u8981\u8d1f\u8d23\u5bf9\u516c\u53f8\u667a\u6167\u56ed\u533a\u7ba1\u7406\u5e73\u53f0\u4e0e\u652f\u4ed8\u4e2d\u53f0\u5efa\u8bbe\u3002',
      excerpt: '\u4e3b\u5bfc\u667a\u6167\u56ed\u533a\u7ba1\u7406\u5e73\u53f0\u7684\u4e1a\u52a1\u6a21\u5757\u4e0e\u6570\u636e\u5e73\u53f0\u5efa\u8bbe\u3002',
      extractedChars: 2048,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '\u9648\u68ee\u806a',
        latestCompany: '\u5e7f\u5dde\u5353\u52e4\u4fe1\u606f\u6280\u672f\u6709\u9650\u516c\u53f8',
        yearsOfExperience: '9 years',
        projectHighlights: [],
        skills: ['Java', 'SQL'],
      },
    },
  ] as ParsedDocument[]);

  assert.equal(profiles.length, 1);
  assert.match(JSON.stringify(profiles[0]?.displayProjects || []), /\u667a\u6167\u56ed\u533a\u7ba1\u7406\u5e73\u53f0/);
  assert.match(JSON.stringify(profiles[0]?.displayProjects || []), /\u652f\u4ed8\u4e2d\u53f0/);
});

test('buildResumeDisplaySeedProfiles should drop generic role labels and trim leading project fragments', () => {
  const profiles = buildResumeDisplaySeedProfiles([
    {
      path: 'storage/files/uploads/resume-g.docx',
      name: 'resume-g.docx',
      ext: '.docx',
      title: '\u6c42\u804c\u610f\u5411',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '\u5728\u5e7f\u5dde\u6c47\u805a\u667a\u80fd\u79d1\u6280\u53c2\u4e0e\u8fc7\u5171\u4eab\u5145\u7535\u7cfb\u7edf\u4e0eAI\u89c6\u89c9\u5e94\u7528\u5efa\u8bbe\u3002',
      excerpt: '\u53c2\u4e0e\u8fc7\u5171\u4eab\u5145\u7535\u7cfb\u7edf\u4ea4\u4ed8\u3002',
      extractedChars: 2048,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '\u6c42\u804c\u610f\u5411',
        latestCompany: '\u5e7f\u5dde\u6c47\u805a\u667a\u80fd\u79d1\u6280',
        yearsOfExperience: '10 years',
        projectHighlights: ['\u8fc7\u5171\u4eab\u5145\u7535\u7cfb\u7edf'],
        skills: ['Java', 'Go'],
      },
    },
  ] as ParsedDocument[]);

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0]?.displayName, '');
  assert.match(JSON.stringify(profiles[0]?.displayProjects || []), /\u5171\u4eab\u5145\u7535\u7cfb\u7edf/);
  assert.doesNotMatch(JSON.stringify(profiles[0]?.displayProjects || []), /\u8fc7\u5171\u4eab\u5145\u7535\u7cfb\u7edf|\u6c42\u804c\u610f\u5411/);
});

test('runResumeDisplayProfileResolver should fall back to local seed profiles when gateway is not configured', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  const documents: ParsedDocument[] = [
    {
      path: 'storage/files/uploads/resume-a.docx',
      name: 'resume-a.docx',
      ext: '.docx',
      title: 'Alice Chen Resume',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: 'Alice Chen, product manager, recently worked at 康为科技有限公司 on Smart Park Platform.',
      excerpt: 'Alice Chen, product manager, recently worked at 康为科技有限公司 on Smart Park Platform.',
      extractedChars: 2048,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: 'Alice Chen',
        latestCompany: '康为科技有限公司',
        projectHighlights: ['Smart Park Platform'],
        skills: ['SQL'],
      },
    },
  ];

  try {
    const resolution = await runResumeDisplayProfileResolver({
      requestText: 'Create a client-facing resume page',
      documents,
    });
    assert.equal(resolution?.profiles.length, 1);
    assert.equal(resolution?.profiles[0]?.displayName, 'Alice Chen');
    assert.equal(resolution?.profiles[0]?.displayCompany, '康为科技有限公司');
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;

    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});
