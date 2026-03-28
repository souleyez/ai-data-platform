import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import {
  buildKnowledgeRetrievalQuery,
  filterDocumentsByContentFocus,
  filterDocumentsByTimeRange,
} from '../src/lib/knowledge-evidence.js';

function makeDocument(overrides: Partial<ParsedDocument>): ParsedDocument {
  return {
    path: 'C:/tmp/1700000000000-default.txt',
    name: 'default.txt',
    ext: '.txt',
    title: '默认文档',
    category: 'technical',
    bizCategory: 'general',
    parseStatus: 'parsed',
    summary: '默认摘要',
    excerpt: '默认摘要',
    extractedChars: 120,
    topicTags: [],
    groups: [],
    confirmedGroups: [],
    suggestedGroups: [],
    ...overrides,
  };
}

test('filterDocumentsByTimeRange should honor recent time windows inside a library', () => {
  const now = Date.now();
  const recent = makeDocument({
    path: `C:/tmp/${now - 2 * 24 * 60 * 60 * 1000}-recent.txt`,
    name: 'recent.txt',
    title: '近期简历',
    detailParsedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const old = makeDocument({
    path: `C:/tmp/${now - 120 * 24 * 60 * 60 * 1000}-old.txt`,
    name: 'old.txt',
    title: '历史简历',
    detailParsedAt: new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const result = filterDocumentsByTimeRange([old, recent], '最近一个月');

  assert.deepEqual(result.map((item) => item.title), ['近期简历']);
});

test('filterDocumentsByContentFocus should prefer company and project focused resume documents', () => {
  const projectResume = makeDocument({
    title: 'IT 项目简历',
    summary: '候选人在多家公司参与 ERP、接口平台和数据中台项目。',
    structuredProfile: {
      companies: ['甲公司', '乙公司'],
      projectHighlights: ['ERP 实施', 'API 平台建设'],
      itProjectHighlights: ['数据中台', '接口治理'],
    },
  });
  const genericResume = makeDocument({
    title: '通用简历',
    summary: '候选人负责团队管理和日常沟通。',
    structuredProfile: {
      companies: ['丙公司'],
      highlights: ['团队协作'],
    },
  });

  const result = filterDocumentsByContentFocus(
    [genericResume, projectResume],
    '按公司维度整理 IT 项目信息',
  );

  assert.equal(result[0]?.title, 'IT 项目简历');
});

test('buildKnowledgeRetrievalQuery should retain time, content and library hints', () => {
  const query = buildKnowledgeRetrievalQuery(
    '基于人才简历库输出公司维度 IT 项目表格',
    [{ key: 'resume', label: '人才简历库' }],
    {
      timeRange: '全部时间',
      contentFocus: '公司维度 IT 项目',
    },
  );

  assert.match(query, /公司维度 IT 项目/);
  assert.match(query, /全部时间/);
  assert.match(query, /人才简历库/);
  assert.doesNotMatch(query, /输出/);
});
