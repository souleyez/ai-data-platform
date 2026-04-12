import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-document-maint-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh(specifier) {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`);
}

const maintenanceOperations = await importFresh('../src/lib/document-route-maintenance-operations.ts');
const documentDeepParseQueue = await importFresh('../src/lib/document-deep-parse-queue.ts');
const documentStore = await importFresh('../src/lib/document-store.ts');

async function removeDirWithRetry(targetPath, attempts = 8) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (
        index === attempts - 1
        || !(error && typeof error === 'object' && 'code' in error)
        || !['ENOTEMPTY', 'EPERM', 'EBUSY'].includes(String(error.code || ''))
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * (index + 1)));
    }
  }
}

test.after(async () => {
  await removeDirWithRetry(storageRoot);
});

test('single-document canonical backfill should queue one legacy document by id', async () => {
  const scanRoot = path.join(storageRoot, 'files');
  const configFile = path.join(storageRoot, 'config', 'document-categories.json');
  const librariesFile = path.join(storageRoot, 'config', 'document-libraries.json');
  const cacheFile = path.join(storageRoot, 'cache', 'documents-cache.json');
  const queueFile = path.join(storageRoot, 'cache', 'document-deep-parse-queue.json');
  const sourcePath = path.join(scanRoot, 'legacy.html');
  const generatedAt = new Date('2026-04-12T00:00:00.000Z').toISOString();

  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.mkdir(scanRoot, { recursive: true });
  await fs.writeFile(sourcePath, '<html><body><h1>legacy</h1></body></html>', 'utf8');
  await fs.writeFile(configFile, JSON.stringify({
    scanRoot,
    scanRoots: [scanRoot],
    categories: [],
    customCategories: [],
    upload: {
      enabled: true,
      maxBytes: 10 * 1024 * 1024,
      allowedExtensions: ['.html'],
    },
  }, null, 2), 'utf8');
  await fs.writeFile(librariesFile, JSON.stringify({
    libraries: [
      { key: 'ungrouped', label: '未分组', description: 'ungrouped', permissionLevel: 0 },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(cacheFile, JSON.stringify({
    generatedAt,
    scanRoot,
    scanRoots: [scanRoot],
    totalFiles: 1,
    scanSignature: 'sig-single-backfill',
    indexedPaths: [sourcePath],
    items: [
      {
        path: sourcePath,
        name: 'legacy.html',
        ext: '.html',
        title: 'Legacy html',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        fullText: 'Legacy body only',
        summary: 'legacy',
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(queueFile, JSON.stringify({
    updatedAt: generatedAt,
    items: [],
  }, null, 2), 'utf8');

  const id = documentStore.buildDocumentId(sourcePath);
  const result = await maintenanceOperations.runDocumentCanonicalBackfillByIdAction(id, false);

  assert.equal(result.matchedCount, 1);
  assert.equal(result.queuedCount, 1);
  assert.equal(result.candidate?.path, sourcePath);

  const queueState = await documentDeepParseQueue.readDetailedParseQueueState();
  assert.deepEqual(queueState.items.map((item) => item.path), [sourcePath]);
});
