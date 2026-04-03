import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { executeKnowledgeAnswer } from '../src/lib/knowledge-execution.js';
import { STORAGE_CONFIG_DIR } from '../src/lib/paths.js';

const MEMORY_STATE_FILE = path.join(STORAGE_CONFIG_DIR, 'openclaw-memory-catalog.json');

async function withTemporaryMemoryState<T>(
  state: Record<string, unknown>,
  fn: () => Promise<T>,
) {
  let previousContent: string | null = null;
  try {
    previousContent = await fs.readFile(MEMORY_STATE_FILE, 'utf8');
  } catch {
    previousContent = null;
  }

  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
  await fs.writeFile(MEMORY_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

  try {
    return await fn();
  } finally {
    if (previousContent === null) {
      await fs.rm(MEMORY_STATE_FILE, { force: true });
    } else {
      await fs.writeFile(MEMORY_STATE_FILE, previousContent, 'utf8');
    }
  }
}

test('executeKnowledgeAnswer should fall back to a catalog-memory answer when gateway is unavailable', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const result = await executeKnowledgeAnswer({
      prompt: 'What was uploaded recently in the Resume library?',
      preferredLibraries: [{ key: 'resume', label: 'Resume' }],
      chatHistory: [],
      answerMode: 'catalog_memory',
    });

    assert.equal(result.mode, 'openclaw');
    assert.equal(result.intent, 'general');
    assert.deepEqual(result.libraries, [{ key: 'resume', label: 'Resume' }]);
    assert.match(result.content, /Resume/);
    assert.match(result.content, /文档详情/);
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
      documents: {
        doc1: {
          id: 'doc1',
          libraryKeys: ['resume'],
          title: 'resume-latest-a',
          summary: 'Senior product manager resume uploaded this morning.',
          availability: 'available',
          updatedAt: '2026-03-31T10:00:00.000Z',
          parseStatus: 'parsed',
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          fingerprint: 'fp-1',
        },
        doc2: {
          id: 'doc2',
          libraryKeys: ['resume'],
          title: 'resume-latest-b',
          summary: 'Operations manager resume uploaded this afternoon.',
          availability: 'structured-only',
          updatedAt: '2026-03-31T11:00:00.000Z',
          parseStatus: 'parsed',
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          fingerprint: 'fp-2',
        },
      },
      recentChanges: [
        {
          id: 'added:doc2:2026-03-31T11:00:00.000Z',
          type: 'added',
          documentId: 'doc2',
          title: 'resume-latest-b',
          libraryKeys: ['resume'],
          happenedAt: '2026-03-31T11:00:00.000Z',
          note: 'Document is available in the current catalog.',
        },
      ],
    }, async () => {
      const result = await executeKnowledgeAnswer({
        prompt: 'What was uploaded recently in the Resume library?',
        preferredLibraries: [{ key: 'resume', label: 'Resume' }],
        chatHistory: [],
        answerMode: 'catalog_memory',
      });

      assert.match(result.content, /Resume 当前有 2 份文档/);
      assert.match(result.content, /resume-latest-a/);
      assert.match(result.content, /resume-latest-b/);
      assert.match(result.content, /最近的目录变化包括/);
    });
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;

    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});
