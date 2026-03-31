import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import {
  buildKnowledgeContext,
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
    '基于人才简历知识库输出公司维度 IT 项目表格',
    [{ key: 'resume', label: '人才简历知识库' }],
    {
      timeRange: '全部时间',
      contentFocus: '公司维度 IT 项目',
    },
  );

  assert.match(query, /公司维度 IT 项目/);
  assert.match(query, /全部时间/);
  assert.match(query, /人才简历知识库/);
  assert.doesNotMatch(query, /输出/);
});

test('buildKnowledgeContext should honor compact limits for lighter output prompts', () => {
  const documents = [
    makeDocument({
      path: 'C:/tmp/1700000000100-order-1.csv',
      name: 'order-1.csv',
      title: '订单汇总 A',
      summary: '覆盖多渠道经营和库存健康。',
      excerpt: 'excerpt-a',
      structuredProfile: {
        platformSignals: ['tmall', 'jd', 'douyin'],
        metricSignals: ['gmv', 'inventory-index'],
      },
      claims: [
        { subject: 'A', predicate: 'focus', object: 'GMV' },
        { subject: 'A', predicate: 'risk', object: 'inventory' },
      ],
      evidenceChunks: [
        { text: 'evidence-a-1' },
        { text: 'evidence-a-2' },
      ],
    }),
    makeDocument({
      path: 'C:/tmp/1700000000200-order-2.csv',
      name: 'order-2.csv',
      title: '订单汇总 B',
      summary: '覆盖补货优先级和断货预警。',
      structuredProfile: {
        replenishmentSignals: ['replenishment', 'restock'],
        anomalySignals: ['anomaly'],
      },
      claims: [{ subject: 'B', predicate: 'focus', object: 'restock' }],
      evidenceChunks: [{ text: 'evidence-b-1' }],
    }),
  ] as ParsedDocument[];

  const context = buildKnowledgeContext(
    '基于订单分析知识库生成库存与补货驾驶舱',
    [{ key: 'orders', label: '订单分析' }],
    {
      documents,
      evidenceMatches: documents.flatMap((item) => (item.evidenceChunks || []).map((chunk) => ({
        item,
        chunkText: typeof chunk === 'string' ? chunk : chunk.text || '',
      }))),
    },
    undefined,
    {
      maxDocuments: 1,
      maxEvidence: 2,
      summaryLength: 10,
      includeExcerpt: false,
      maxClaimsPerDocument: 1,
      maxEvidenceChunksPerDocument: 1,
      maxStructuredProfileEntries: 1,
      maxStructuredArrayValues: 2,
    },
  );

  assert.match(context, /文档 1: 订单汇总 B|文档 1: 订单汇总 A/);
  assert.doesNotMatch(context, /文档 2:/);
  assert.doesNotMatch(context, /excerpt-a/);
  assert.doesNotMatch(context, /2\. A risk inventory/);
  assert.doesNotMatch(context, /2\. evidence-a-2/);
});
