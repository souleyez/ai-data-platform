import test from 'node:test';
import assert from 'node:assert/strict';
import {
  explicitlyRejectsKnowledgeMode,
  isKnowledgeCancelPhrase,
  looksLikeKnowledgeAnswerIntent,
  looksLikeKnowledgeOutputIntent,
} from '../src/lib/knowledge-intent.js';

test('knowledge cancel phrase should only match explicit cancel replies', () => {
  assert.equal(isKnowledgeCancelPhrase('不用了'), true);
  assert.equal(isKnowledgeCancelPhrase('取消'), true);
  assert.equal(isKnowledgeCancelPhrase('普通回答就行'), false);
});

test('knowledge rejection phrases should force general chat mode', () => {
  assert.equal(explicitlyRejectsKnowledgeMode('不要按库，直接回答'), true);
  assert.equal(explicitlyRejectsKnowledgeMode('不用查知识库'), true);
  assert.equal(explicitlyRejectsKnowledgeMode('帮我基于简历库输出表格'), false);
});

test('knowledge output intent should activate when output request and scope are both clear', () => {
  const matched = looksLikeKnowledgeOutputIntent({
    prompt: '请基于人才简历知识库中全部时间范围的简历，按公司维度整理涉及公司的IT项目信息，生成数据可视化静态页报表。',
    libraries: [{ key: 'resume', label: '人才简历知识库' }],
    hasDocumentDetailFollowup: false,
  });

  assert.equal(matched, true);
});

test('knowledge answer intent should stay in answer mode for detail questions', () => {
  const matched = looksLikeKnowledgeAnswerIntent({
    prompt: '刚上传的简历里第一学历和最近公司分别是什么？',
    libraries: [{ key: 'resume', label: '人才简历知识库' }],
    hasDocumentDetailFollowup: false,
  });

  assert.equal(matched, true);
});

test('document followup flag should not be misclassified as knowledge answer', () => {
  const matched = looksLikeKnowledgeAnswerIntent({
    prompt: '详细看看我刚上传的文档里有哪些接口字段？',
    libraries: [],
    hasDocumentDetailFollowup: true,
  });

  assert.equal(matched, false);
});
