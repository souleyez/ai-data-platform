import test from 'node:test';
import assert from 'node:assert/strict';
import {
  explicitlyRejectsKnowledgeMode,
  isKnowledgeCancelPhrase,
} from '../src/lib/knowledge-intent.js';

test('knowledge cancel phrase should only match explicit cancel replies', () => {
  assert.equal(isKnowledgeCancelPhrase('\u4e0d\u7528\u4e86'), true);
  assert.equal(isKnowledgeCancelPhrase('\u53d6\u6d88'), true);
  assert.equal(isKnowledgeCancelPhrase('\u666e\u901a\u56de\u7b54\u5c31\u884c'), false);
});

test('knowledge rejection phrases should force general chat mode', () => {
  assert.equal(explicitlyRejectsKnowledgeMode('\u4e0d\u8981\u6309\u5e93\uff0c\u76f4\u63a5\u56de\u7b54'), true);
  assert.equal(explicitlyRejectsKnowledgeMode('\u4e0d\u7528\u67e5\u77e5\u8bc6\u5e93'), true);
  assert.equal(explicitlyRejectsKnowledgeMode('\u5e2e\u6211\u57fa\u4e8e\u7b80\u5386\u5e93\u8f93\u51fa\u8868\u683c'), false);
});
