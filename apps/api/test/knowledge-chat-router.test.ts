import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildKnowledgeRouterPrompt,
  extractKnowledgeIntentContract,
  finalizeKnowledgeRoute,
  resolveKnowledgeChatRoute,
} from '../src/lib/knowledge-chat-router.js';
import type { DocumentLibrary } from '../src/lib/document-libraries.js';

const LIBRARIES: DocumentLibrary[] = [
  {
    key: 'resume',
    label: '简历',
    description: '人才简历库',
    createdAt: '2026-03-30T00:00:00.000Z',
  },
  {
    key: 'bids',
    label: 'bids',
    description: '标书库',
    createdAt: '2026-03-30T00:00:00.000Z',
  },
];

test('extractKnowledgeIntentContract should parse strict router json', () => {
  const contract = extractKnowledgeIntentContract(
    '{"route":"detail","subject":"简历","requestedForm":"answer","targetScope":"comparison","needsLiveDetail":true,"normalizedRequest":"对比简历库最新几份简历","rationale":"Need live detail for comparison.","confidence":0.88}',
    '对比简历库最新几份简历',
  );

  assert.ok(contract);
  assert.equal(contract?.route, 'detail');
  assert.equal(contract?.targetScope, 'comparison');
  assert.equal(contract?.needsLiveDetail, true);
  assert.equal(contract?.confidence, 0.88);
});

test('buildKnowledgeRouterPrompt should preserve libraries and trigger signals', () => {
  const prompt = buildKnowledgeRouterPrompt({
    prompt: '看看简历库最近几份简历，先简单说下，不用出表',
    chatHistory: [{ role: 'user', content: '我想先筛一批候选人' }],
    libraries: [{ key: 'resume', label: '简历' }],
    signals: {
      explicitKnowledgeScope: true,
      explicitCatalogRequest: false,
      explicitDetailRequest: false,
      explicitOutputRequest: true,
      outputSuppressed: true,
      comparisonRequest: true,
      mentionsSpecificDocument: false,
      mentionsRecentUploads: false,
    },
  });

  assert.match(prompt, /Matched libraries: 简历/);
  assert.match(prompt, /"outputSuppressed":true/);
  assert.match(prompt, /Current user request:/);
});

test('finalizeKnowledgeRoute should keep negative output constraints from being overridden', () => {
  const route = finalizeKnowledgeRoute(
    {
      route: 'output',
      subject: '简历',
      requestedForm: 'table',
      targetScope: 'comparison',
      needsLiveDetail: true,
      normalizedRequest: '看看简历库最近几份简历，先简单说下，不用出表',
      rationale: 'cloud preferred output',
      confidence: 0.77,
    },
    {
      explicitKnowledgeScope: true,
      explicitCatalogRequest: false,
      explicitDetailRequest: false,
      explicitOutputRequest: true,
      outputSuppressed: true,
      comparisonRequest: true,
      mentionsSpecificDocument: false,
      mentionsRecentUploads: false,
    },
  );

  assert.equal(route, 'detail');
});

test('resolveKnowledgeChatRoute should route inventory questions to catalog when only asking what exists', async () => {
  const decision = await resolveKnowledgeChatRoute({
    prompt: '简历库最近上传了什么，有哪些最新文档？',
    chatHistory: [],
    libraries: LIBRARIES,
  }, {
    resolveCloudContract: async () => ({
      route: 'catalog',
      subject: '简历',
      requestedForm: 'answer',
      targetScope: 'latest_documents',
      needsLiveDetail: false,
      normalizedRequest: '简历库最近上传了什么，有哪些最新文档？',
      rationale: 'catalog inventory request',
      confidence: 0.91,
    }),
  });

  assert.equal(decision.route, 'catalog');
  assert.equal(decision.evidenceMode, 'catalog_memory');
  assert.equal(decision.contract.targetScope, 'latest_documents');
  assert.equal(decision.libraries[0]?.key, 'resume');
});

test('resolveKnowledgeChatRoute should route latest resume comparison to detail', async () => {
  const decision = await resolveKnowledgeChatRoute({
    prompt: '看看简历知识库内的简历，最新的几份对比下',
    chatHistory: [],
    libraries: LIBRARIES,
  }, {
    resolveCloudContract: async () => ({
      route: 'detail',
      subject: '简历',
      requestedForm: 'answer',
      targetScope: 'comparison',
      needsLiveDetail: true,
      normalizedRequest: '对比简历库最新几份简历',
      rationale: 'document comparison request',
      confidence: 0.86,
    }),
  });

  assert.equal(decision.route, 'detail');
  assert.equal(decision.evidenceMode, 'live_detail');
  assert.equal(decision.contract.normalizedRequest, '对比简历库最新几份简历');
});

test('resolveKnowledgeChatRoute should route formal page requests to output', async () => {
  const decision = await resolveKnowledgeChatRoute({
    prompt: '请基于简历库生成客户汇报静态页',
    chatHistory: [],
    libraries: LIBRARIES,
  }, {
    resolveCloudContract: async () => ({
      route: 'output',
      subject: '简历',
      requestedForm: 'page',
      targetScope: 'comparison',
      needsLiveDetail: true,
      normalizedRequest: '请基于简历库生成客户汇报静态页',
      rationale: 'formal deliverable request',
      confidence: 0.93,
    }),
  });

  assert.equal(decision.route, 'output');
  assert.equal(decision.evidenceMode, 'live_detail');
  assert.equal(decision.contract.requestedForm, 'page');
});

test('resolveKnowledgeChatRoute should keep casual chat on the general route', async () => {
  const decision = await resolveKnowledgeChatRoute({
    prompt: '今天帮我想个产品名字',
    chatHistory: [],
    libraries: LIBRARIES,
  });

  assert.equal(decision.route, 'general');
  assert.equal(decision.evidenceMode, null);
});
