import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLatestParsedDocumentFullTextContextBlock,
  buildRecentUploadSummaryContextBlock,
  shouldIncludeUploadedDocumentFullText,
  selectLatestDetailedFullTextDocument,
} from '../src/lib/knowledge-chat-dispatch.js';
import type { ParsedDocument } from '../src/lib/document-parser.js';

function createDocument(overrides: Partial<ParsedDocument>): ParsedDocument {
  return {
    path: 'C:/docs/sample.txt',
    name: 'sample.txt',
    ext: '.txt',
    title: 'sample',
    category: 'general',
    bizCategory: 'general',
    parseStatus: 'parsed',
    summary: 'summary',
    excerpt: 'excerpt',
    extractedChars: 120,
    ...overrides,
  };
}

test('selectLatestDetailedFullTextDocument should prefer the latest detailed parsed document with full text', () => {
  const documents = [
    createDocument({
      path: 'C:/docs/1775000000000-older.txt',
      title: 'older',
      fullText: 'older full text',
      parseStage: 'detailed',
      detailParseStatus: 'succeeded',
      detailParsedAt: '2026-04-01T00:00:00.000Z',
    }),
    createDocument({
      path: 'C:/docs/1776000000000-latest.txt',
      title: 'latest',
      fullText: 'latest full text',
      parseStage: 'detailed',
      detailParseStatus: 'succeeded',
      detailParsedAt: '2026-04-09T00:00:00.000Z',
    }),
    createDocument({
      path: 'C:/docs/1777000000000-quick.txt',
      title: 'quick',
      fullText: 'quick parse only',
      parseStage: 'quick',
      detailParseStatus: 'queued',
      detailParsedAt: undefined,
    }),
  ];

  const selected = selectLatestDetailedFullTextDocument(documents);

  assert.equal(selected?.title, 'latest');
  assert.equal(selected?.fullText, 'latest full text');
});

test('selectLatestDetailedFullTextDocument should prefer uploaded documents over generated report library items', () => {
  const documents = [
    createDocument({
      path: 'C:/storage/files/generated-report-library/report-output-report-1776000000000.md',
      title: 'generated-report',
      fullText: 'generated report text',
      parseStage: 'detailed',
      detailParseStatus: 'succeeded',
      detailParsedAt: '2026-04-09T12:00:00.000Z',
    }),
    createDocument({
      path: 'C:/storage/files/uploads/1775000000000-bid.pdf',
      title: 'uploaded-bid',
      fullText: 'bid full text',
      parseStage: 'detailed',
      detailParseStatus: 'succeeded',
      detailParsedAt: '2026-04-09T11:00:00.000Z',
    }),
  ];

  const selected = selectLatestDetailedFullTextDocument(documents);

  assert.equal(selected?.title, 'uploaded-bid');
  assert.equal(selected?.fullText, 'bid full text');
});

test('selectLatestDetailedFullTextDocument should honor an explicit preferred document path', () => {
  const documents = [
    createDocument({
      path: 'C:/storage/files/uploads/1775000000000-bid.pdf',
      title: 'uploaded-bid',
      fullText: 'bid full text',
      parseStage: 'detailed',
      detailParseStatus: 'succeeded',
      detailParsedAt: '2026-04-09T11:00:00.000Z',
    }),
    createDocument({
      path: 'C:/storage/files/uploads/1776000000000-newer.md',
      title: 'newer-doc',
      fullText: 'newer doc text',
      parseStage: 'detailed',
      detailParseStatus: 'succeeded',
      detailParsedAt: '2026-04-09T12:00:00.000Z',
    }),
  ];

  const selected = selectLatestDetailedFullTextDocument(
    documents,
    'C:/storage/files/uploads/1775000000000-bid.pdf',
  );

  assert.equal(selected?.title, 'uploaded-bid');
  assert.equal(selected?.fullText, 'bid full text');
});

