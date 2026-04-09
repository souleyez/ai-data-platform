import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLatestParsedDocumentFullTextContextBlock,
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
