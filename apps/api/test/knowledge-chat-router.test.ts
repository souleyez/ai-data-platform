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
    label: 'Resume',
    description: 'Candidate resumes',
    createdAt: '2026-03-30T00:00:00.000Z',
  },
  {
    key: 'bids',
    label: 'Bids',
    description: 'Tender and bid documents',
    createdAt: '2026-03-30T00:00:00.000Z',
  },
  {
    key: 'order',
    label: 'Order Analytics',
    description: 'Order and inventory knowledge library',
    createdAt: '2026-03-30T00:00:00.000Z',
  },
];

test('extractKnowledgeIntentContract should parse strict router json', () => {
  const contract = extractKnowledgeIntentContract(
    '{"route":"detail","subject":"Resume","requestedForm":"answer","targetScope":"comparison","needsLiveDetail":true,"normalizedRequest":"Compare the latest resumes.","rationale":"Need live detail for comparison.","confidence":0.88}',
    'Compare the latest resumes.',
  );

  assert.ok(contract);
  assert.equal(contract?.route, 'detail');
  assert.equal(contract?.targetScope, 'comparison');
  assert.equal(contract?.needsLiveDetail, true);
  assert.equal(contract?.confidence, 0.88);
});

test('buildKnowledgeRouterPrompt should preserve libraries and trigger signals', () => {
  const prompt = buildKnowledgeRouterPrompt({
    prompt: 'Review the latest resume files first, but do not generate a table yet.',
    chatHistory: [{ role: 'user', content: 'I want to shortlist a few candidates.' }],
    libraries: [{ key: 'resume', label: 'Resume' }],
    signals: {
      explicitKnowledgeScope: true,
      explicitCatalogRequest: false,
      explicitDetailRequest: false,
      explicitOutputRequest: false,
      explicitOutputArtifact: false,
      outputSuppressed: true,
      comparisonRequest: true,
      mentionsSpecificDocument: false,
      mentionsRecentUploads: false,
      summaryRequest: true,
    },
  });

  assert.match(prompt, /Matched libraries: Resume/);
  assert.match(prompt, /"outputSuppressed":true/);
  assert.match(prompt, /Current user request:/);
});

test('finalizeKnowledgeRoute should keep negative output constraints from being overridden', () => {
  const route = finalizeKnowledgeRoute(
    {
      route: 'output',
      subject: 'Resume',
      requestedForm: 'table',
      targetScope: 'comparison',
      needsLiveDetail: true,
      normalizedRequest: 'Review the latest resume files first, but do not generate a table yet.',
      rationale: 'cloud preferred output',
      confidence: 0.77,
    },
    {
      explicitKnowledgeScope: true,
      explicitCatalogRequest: false,
      explicitDetailRequest: false,
      explicitOutputRequest: false,
      explicitOutputArtifact: false,
      outputSuppressed: true,
      comparisonRequest: true,
      mentionsSpecificDocument: false,
      mentionsRecentUploads: false,
      summaryRequest: true,
    },
  );

  assert.equal(route, 'detail');
});