test('buildLatestParsedDocumentFullTextContextBlock should include full text without additional routing instructions', () => {
  const block = buildLatestParsedDocumentFullTextContextBlock({
    title: '开平市停车项目招标文件',
    name: 'bid.pdf',
    path: 'C:/docs/bid.pdf',
    schemaType: 'technical',
    parseStage: 'detailed',
    detailParseStatus: 'succeeded',
    fullText: '第一章 招标公告\n第二章 投标人须知',
  });

  assert.match(block, /Latest parsed document full text:/);
  assert.match(block, /开平市停车项目招标文件/);
  assert.match(block, /第一章 招标公告/);
  assert.doesNotMatch(block, /请优先|先分析|再输出|must|should/i);
});

test('buildLatestParsedDocumentFullTextContextBlock should cap uploaded document context at 5000 chars', () => {
  const block = buildLatestParsedDocumentFullTextContextBlock({
    title: 'oversized-md',
    name: 'oversized.md',
    path: 'C:/docs/oversized.md',
    schemaType: 'generic',
    parseStage: 'detailed',
    detailParseStatus: 'succeeded',
    markdownText: `# 标题\n\n${'正文'.repeat(4000)}`,
  });

  assert.ok(block.length < 5600);
  assert.match(block, /Full text:/);
  assert.match(block, /…/);
});

test('buildLatestParsedDocumentFullTextContextBlock should return empty string when full text is missing', () => {
  assert.equal(buildLatestParsedDocumentFullTextContextBlock(null), '');
  assert.equal(buildLatestParsedDocumentFullTextContextBlock({
    title: 'empty',
    name: 'empty.txt',
    path: 'C:/docs/empty.txt',
    schemaType: 'generic',
    parseStage: 'detailed',
    detailParseStatus: 'succeeded',
    fullText: '',
  }), '');
});

test('buildLatestParsedDocumentFullTextContextBlock should use markdown text when full text is empty', () => {
  const block = buildLatestParsedDocumentFullTextContextBlock({
    title: 'web-capture-md',
    name: 'capture.md',
    path: 'C:/docs/capture.md',
    schemaType: 'generic',
    parseStage: 'detailed',
    detailParseStatus: 'succeeded',
    fullText: '',
    markdownText: '# 页面正文\n\n这是 Markdown 供料',
  });

  assert.match(block, /页面正文/);
  assert.match(block, /Markdown 供料/);
});

test('buildRecentUploadSummaryContextBlock should include uploaded summary items and trim long text', () => {
  const block = buildRecentUploadSummaryContextBlock({
    uploadedAt: '2026-04-13T12:00:00.000Z',
    items: [
      {
        path: 'C:/docs/order-analysis.xlsx',
        name: '订单分析',
        docType: 'spreadsheet',
        summary: `这是上传摘要 ${'内容'.repeat(180)}`,
        libraries: [{ key: 'orders', label: '订单分析数据集' }],
      },
    ],
  });

  assert.match(block, /Recent uploaded documents summary:/);
  assert.match(block, /订单分析/);
  assert.match(block, /订单分析数据集/);
  assert.match(block, /…/);
  assert.ok(block.length < 500);
});

test('shouldIncludeUploadedDocumentFullText should only accept explicit uploaded-document questions with a preferred path', () => {
  assert.equal(shouldIncludeUploadedDocumentFullText('', ''), false);
  assert.equal(shouldIncludeUploadedDocumentFullText('请总结一下这份文档', ''), false);
  assert.equal(shouldIncludeUploadedDocumentFullText('请总结一下这份文档', null), false);
  assert.equal(
    shouldIncludeUploadedDocumentFullText(
      '请基于刚上传的文档总结重点',
      'C:/storage/files/uploads/1775000000000-bid.pdf',
    ),
    true,
  );
  assert.equal(
    shouldIncludeUploadedDocumentFullText(
      '分析最近30天订单趋势',
      'C:/storage/files/uploads/1775000000000-bid.pdf',
    ),
    false,
  );
});
