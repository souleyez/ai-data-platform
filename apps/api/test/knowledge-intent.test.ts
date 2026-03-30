import test from 'node:test';
import assert from 'node:assert/strict';
import {
  explicitlyRejectsKnowledgeMode,
  isKnowledgeCancelPhrase,
  looksLikeKnowledgeAnswerIntent,
  looksLikeKnowledgeOutputIntent,
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

test('knowledge output intent should activate when output request and scope are both clear', () => {
  const matched = looksLikeKnowledgeOutputIntent({
    prompt: '\u8bf7\u57fa\u4e8e\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u7b80\u5386\uff0c\u6309\u516c\u53f8\u7ef4\u5ea6\u6574\u7406\u6d89\u53ca\u516c\u53f8\u7684IT\u9879\u76ee\u4fe1\u606f\uff0c\u751f\u6210\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875\u62a5\u8868\u3002',
    libraries: [{ key: 'resume', label: '\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93' }],
    hasDocumentDetailFollowup: false,
  });

  assert.equal(matched, true);
});

test('knowledge answer intent should stay in answer mode for detail questions', () => {
  const matched = looksLikeKnowledgeAnswerIntent({
    prompt: '\u521a\u4e0a\u4f20\u7684\u7b80\u5386\u91cc\u7b2c\u4e00\u5b66\u5386\u548c\u6700\u8fd1\u516c\u53f8\u5206\u522b\u662f\u4ec0\u4e48\uff1f',
    libraries: [{ key: 'resume', label: '\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93' }],
    hasDocumentDetailFollowup: false,
  });

  assert.equal(matched, true);
});

test('knowledge answer intent should activate for latest resume comparison requests inside knowledge scope', () => {
  const matched = looksLikeKnowledgeAnswerIntent({
    prompt: '\u770b\u770b\u7b80\u5386\u77e5\u8bc6\u5e93\u5185\u7684\u7b80\u5386\uff0c\u6700\u65b0\u7684\u51e0\u4efd\u5bf9\u6bd4\u4e0b',
    libraries: [{ key: 'resume', label: '\u7b80\u5386' }],
    hasDocumentDetailFollowup: false,
  });

  assert.equal(matched, true);
});

test('document followup flag should not be misclassified as knowledge answer', () => {
  const matched = looksLikeKnowledgeAnswerIntent({
    prompt: '\u8be6\u7ec6\u770b\u770b\u6211\u521a\u4e0a\u4f20\u7684\u6587\u6863\u91cc\u6709\u54ea\u4e9b\u63a5\u53e3\u5b57\u6bb5\uff1f',
    libraries: [],
    hasDocumentDetailFollowup: true,
  });

  assert.equal(matched, false);
});
