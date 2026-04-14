import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpenClawLongTermMemoryDirectAnswer,
  buildOpenClawLongTermMemoryContextBlock,
  filterOpenClawMemoryCatalogSnapshot,
  shouldAnswerFromOpenClawLongTermMemoryDirectory,
  summarizeOpenClawLongTermMemory,
} from '../src/lib/openclaw-memory-directory.js';
import type { OpenClawMemoryCatalogSnapshot } from '../src/lib/openclaw-memory-catalog.js';

const snapshot: OpenClawMemoryCatalogSnapshot = {
  version: 1,
  generatedAt: '2026-04-14T10:00:00.000Z',
  libraryCount: 2,
  documentCount: 3,
  templateCount: 0,
  outputCount: 2,
  libraries: [
    {
      key: 'orders',
      label: '订单分析',
      description: '订单分析资料',
      documentCount: 2,
      availableCount: 2,
      auditExcludedCount: 0,
      structuredOnlyCount: 0,
      unsupportedCount: 0,
      latestUpdateAt: '2026-04-14T09:00:00.000Z',
      representativeDocumentTitles: ['订单日报', '渠道周报'],
      suggestedQuestionTypes: ['order summary'],
      memoryDetailLevel: 'deep',
    },
    {
      key: 'contracts',
      label: '合同资料',
      description: '合同资料',
      documentCount: 1,
      availableCount: 1,
      auditExcludedCount: 0,
      structuredOnlyCount: 0,
      unsupportedCount: 0,
      latestUpdateAt: '2026-04-14T08:00:00.000Z',
      representativeDocumentTitles: ['采购合同'],
      suggestedQuestionTypes: ['contract risk'],
      memoryDetailLevel: 'deep',
    },
  ],
  documents: [
    {
      id: 'doc-1',
      path: 'C:/docs/order-daily.md',
      title: '订单日报',
      name: 'order-daily.md',
      schemaType: 'report',
      libraryKeys: ['orders'],
      summary: '记录最近 7 天订单走势。',
      availability: 'available',
      updatedAt: '2026-04-14T09:00:00.000Z',
      parseStatus: 'parsed',
      parseStage: 'detailed',
      detailParseStatus: 'succeeded',
      topicTags: ['orders'],
      detailLevel: 'deep',
      keyFacts: [],
      evidenceHighlights: [],
      fingerprint: 'fp-1',
    },
    {
      id: 'doc-2',
      path: 'C:/docs/channel-weekly.md',
      title: '渠道周报',
      name: 'channel-weekly.md',
      schemaType: 'report',
      libraryKeys: ['orders'],
      summary: '汇总天猫、京东和抖音渠道表现。',
      availability: 'available',
      updatedAt: '2026-04-14T08:30:00.000Z',
      parseStatus: 'parsed',
      parseStage: 'detailed',
      detailParseStatus: 'succeeded',
      topicTags: ['channel'],
      detailLevel: 'deep',
      keyFacts: [],
      evidenceHighlights: [],
      fingerprint: 'fp-2',
    },
    {
      id: 'doc-3',
      path: 'C:/docs/contract-a.md',
      title: '采购合同',
      name: 'contract-a.md',
      schemaType: 'contract',
      libraryKeys: ['contracts'],
      summary: '记录付款、交付和违约条款。',
      availability: 'available',
      updatedAt: '2026-04-14T08:00:00.000Z',
      parseStatus: 'parsed',
      parseStage: 'detailed',
      detailParseStatus: 'succeeded',
      topicTags: ['contract'],
      detailLevel: 'deep',
      keyFacts: [],
      evidenceHighlights: [],
      fingerprint: 'fp-3',
    },
  ],
  templates: [],
  outputs: [
    {
      id: 'report-1',
      title: '订单经营总览',
      kind: 'page',
      templateLabel: '经营总览',
      summary: '整理了订单规模、渠道表现和行动建议。',
      libraryKeys: ['orders'],
      libraryLabels: ['订单分析'],
      triggerSource: 'chat',
      createdAt: '2026-04-14T09:30:00.000Z',
      updatedAt: '2026-04-14T09:40:00.000Z',
      reusable: true,
    },
    {
      id: 'report-2',
      title: '合同风险摘要',
      kind: 'page',
      templateLabel: '风险简报',
      summary: '整理了交付、违约和付款风险。',
      libraryKeys: ['contracts'],
      libraryLabels: ['合同资料'],
      triggerSource: 'chat',
      createdAt: '2026-04-14T08:30:00.000Z',
      updatedAt: '2026-04-14T08:40:00.000Z',
      reusable: true,
    },
  ],
};

test('filterOpenClawMemoryCatalogSnapshot should scope documents and outputs to selected libraries', () => {
  const scoped = filterOpenClawMemoryCatalogSnapshot({
    snapshot,
    libraries: [{ key: 'orders', label: '订单分析' }],
  });

  assert.equal(scoped.libraries.length, 1);
  assert.equal(scoped.documents.length, 2);
  assert.equal(scoped.outputs.length, 1);
  assert.equal(scoped.outputs[0].title, '订单经营总览');
});

test('buildOpenClawLongTermMemoryContextBlock should include document and output summaries', () => {
  const block = buildOpenClawLongTermMemoryContextBlock({
    snapshot,
    libraries: [{ key: 'orders', label: '订单分析' }],
  });

  assert.match(block, /Platform long-term memory directory:/);
  assert.match(block, /订单分析 \| key=orders \| documents=2/);
  assert.match(block, /订单日报/);
  assert.match(block, /订单经营总览/);
});

test('summarizeOpenClawLongTermMemory should expose library and report counts', () => {
  const summary = summarizeOpenClawLongTermMemory({
    snapshot,
    libraries: [{ key: 'orders', label: '订单分析' }],
  });

  assert.match(summary, /订单分析 2 份文档/);
  assert.match(summary, /已出报表 1 份/);
  assert.match(summary, /订单日报/);
});

test('shouldAnswerFromOpenClawLongTermMemoryDirectory should only match directory questions', () => {
  assert.equal(shouldAnswerFromOpenClawLongTermMemoryDirectory('我就要看数量和文档详情'), true);
  assert.equal(shouldAnswerFromOpenClawLongTermMemoryDirectory('平台系统里有哪些文档，以及这些文档的摘要'), true);
  assert.equal(shouldAnswerFromOpenClawLongTermMemoryDirectory('请给我这份文档的全文'), false);
});

test('buildOpenClawLongTermMemoryDirectAnswer should enumerate documents and outputs from long-term memory', () => {
  const answer = buildOpenClawLongTermMemoryDirectAnswer({
    snapshot,
    requestText: '平台系统里有哪些文档，以及这些文档的摘要，还有已出报表摘要',
    libraries: [{ key: 'orders', label: '订单分析' }],
  });

  assert.match(answer, /当前长期记忆目录覆盖 1 个分组、2 份文档、1 份已出报表/);
  assert.match(answer, /文档清单：/);
  assert.match(answer, /订单日报/);
  assert.match(answer, /已出报表：/);
  assert.match(answer, /订单经营总览/);
});
