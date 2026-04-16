import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBotIdentityContextBlock, buildSystemCapabilityContextBlock } from '../src/lib/chat-system-context.js';
import { shouldRequireTemplateConfirmation } from '../src/lib/chat-template-confirmation.js';

function buildSupply(overrides = {}) {
  return {
    knowledgeChatHistory: [],
    libraries: [{ key: 'contracts', label: '合同协议' }],
    effectiveRetrieval: {
      documents: [
        {
          id: 'doc-1',
          path: 'C:/docs/contract-1.pdf',
          name: 'contract-1.pdf',
          title: '合同 1',
          ext: '.pdf',
          summary: '合同摘要',
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
        },
      ],
      evidenceMatches: [],
      meta: {
        stages: ['rule'],
        vectorEnabled: false,
        candidateCount: 1,
        rerankedCount: 1,
        intent: 'contract',
        templateTask: 'contract-risk',
      },
    },
    ...overrides,
  };
}

test('template confirmation should only trigger for library-backed output requests', () => {
  const hit = shouldRequireTemplateConfirmation({
    prompt: '请基于合同库输出一个合同风险 PPT',
    supply: buildSupply(),
  });
  assert.equal(hit, 'ppt');

  const noOutput = shouldRequireTemplateConfirmation({
    prompt: '总结一下合同库重点',
    supply: buildSupply(),
  });
  assert.equal(noOutput, null);

  const noLibraries = shouldRequireTemplateConfirmation({
    prompt: '请基于合同库输出一个合同风险 PPT',
    supply: buildSupply({ libraries: [] }),
  });
  assert.equal(noLibraries, null);

  const noExplicitDatasetScope = shouldRequireTemplateConfirmation({
    prompt: '请输出一个合同风险 PPT',
    supply: buildSupply(),
  });
  assert.equal(noExplicitDatasetScope, null);
});

test('template confirmation should also recognize doc and markdown output requests', () => {
  const markdownHit = shouldRequireTemplateConfirmation({
    prompt: '请基于合同协议库最近一个月资料输出一份 Markdown 文档',
    supply: buildSupply(),
  });
  assert.equal(markdownHit, 'md');

  const documentHit = shouldRequireTemplateConfirmation({
    prompt: '请基于合同协议库最近一个月资料输出一份 docs 文档',
    supply: buildSupply(),
  });
  assert.equal(documentHit, 'doc');

  const datasetHit = shouldRequireTemplateConfirmation({
    prompt: '请基于合同数据集最近一个月资料输出一份 Markdown 文档',
    supply: buildSupply(),
  });
  assert.equal(datasetHit, 'md');
});

test('system capability context should always mention default web search', () => {
  const text = buildSystemCapabilityContextBlock({
    mode: 'service',
    capabilities: {
      canReadLocalFiles: true,
      canImportLocalFiles: true,
      canModifyLocalSystemFiles: false,
    },
  });

  assert.match(text, /Web search/i);
  assert.match(text, /service/i);
  assert.match(text, /do not emit raw tool-call markup/i);
  assert.doesNotMatch(text, /Command:\s+pnpm system:control/i);
});

test('system capability context should keep full mode permissive while still hiding raw tool markup', () => {
  const text = buildSystemCapabilityContextBlock({
    mode: 'full',
    capabilities: {
      canReadLocalFiles: true,
      canImportLocalFiles: true,
      canModifyLocalSystemFiles: true,
    },
  });

  assert.match(text, /full/i);
  assert.match(text, /keep host-side restrictions light/i);
  assert.match(text, /avoid leaking raw tool-call markup/i);
  assert.doesNotMatch(text, /answer directly from the available context instead of planning commands/i);
});

test('bot identity context should include bot intelligence mode while keeping library boundaries', () => {
  const text = buildBotIdentityContextBlock({
    channel: 'web',
    bot: {
      id: 'contract-bot',
      name: '合同助手',
      slug: 'contract-bot',
      description: '',
      enabled: true,
      isDefault: false,
      intelligenceMode: 'full',
      systemPrompt: '只处理合同问题',
      libraryAccessLevel: 1,
      visibleLibraryKeys: ['contract'],
      includeUngrouped: false,
      includeFailedParseDocuments: false,
      channelBindings: [{ channel: 'web', enabled: true }],
      updatedAt: '2026-04-11T00:00:00.000Z',
    },
  });

  assert.match(text, /Bot intelligence mode: full/);
  assert.match(text, /Library access level: 1/);
  assert.match(text, /must not imply access to knowledge outside the visible libraries/i);
});
