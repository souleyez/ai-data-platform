import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeneralKnowledgeConversationState,
  buildKnowledgeRequest,
  buildMissingKnowledgeSlotMessage,
  extractExplicitKnowledgeFocus,
  extractNormalizedContentFocus,
  extractNormalizedTimeRange,
  mergeKnowledgeConversationState,
  parseGeneralKnowledgeConversationState,
  parseKnowledgeConversationState,
  type KnowledgeConversationState,
} from '../src/lib/knowledge-request-state.js';

test('parseKnowledgeConversationState should accept valid persisted slot state', () => {
  const state = parseKnowledgeConversationState({
    kind: 'knowledge_output',
    libraries: [{ key: 'resume', label: '人才简历知识库' }],
    timeRange: '全部时间',
    contentFocus: '公司维度 IT 项目信息',
    outputType: 'table',
    missingSlot: 'output',
  });

  assert.equal(state?.libraries[0]?.label, '人才简历知识库');
  assert.equal(state?.timeRange, '全部时间');
});

test('mergeKnowledgeConversationState should fill all slots for explicit requests', () => {
  const merged = mergeKnowledgeConversationState(
    '基于全部时间的人才简历库，按公司维度整理 IT 项目信息，输出表格',
    null,
    [{ key: 'resume', label: '人才简历知识库' }],
  );

  assert.equal(merged.complete, true);
  assert.equal(merged.state.timeRange, '全部时间');
  assert.equal(merged.state.outputType, 'table');
  assert.match(merged.state.contentFocus, /公司维度|IT 项目/);
});

test('parseGeneralKnowledgeConversationState should accept a persisted preferred document path', () => {
  const state = parseGeneralKnowledgeConversationState({
    kind: 'general',
    preferredDocumentPath: 'C:/storage/files/uploads/1775000000000-bid.pdf',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  assert.equal(state?.kind, 'general');
  assert.equal(state?.preferredDocumentPath, 'C:/storage/files/uploads/1775000000000-bid.pdf');
  assert.ok(state?.expiresAt);
});

test('buildGeneralKnowledgeConversationState should normalize and reject empty paths', () => {
  assert.equal(buildGeneralKnowledgeConversationState('   '), null);

  const state = buildGeneralKnowledgeConversationState(' C:/docs/bid.pdf ');
  assert.equal(state?.preferredDocumentPath, 'C:/docs/bid.pdf');
  assert.ok(Date.parse(String(state?.expiresAt || '')) > Date.now());
});

test('parseGeneralKnowledgeConversationState should reject expired preferred document state', () => {
  const state = parseGeneralKnowledgeConversationState({
    kind: 'general',
    preferredDocumentPath: 'C:/storage/files/uploads/1775000000000-bid.pdf',
    expiresAt: '2020-01-01T00:00:00.000Z',
  });

  assert.equal(state, null);
});

test('extractNormalizedTimeRange should normalize all-time and recent-upload phrases', () => {
  assert.equal(extractNormalizedTimeRange('基于全部时间的人才简历库'), '全部时间');
  assert.equal(extractNormalizedTimeRange('看看最近上传的文档'), '最近上传');
});

test('extractNormalizedContentFocus should strip control words and keep core topic', () => {
  const focus = extractNormalizedContentFocus('请基于人才简历库整理公司维度 IT 项目信息并输出表格');
  assert.match(focus, /公司维度/);
  assert.match(focus, /IT 项目/);
  assert.doesNotMatch(focus, /输出|表格/);
});

test('extractExplicitKnowledgeFocus should infer company-based IT project focus', () => {
  assert.equal(
    extractExplicitKnowledgeFocus('整理简历中涉及公司的 IT 项目信息'),
    '公司维度 IT 项目信息',
  );
});

test('buildMissingKnowledgeSlotMessage should guide only the missing slot', () => {
  const timeState: KnowledgeConversationState = {
    kind: 'knowledge_output',
    libraries: [{ key: 'resume', label: '人才简历知识库' }],
    timeRange: '',
    contentFocus: '公司维度 IT 项目信息',
    outputType: 'table',
    missingSlot: 'time',
  };

  assert.match(buildMissingKnowledgeSlotMessage(timeState), /时间范围/);
});

test('buildKnowledgeRequest should produce a compact supply request', () => {
  const state: KnowledgeConversationState = {
    kind: 'knowledge_output',
    libraries: [{ key: 'resume', label: '人才简历知识库' }],
    timeRange: '全部时间',
    contentFocus: '公司维度 IT 项目信息',
    outputType: 'table',
    missingSlot: 'output',
  };

  const request = buildKnowledgeRequest(state);
  assert.match(request, /人才简历知识库/);
  assert.match(request, /全部时间/);
  assert.match(request, /公司维度 IT 项目信息/);
  assert.match(request, /表格/);
});
