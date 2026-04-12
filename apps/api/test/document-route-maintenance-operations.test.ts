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

test('canonical backfill should skip documents already satisfied by VLM fallback', async () => {
  const scanRoot = path.join(storageRoot, 'files-vlm');
  const configFile = path.join(storageRoot, 'config', 'document-categories.json');
  const librariesFile = path.join(storageRoot, 'config', 'document-libraries.json');
  const cacheFile = path.join(storageRoot, 'cache', 'documents-cache.json');
  const queueFile = path.join(storageRoot, 'cache', 'document-deep-parse-queue.json');
  const sourcePath = path.join(scanRoot, 'bid-spec.pdf');
  const generatedAt = new Date('2026-04-12T01:00:00.000Z').toISOString();

  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.mkdir(scanRoot, { recursive: true });
  await fs.writeFile(sourcePath, Buffer.from('fake-pdf'));
  await fs.writeFile(configFile, JSON.stringify({
    scanRoot,
    scanRoots: [scanRoot],
    categories: [],
    customCategories: [],
    upload: {
      enabled: true,
      maxBytes: 10 * 1024 * 1024,
      allowedExtensions: ['.pdf'],
    },
  }, null, 2), 'utf8');
  await fs.writeFile(librariesFile, JSON.stringify({
    libraries: [
      { key: 'bids', label: '投标', description: 'bids', permissionLevel: 0 },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(cacheFile, JSON.stringify({
    generatedAt,
    scanRoot,
    scanRoots: [scanRoot],
    totalFiles: 1,
    scanSignature: 'sig-vlm-ready',
    indexedPaths: [sourcePath],
    items: [
      {
        path: sourcePath,
        name: 'bid-spec.pdf',
        ext: '.pdf',
        title: 'Bid spec',
        category: 'contract',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseMethod: 'pdf-ocr+pdf-vlm',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        fullText: '[PDF VLM understanding]\n\n控制价 437.69 万元',
        summary: '招标文件',
        canonicalParseStatus: 'ready',
        groups: ['bids'],
        confirmedGroups: ['bids'],
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(queueFile, JSON.stringify({
    updatedAt: generatedAt,
    items: [],
  }, null, 2), 'utf8');

  const id = documentStore.buildDocumentId(sourcePath);
  const result = await maintenanceOperations.runDocumentCanonicalBackfillByIdAction(id, false);

  assert.equal(result.matchedCount, 0);
  assert.equal(result.queuedCount, 0);
  assert.equal(result.candidate?.canonicalSource, 'vlm-pdf');
  assert.equal(result.candidate?.canonicalParseStatus, 'ready');

  const queueState = await documentDeepParseQueue.readDetailedParseQueueState();
  assert.equal(queueState.items.length, 0);
});

test('manual document reparse should clear stale failed queue entries for reparsed files', async () => {
  const scanRoot = path.join(storageRoot, 'files-reparse');
  const configFile = path.join(storageRoot, 'config', 'document-categories.json');
  const librariesFile = path.join(storageRoot, 'config', 'document-libraries.json');
  const cacheFile = path.join(storageRoot, 'cache', 'documents-cache.json');
  const queueFile = path.join(storageRoot, 'cache', 'document-deep-parse-queue.json');
  const sourcePath = path.join(scanRoot, 'reparse-me.md');
  const generatedAt = new Date('2026-04-12T02:00:00.000Z').toISOString();

  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.mkdir(scanRoot, { recursive: true });
  await fs.writeFile(sourcePath, '# Reparse Me\n\nContent body', 'utf8');
  await fs.writeFile(configFile, JSON.stringify({
    scanRoot,
    scanRoots: [scanRoot],
    categories: [],
    customCategories: [],
    upload: {
      enabled: true,
      maxBytes: 10 * 1024 * 1024,
      allowedExtensions: ['.md'],
    },
  }, null, 2), 'utf8');
  await fs.writeFile(librariesFile, JSON.stringify({
    libraries: [
      { key: 'order', label: '订单分析', description: 'order', permissionLevel: 0 },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(cacheFile, JSON.stringify({
    generatedAt,
    scanRoot,
    scanRoots: [scanRoot],
    totalFiles: 1,
    scanSignature: 'sig-manual-reparse',
    indexedPaths: [sourcePath],
    items: [
      {
        path: sourcePath,
        name: 'reparse-me.md',
        ext: '.md',
        title: 'Reparse Me',
        category: 'report',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseMethod: 'markdown-utf8',
        parseStage: 'detailed',
        detailParseStatus: 'failed',
        detailParseError: 'stale-queue-error',
        markdownText: '# Reparse Me\n\nContent body',
        markdownMethod: 'existing-markdown',
        canonicalParseStatus: 'ready',
        fullText: '# Reparse Me\n\nContent body',
        summary: 'markdown doc',
        groups: ['order'],
        confirmedGroups: ['order'],
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(queueFile, JSON.stringify({
    updatedAt: generatedAt,
    items: [
      {
        path: sourcePath,
        status: 'failed',
        queuedAt: generatedAt,
        lastAttemptAt: generatedAt,
        attempts: 1,
        error: 'stale-queue-error',
      },
    ],
  }, null, 2), 'utf8');

  const id = documentStore.buildDocumentId(sourcePath);
  const result = await maintenanceOperations.runDocumentReparseAction([id]);

  assert.equal(result.matchedCount, 1);
  assert.equal(result.succeededCount, 1);
  assert.equal(result.failedCount, 0);

  const queueState = await documentDeepParseQueue.readDetailedParseQueueState();
  assert.equal(queueState.items.length, 0);
});
