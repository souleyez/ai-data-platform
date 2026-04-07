import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-doc-read-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const readOperations = await importFresh<typeof import('../src/lib/document-route-read-operations.js')>(
  '../src/lib/document-route-read-operations.js',
);

const cacheFile = path.join(storageRoot, 'cache', 'documents-cache.json');
const documentConfigFile = path.join(storageRoot, 'config', 'document-categories.json');
const queueFile = path.join(storageRoot, 'cache', 'document-deep-parse-queue.json');

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
});

async function seedDocumentCache() {
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  const generatedAt = '2026-04-07T09:30:00.000Z';
  const scanRoot = path.join(storageRoot, 'files');
  await fs.mkdir(path.dirname(documentConfigFile), { recursive: true });
  await fs.writeFile(documentConfigFile, JSON.stringify({
    scanRoot,
    scanRoots: [scanRoot],
    updatedAt: generatedAt,
  }, null, 2), 'utf8');
  await fs.writeFile(cacheFile, JSON.stringify({
    generatedAt,
    scanRoot,
    scanRoots: [scanRoot],
    totalFiles: 1,
    scanSignature: 'sig-1',
    indexedPaths: [path.join(scanRoot, 'order-report.xlsx')],
    items: [
      {
        path: path.join(scanRoot, 'order-report.xlsx'),
        name: 'order-report.xlsx',
        ext: '.xlsx',
        title: 'Order report',
        category: 'report',
        bizCategory: 'order',
        parseStatus: 'parsed',
        summary: '订单经营概览',
        excerpt: '订单经营概览',
        extractedChars: 120,
        groups: ['order'],
        confirmedGroups: ['order'],
        parseStage: 'quick',
        schemaType: 'order',
        topicTags: ['订单', '经营'],
        structuredProfile: {
          reportFocus: 'order',
        },
      },
    ],
  }, null, 2), 'utf8');
  return generatedAt;
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

test('document read operations should stay read-only and expose read telemetry', async () => {
  const generatedAt = await seedDocumentCache();

  const indexPayload = await readOperations.loadDocumentsIndexRoutePayload();
  const overviewPayload = await readOperations.loadDocumentsOverviewRoutePayload();
  const librariesPayload = await readOperations.loadDocumentLibrariesPayload();

  assert.equal(indexPayload.cacheHit, true);
  assert.equal(indexPayload.loadedFrom, 'cache');
  assert.equal(indexPayload.generatedAt, generatedAt);
  assert.equal(indexPayload.lastScanAt, generatedAt);
  assert.equal(typeof indexPayload.durationMs, 'number');
  assert.equal(indexPayload.items.length, 1);

  assert.equal(overviewPayload.cacheHit, true);
  assert.equal(overviewPayload.loadedFrom, 'cache');
  assert.equal(overviewPayload.generatedAt, generatedAt);
  assert.equal(overviewPayload.lastScanAt, generatedAt);
  assert.equal(typeof overviewPayload.durationMs, 'number');

  assert.equal(librariesPayload.loadedFrom, 'cache');
  assert.equal(librariesPayload.generatedAt, generatedAt);
  assert.equal(typeof librariesPayload.durationMs, 'number');

  assert.equal(await fileExists(queueFile), false);
});
