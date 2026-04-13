import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreviewItemFromDocument } from '../src/lib/ingest-feedback.js';
import type { ParsedDocument } from '../src/lib/document-parser.js';

function createDocument(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    path: 'C:/storage/files/uploads/1775000000000-bid.pdf',
    name: 'bid.pdf',
    ext: '.pdf',
    title: '招标文件',
    category: 'general',
    bizCategory: 'general',
    parseStatus: 'parsed',
    summary: '项目招标范围与技术要求摘要',
    excerpt: '项目招标范围与技术要求摘要',
    extractedChars: 120,
    ...overrides,
  };
}

test('buildPreviewItemFromDocument should keep the uploaded document path for one-time chat handoff', () => {
  const item = buildPreviewItemFromDocument(createDocument());

  assert.equal(item.status, 'success');
  assert.equal(item.path, 'C:/storage/files/uploads/1775000000000-bid.pdf');
  assert.equal(item.preview?.title, '招标文件');
});
