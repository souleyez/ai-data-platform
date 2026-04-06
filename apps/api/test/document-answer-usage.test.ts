import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

test('recordDocumentAnswerUsage should deduplicate references per answer and accumulate counts', async () => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-answer-usage-'));
  process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

  try {
    const usageModule = await importFresh<typeof import('../src/lib/document-answer-usage.js')>(
      '../src/lib/document-answer-usage.js',
    );

    const first = await usageModule.recordDocumentAnswerUsage({
      traceId: 'trace-1',
      botId: 'default',
      sessionUser: 'web:user-1',
      references: [
        { id: 'doc-a', path: 'C:\\docs\\a.md', name: 'Doc A' },
        { id: 'doc-a', path: 'C:\\docs\\a.md', name: 'Doc A' },
        { id: 'doc-b', path: 'C:\\docs\\b.md', name: 'Doc B' },
      ],
    });
    assert.equal(first.recorded, 2);

    await usageModule.recordDocumentAnswerUsage({
      traceId: 'trace-2',
      botId: 'default',
      sessionUser: 'web:user-1',
      references: [
        { id: 'doc-a', path: 'C:\\docs\\a.md', name: 'Doc A' },
      ],
    });

    const state = await usageModule.loadDocumentAnswerUsageState();
    const byId = new Map(state.items.map((item) => [item.documentId, item]));
    assert.equal(byId.get('doc-a')?.count, 2);
    assert.equal(byId.get('doc-b')?.count, 1);
    assert.equal(state.events.length, 2);
  } finally {
    await fs.rm(storageRoot, { recursive: true, force: true });
  }
});
