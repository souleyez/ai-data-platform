import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemCapabilityContextBlock } from '../src/lib/chat-system-context.js';
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
