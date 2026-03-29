import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import { buildKnowledgeFallbackOutput } from '../src/lib/knowledge-output.js';
import type { ResumeDisplayProfile } from '../src/lib/resume-display-profile-provider.js';

test('buildKnowledgeFallbackOutput should prefer model-derived resume display profiles for client pages', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'storage/files/uploads/resume-a.docx',
      name: 'default-sample-resume-candidate-a.docx',
      ext: '.docx',
      title: '个人基本信息',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: 'related_to 原始简历摘要，包含智能化和个人信息片段。',
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
      displayProjects: ['智慧园区中台', '支付平台整合'],
      displaySkills: ['产品规划', '数字化解决方案'],
      displaySummary: '候选人最近聚焦智慧园区和支付场景，适合客户汇报和初筛展示。',
    },
  ];

  const output = buildKnowledgeFallbackOutput(
    'page',
    '请基于人才简历知识库中全部时间范围的简历，为客户汇报准备一页可视化静态页，需要突出人才概览、代表项目、核心技能、匹配建议和 AI 综合分析。',
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
  assert.doesNotMatch(pageJson, /完整的销售方案|优化了平台/);
});
