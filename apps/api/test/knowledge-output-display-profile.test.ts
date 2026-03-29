import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import { buildKnowledgeFallbackOutput } from '../src/lib/knowledge-output.js';
import type { ResumeDisplayProfile } from '../src/lib/resume-display-profile-provider.js';

test('buildKnowledgeFallbackOutput should prefer cleaned resume display profiles for client pages', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'storage/files/uploads/resume-a.docx',
      name: 'default-sample-resume-candidate-a.docx',
      ext: '.docx',
      title: '个人基本信息',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: 'related_to 原始简历摘要，包含个人信息和噪声片段。',
      excerpt: 'related_to',
      extractedChars: 2048,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '个人',
        latestCompany: 'related_to',
        skills: ['related_to', 'AIGC智能'],
        projectHighlights: ['完整的销售方案', '优化了平台'],
      },
    },
  ];

  const displayProfiles: ResumeDisplayProfile[] = [
    {
      sourcePath: 'storage/files/uploads/resume-a.docx',
      sourceName: 'default-sample-resume-candidate-a.docx',
      displayName: '曹伟煊',
      displayCompany: '康为科技有限公司',
      displayProjects: ['智慧园区中台', '支付平台整合', '完整的销售方案'],
      displaySkills: ['产品规划', '数字化解决方案'],
      displaySummary: 'a、负责建筑智能化项目立项，制定完整的销售方案，完成项目投标和签约；',
    },
  ];

  const output = buildKnowledgeFallbackOutput(
    'page',
    '请基于人才简历知识库中的全部简历，为客户汇报准备一页可视化静态页。',
    documents,
    {
      title: '简历客户汇报静态页',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按客户汇报视角生成简历静态页',
      pageSections: ['客户概览', '代表候选人', '代表项目', '技能覆盖', '匹配建议', 'AI综合分析'],
    },
    displayProfiles,
  );

  assert.equal(output.type, 'page');
  const pageJson = JSON.stringify(output.page);
  assert.match(pageJson, /曹伟煊/);
  assert.match(pageJson, /康为科技有限公司/);
  assert.match(pageJson, /智慧园区中台/);
  assert.match(pageJson, /产品规划/);
  assert.doesNotMatch(pageJson, /default-sample-resume|related_to/i);
  assert.doesNotMatch(pageJson, /完整的销售方案|优化了平台|负责建筑智能化项目立项/);
});

test('buildKnowledgeFallbackOutput should hide generic role labels and trim weak resume project prefixes from display profiles', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'storage/files/uploads/resume-g.docx',
      name: 'resume-g.docx',
      ext: '.docx',
      title: '\u6c42\u804c\u610f\u5411',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '\u6765\u81ea\u5e7f\u5dde\u6c47\u805a\u667a\u80fd\u79d1\u6280\u7684\u5019\u9009\u4eba\uff0c\u53c2\u4e0e\u8fc7\u5171\u4eab\u5145\u7535\u7cfb\u7edf\u4e0eAI\u89c6\u89c9\u5e94\u7528\u3002',
      excerpt: '\u53c2\u4e0e\u8fc7\u5171\u4eab\u5145\u7535\u7cfb\u7edf\u3002',
      extractedChars: 1024,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '\u6c42\u804c\u610f\u5411',
        latestCompany: '\u5e7f\u5dde\u6c47\u805a\u667a\u80fd\u79d1\u6280',
        skills: ['Java', 'Go'],
        projectHighlights: ['\u8fc7\u5171\u4eab\u5145\u7535\u7cfb\u7edf'],
      },
    },
  ];

  const displayProfiles: ResumeDisplayProfile[] = [
    {
      sourcePath: 'storage/files/uploads/resume-g.docx',
      sourceName: 'resume-g.docx',
      displayName: '\u6c42\u804c\u610f\u5411',
      displayCompany: '\u5e7f\u5dde\u6c47\u805a\u667a\u80fd\u79d1\u6280',
      displayProjects: ['\u8fc7\u5171\u4eab\u5145\u7535\u7cfb\u7edf'],
      displaySkills: ['Java', 'Go'],
      displaySummary: '\u53c2\u4e0e\u8fc7\u5171\u4eab\u5145\u7535\u7cfb\u7edf\u4ea4\u4ed8\u3002',
    },
  ];

  const output = buildKnowledgeFallbackOutput(
    'page',
    '\u57fa\u4e8e\u7b80\u5386\u5e93\u751f\u6210\u4e00\u4efd\u9002\u5408\u5ba2\u6237\u6c47\u62a5\u7684\u9759\u6001\u9875\uff0c\u91cd\u70b9\u770b\u5019\u9009\u4eba\u4e0e\u9879\u76ee\u7ecf\u5386\u3002',
    documents,
    {
      title: '\u7b80\u5386\u5ba2\u6237\u6c47\u62a5\u9759\u6001\u9875',
      fixedStructure: [],
      variableZones: [],
      outputHint: '\u751f\u6210\u4e00\u4efd\u6e05\u6670\u3001\u53ef\u6c47\u62a5\u7684\u7b80\u5386\u5ba2\u6237\u9759\u6001\u9875\u3002',
      pageSections: ['\u5ba2\u6237\u6982\u89c8', '\u4ee3\u8868\u5019\u9009\u4eba', '\u4ee3\u8868\u9879\u76ee', '\u6280\u80fd\u8986\u76d6', '\u5339\u914d\u5efa\u8bae', 'AI\u7efc\u5408\u5206\u6790'],
    },
    displayProfiles,
  );

  assert.equal(output.type, 'page');
  const pageJson = JSON.stringify(output.page);
  assert.match(pageJson, /\u5171\u4eab\u5145\u7535\u7cfb\u7edf/);
  assert.doesNotMatch(pageJson, /\u6c42\u804c\u610f\u5411|\u8fc7\u5171\u4eab\u5145\u7535\u7cfb\u7edf/);
});
