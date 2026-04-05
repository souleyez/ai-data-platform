import test from 'node:test';
import assert from 'node:assert/strict';

import { refreshDerivedSchemaProfile } from '../src/lib/document-schema.js';
import type { ParsedDocument } from '../src/lib/document-parser.js';

test('refreshDerivedSchemaProfile should preserve manually edited structured profile', () => {
  const item = {
    path: 'C:/docs/contract.txt',
    name: 'contract.txt',
    ext: '.txt',
    title: '测试合同',
    category: 'contract',
    bizCategory: 'contract',
    parseStatus: 'parsed',
    parseStage: 'detailed',
    parseMethod: 'text-utf8',
    summary: '手工修正后的合同摘要',
    excerpt: '手工修正后的合同摘要',
    extractedChars: 24,
    topicTags: ['合同'],
    structuredProfile: {
      title: '测试合同',
      summary: '手工结构化摘要',
      contractNo: 'HT-001',
      amount: '1000',
    },
    manualStructuredProfile: true,
  } satisfies ParsedDocument;

  const refreshed = refreshDerivedSchemaProfile(item);

  assert.deepEqual(refreshed.structuredProfile, item.structuredProfile);
  assert.equal(refreshed.schemaType, 'contract');
});
