import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { executeKnowledgeAnswer } from '../src/lib/knowledge-execution.js';
import { STORAGE_CONFIG_DIR } from '../src/lib/paths.js';

const MEMORY_SNAPSHOT_FILE = path.join(STORAGE_CONFIG_DIR, 'openclaw-memory-catalog-snapshot.json');

async function withTemporaryMemoryState<T>(
  state: Record<string, unknown>,
  fn: () => Promise<T>,
) {
  let previousContent: string | null = null;
  try {
    previousContent = await fs.readFile(MEMORY_SNAPSHOT_FILE, 'utf8');
  } catch {
    previousContent = null;
  }

  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
  await fs.writeFile(MEMORY_SNAPSHOT_FILE, JSON.stringify(state, null, 2), 'utf8');

  try {
    return await fn();
  } finally {
    if (previousContent === null) {
      await fs.rm(MEMORY_SNAPSHOT_FILE, { force: true });
    } else {
      await fs.writeFile(MEMORY_SNAPSHOT_FILE, previousContent, 'utf8');
    }
  }
}

test('executeKnowledgeAnswer should fall back to a catalog-memory answer when gateway is unavailable', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    await withTemporaryMemoryState({
      version: 1,
      generatedAt: '2026-03-31T11:20:00.000Z',
      libraryCount: 1,
      documentCount: 1,
      templateCount: 0,
      outputCount: 0,
      libraries: [
        {
          key: 'resume',
          label: 'Resume',
          description: 'Resume library',
          documentCount: 1,
          availableCount: 1,
          auditExcludedCount: 0,
          structuredOnlyCount: 0,
          unsupportedCount: 0,
          latestUpdateAt: '2026-03-31T11:00:00.000Z',
          representativeDocumentTitles: ['resume-latest-a'],
          suggestedQuestionTypes: ['candidate comparison'],
          memoryDetailLevel: 'deep',
        },
      ],
      documents: [
        {
          id: 'doc1',
          path: 'C:/docs/resume-latest-a.md',
          name: 'resume-latest-a.md',
          schemaType: 'resume',
          libraryKeys: ['resume'],
          title: 'resume-latest-a',
          summary: 'Senior product manager resume uploaded this morning.',
          availability: 'available',
          updatedAt: '2026-03-31T10:00:00.000Z',
          parseStatus: 'parsed',
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: [],
          detailLevel: 'deep',
          keyFacts: [],
          evidenceHighlights: [],
          fingerprint: 'fp-1',
        },
      ],
      templates: [],
      outputs: [],
    }, async () => {
      const result = await executeKnowledgeAnswer({
        prompt: 'What was uploaded recently in the Resume library?',
        preferredLibraries: [{ key: 'resume', label: 'Resume' }],
        chatHistory: [],
        answerMode: 'catalog_memory',
      });

      assert.equal(result.mode, 'openclaw');
      assert.equal(result.intent, 'general');
      assert.deepEqual(result.libraries, [{ key: 'resume', label: 'Resume' }]);
      assert.match(result.content, /当前长期记忆目录覆盖 1 个分组、1 份文档、0 份已出报表/);
      assert.match(result.content, /resume-latest-a/);
    });
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;

    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});

test('executeKnowledgeAnswer should expose catalog snapshot details in fallback answers', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    await withTemporaryMemoryState({
      version: 1,
      generatedAt: '2026-03-31T11:20:00.000Z',
      libraryCount: 1,
      documentCount: 2,
      templateCount: 0,
      outputCount: 1,
      libraries: [
        {
          key: 'resume',
          label: 'Resume',
          description: 'Resume library',
          documentCount: 2,
          availableCount: 2,
          auditExcludedCount: 0,
          structuredOnlyCount: 0,
          unsupportedCount: 0,
          latestUpdateAt: '2026-03-31T11:00:00.000Z',
          representativeDocumentTitles: ['resume-latest-a', 'resume-latest-b'],
          suggestedQuestionTypes: ['candidate comparison'],
          memoryDetailLevel: 'deep',
        },
      ],
      documents: [
        {
          id: 'doc1',
          path: 'C:/docs/resume-latest-a.md',
          name: 'resume-latest-a.md',
          schemaType: 'resume',
          libraryKeys: ['resume'],
          title: 'resume-latest-a',
          summary: 'Senior product manager resume uploaded this morning.',
          availability: 'available',
          updatedAt: '2026-03-31T10:00:00.000Z',
          parseStatus: 'parsed',
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: [],
          detailLevel: 'deep',
          keyFacts: [],
          evidenceHighlights: [],
          fingerprint: 'fp-1',
        },
        {
          id: 'doc2',
          path: 'C:/docs/resume-latest-b.md',
          name: 'resume-latest-b.md',
          schemaType: 'resume',
          libraryKeys: ['resume'],
          title: 'resume-latest-b',
          summary: 'Operations manager resume uploaded this afternoon.',
          availability: 'available',
          updatedAt: '2026-03-31T11:00:00.000Z',
          parseStatus: 'parsed',
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: [],
          detailLevel: 'deep',
          keyFacts: [],
          evidenceHighlights: [],
          fingerprint: 'fp-2',
        },
      ],
      templates: [],
      outputs: [
        {
          id: 'report-1',
          title: 'Resume summary page',
          kind: 'page',
          templateLabel: '人才展示页',
          summary: 'Summarized the current resume pool.',
          libraryKeys: ['resume'],
          libraryLabels: ['Resume'],
          triggerSource: 'chat',
          createdAt: '2026-03-31T11:10:00.000Z',
          updatedAt: '2026-03-31T11:20:00.000Z',
          reusable: true,
        },
      ],
    }, async () => {
      const result = await executeKnowledgeAnswer({
        prompt: 'What was uploaded recently in the Resume library?',
        preferredLibraries: [{ key: 'resume', label: 'Resume' }],
        chatHistory: [],
        answerMode: 'catalog_memory',
      });

      assert.match(result.content, /当前长期记忆目录覆盖 1 个分组、2 份文档、1 份已出报表/);
      assert.match(result.content, /resume-latest-a/);
      assert.match(result.content, /resume-latest-b/);
      assert.match(result.content, /已出报表/);
    });
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;

    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});

