import test from 'node:test';
import assert from 'node:assert/strict';
import {
  documentMatchesLibrary,
  UNGROUPED_LIBRARY_KEY,
  UNGROUPED_LIBRARY_LABEL,
  type DocumentLibrary,
} from '../src/lib/document-libraries.js';
import type { ParsedDocument } from '../src/lib/document-parser.js';

test('documentMatchesLibrary should match ungrouped documents to the ungrouped library', () => {
  const library: DocumentLibrary = {
    key: UNGROUPED_LIBRARY_KEY,
    label: UNGROUPED_LIBRARY_LABEL,
    createdAt: '2026-03-31T00:00:00.000Z',
  };
  const item = {
    path: 'C:\\tmp\\image-upload.png',
    name: 'image-upload.png',
    ext: '.png',
    title: 'image-upload',
    category: 'general',
    bizCategory: 'general',
    parseStatus: 'parsed',
    summary: 'Image file: image-upload.png',
    excerpt: 'Image file: image-upload.png',
    extractedChars: 32,
    groups: [],
    confirmedGroups: [],
  } satisfies ParsedDocument;

  assert.equal(documentMatchesLibrary(item, library), true);
});

test('documentMatchesLibrary should not rely on legacy bizCategory when no explicit groups exist', () => {
  const library: DocumentLibrary = {
    key: 'order',
    label: '订单分析',
    createdAt: '2026-03-31T00:00:00.000Z',
  };
  const item = {
    path: 'C:\\tmp\\legacy-order.csv',
    name: 'legacy-order.csv',
    ext: '.csv',
    title: 'legacy-order',
    category: 'general',
    bizCategory: 'order',
    parseStatus: 'parsed',
    summary: 'legacy order data',
    excerpt: 'legacy order data',
    extractedChars: 17,
    groups: [],
    confirmedGroups: [],
  } satisfies ParsedDocument;

  assert.equal(documentMatchesLibrary(item, library), false);
});
