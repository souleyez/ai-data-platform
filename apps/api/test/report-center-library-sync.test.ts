import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-report-center-sync-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const reportCenter = await importFresh<typeof import('../src/lib/report-center.js')>(
  '../src/lib/report-center.js',
);
const documentLibraries = await importFresh<typeof import('../src/lib/document-libraries.js')>(
  '../src/lib/document-libraries.js',
);
const documentCacheRepository = await importFresh<typeof import('../src/lib/document-cache-repository.js')>(
  '../src/lib/document-cache-repository.js',
);

test.beforeEach(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
  await fs.mkdir(storageRoot, { recursive: true });
});

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('createReportOutput and updateReportOutput should sync markdown copies into the knowledge library', async () => {
  const state = await reportCenter.loadReportCenterState();
  const group = state.groups[0];
  assert.ok(group);

  const library = await documentLibraries.createDocumentLibrary({
    name: 'bids',
    description: 'Bid knowledge base',
    permissionLevel: 0,
  });

  const record = await reportCenter.createReportOutput({
    groupKey: group.key,
    title: '投标响应草稿',
    triggerSource: 'chat',
    kind: 'md',
    format: 'md',
    content: '## 标书草稿\n\n第一章 项目理解',
    libraries: [{ key: library.key, label: library.label }],
  });

  let cache = await documentCacheRepository.readDocumentCache();
  const firstSynced = cache?.items.find((item) => String(item.path || '').includes(`${path.sep}generated-report-library${path.sep}`));
  assert.ok(firstSynced);
  assert.equal(firstSynced?.confirmedGroups?.includes(library.key), true);
  assert.match(firstSynced?.fullText || '', /第一章 项目理解/);

  await reportCenter.updateReportOutput(record.id, {
    content: '## 标书草稿\n\n第一章 项目理解（修订版）',
  });

  cache = await documentCacheRepository.readDocumentCache();
  const syncedItems = (cache?.items || []).filter((item) => String(item.path || '').includes(`${path.sep}generated-report-library${path.sep}`));
  assert.equal(syncedItems.length, 1);
  assert.match(syncedItems[0]?.fullText || '', /修订版/);
});