test('resolveKnowledgeChatRoute should route recent library inventory questions to catalog', async () => {
  const decision = await resolveKnowledgeChatRoute({
    prompt: 'What was uploaded recently in the resume library?',
    chatHistory: [],
    libraries: LIBRARIES,
  }, {
    resolveCloudContract: async () => ({
      route: 'catalog',
      subject: 'Resume',
      requestedForm: 'answer',
      targetScope: 'latest_documents',
      needsLiveDetail: false,
      normalizedRequest: 'What was uploaded recently in the resume library?',
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
    prompt: 'Compare the latest resumes in the resume library.',
    chatHistory: [],
    libraries: LIBRARIES,
  }, {
    resolveCloudContract: async () => ({
      route: 'detail',
      subject: 'Resume',
      requestedForm: 'answer',
      targetScope: 'comparison',
      needsLiveDetail: true,
      normalizedRequest: 'Compare the latest resumes in the resume library.',
      rationale: 'document comparison request',
      confidence: 0.86,
    }),
  });

  assert.equal(decision.route, 'detail');
  assert.equal(decision.evidenceMode, 'live_detail');
  assert.equal(decision.contract.normalizedRequest, 'Compare the latest resumes in the resume library.');
});

test('resolveKnowledgeChatRoute should route formal page requests to output', async () => {
  const decision = await resolveKnowledgeChatRoute({
    prompt: 'Generate a client-facing static page from the resume library.',
    chatHistory: [],
    libraries: LIBRARIES,
  }, {
    resolveCloudContract: async () => ({
      route: 'output',
      subject: 'Resume',
      requestedForm: 'page',
      targetScope: 'comparison',
      needsLiveDetail: true,
      normalizedRequest: 'Generate a client-facing static page from the resume library.',
      rationale: 'formal deliverable request',
      confidence: 0.93,
    }),
  });

  assert.equal(decision.route, 'output');
  assert.equal(decision.evidenceMode, 'live_detail');
  assert.equal(decision.contract.requestedForm, 'page');
});

test('resolveKnowledgeChatRoute should keep order summary prompts on detail when there is no deliverable noun', async () => {
  const decision = await resolveKnowledgeChatRoute({
    prompt: 'Summarize Q1 channel sales, top categories, and inventory risks from the order library.',
    chatHistory: [],
    libraries: LIBRARIES,
  }, {
    resolveCloudContract: async () => ({
      route: 'output',
      subject: 'Order Analytics',
      requestedForm: 'answer',
      targetScope: 'specific_document',
      needsLiveDetail: true,
      normalizedRequest: 'Summarize Q1 channel sales, top categories, and inventory risks from the order library.',
      rationale: 'cloud over-classified this as a deliverable',
      confidence: 0.85,
    }),
  });

  assert.equal(decision.route, 'detail');
  assert.equal(decision.evidenceMode, 'live_detail');
  assert.equal(decision.contract.requestedForm, 'answer');
});

test('resolveKnowledgeChatRoute should not allow cloud output routing without an explicit deliverable artifact', async () => {
  const decision = await resolveKnowledgeChatRoute({
    prompt: 'Organize the latest candidates in the resume library.',
    chatHistory: [],
    libraries: LIBRARIES,
  }, {
    resolveCloudContract: async () => ({
      route: 'output',
      subject: 'Resume',
      requestedForm: 'page',
      targetScope: 'comparison',
      needsLiveDetail: true,
      normalizedRequest: 'Organize the latest candidates in the resume library.',
      rationale: 'cloud over-classified this as a deliverable',
      confidence: 0.83,
    }),
  });

  assert.equal(decision.route, 'detail');
  assert.equal(decision.evidenceMode, 'live_detail');
  assert.equal(decision.contract.requestedForm, 'answer');
});

test('resolveKnowledgeChatRoute should keep casual chat on the general route', async () => {
  const decision = await resolveKnowledgeChatRoute({
    prompt: 'Help me think of a product name today.',
    chatHistory: [],
    libraries: LIBRARIES,
  });

  assert.equal(decision.route, 'general');
  assert.equal(decision.evidenceMode, null);
});

test('resolveKnowledgeChatRoute should keep broad local document discovery on catalog without locking to a prior library', async () => {
  const decision = await resolveKnowledgeChatRoute({
    prompt: '\u80fd\u4e0d\u80fd\u627e\u627e\u4f60\u672c\u5730\u6240\u6709\u7684\u4e2d\u6587\u6587\u6863',
    chatHistory: [
      { role: 'user', content: '\u770b\u770b\u7b80\u5386\u77e5\u8bc6\u5e93\u5185\u7684\u7b80\u5386\uff0c\u6700\u65b0\u7684\u51e0\u4efd\u5bf9\u6bd4\u4e0b' },
      { role: 'assistant', content: '...' },
    ],
    libraries: LIBRARIES,
  });

  assert.equal(decision.route, 'catalog');
  assert.equal(decision.evidenceMode, 'catalog_memory');
  assert.deepEqual(decision.libraries, []);
});

test('resolveKnowledgeChatRoute should clear library stickiness when the user says not only resume documents', async () => {
  const decision = await resolveKnowledgeChatRoute({
    prompt: '\u662f\u627e\u4e2d\u6587\u6587\u6863\u5440\uff0c\u4e0d\u6b62\u662f\u7b80\u5386',
    chatHistory: [
      { role: 'user', content: '\u770b\u770b\u7b80\u5386\u77e5\u8bc6\u5e93\u5185\u7684\u7b80\u5386\uff0c\u6700\u65b0\u7684\u51e0\u4efd\u5bf9\u6bd4\u4e0b' },
      { role: 'assistant', content: '...' },
    ],
    libraries: LIBRARIES,
  });

  assert.equal(decision.route, 'catalog');
  assert.equal(decision.evidenceMode, 'catalog_memory');
  assert.deepEqual(decision.libraries, []);
});