test('executeKnowledgeAnswer should answer platform-wide directory questions without being narrowed by preferred libraries', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    await withTemporaryMemoryState({
      version: 1,
      generatedAt: '2026-03-31T11:20:00.000Z',
      libraryCount: 2,
      documentCount: 3,
      templateCount: 0,
      outputCount: 1,
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
          latestUpdateAt: '2026-03-31T11:00:00.000Z',
          representativeDocumentTitles: ['订单日报', '渠道周报'],
          suggestedQuestionTypes: ['order summary'],
          memoryDetailLevel: 'deep',
        },
        {
          key: 'bids',
          label: 'bids',
          description: '投标资料',
          documentCount: 1,
          availableCount: 1,
          auditExcludedCount: 0,
          structuredOnlyCount: 0,
          unsupportedCount: 0,
          latestUpdateAt: '2026-03-31T10:30:00.000Z',
          representativeDocumentTitles: ['方案说明'],
          suggestedQuestionTypes: ['proposal summary'],
          memoryDetailLevel: 'deep',
        },
      ],
      documents: [
        {
          id: 'doc-1',
          path: 'C:/docs/order-daily.md',
          name: 'order-daily.md',
          schemaType: 'report',
          libraryKeys: ['orders'],
          title: '订单日报',
          summary: '最近 7 天订单走势。',
          availability: 'available',
          updatedAt: '2026-03-31T11:00:00.000Z',
          parseStatus: 'parsed',
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: [],
          detailLevel: 'deep',
          keyFacts: [],
          evidenceHighlights: [],
          fingerprint: 'fp-1',
        },
        {
          id: 'doc-2',
          path: 'C:/docs/channel-weekly.md',
          name: 'channel-weekly.md',
          schemaType: 'report',
          libraryKeys: ['orders'],
          title: '渠道周报',
          summary: '天猫、京东渠道表现。',
          availability: 'available',
          updatedAt: '2026-03-31T10:50:00.000Z',
          parseStatus: 'parsed',
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: [],
          detailLevel: 'deep',
          keyFacts: [],
          evidenceHighlights: [],
          fingerprint: 'fp-2',
        },
        {
          id: 'doc-3',
          path: 'C:/docs/bid-overview.md',
          name: 'bid-overview.md',
          schemaType: 'proposal',
          libraryKeys: ['bids'],
          title: '方案说明',
          summary: '投标方案摘要。',
          availability: 'available',
          updatedAt: '2026-03-31T10:30:00.000Z',
          parseStatus: 'parsed',
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: [],
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
          summary: '整理了订单规模和渠道表现。',
          libraryKeys: ['orders'],
          libraryLabels: ['订单分析'],
          triggerSource: 'chat',
          createdAt: '2026-03-31T11:05:00.000Z',
          updatedAt: '2026-03-31T11:10:00.000Z',
          reusable: true,
        },
      ],
    }, async () => {
      const result = await executeKnowledgeAnswer({
        prompt: '按库分组下，先告诉我有哪些集合',
        preferredLibraries: [{ key: 'orders', label: '订单分析' }],
        chatHistory: [],
        answerMode: 'catalog_memory',
      });

      assert.match(result.content, /当前长期记忆目录覆盖 2 个分组、3 份文档、1 份已出报表/);
      assert.match(result.content, /订单日报/);
      assert.match(result.content, /方案说明/);
    });
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;

    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});
