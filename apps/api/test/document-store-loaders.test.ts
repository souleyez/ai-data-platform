import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-store-loaders-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh(specifier) {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`);
}

const documentStoreLoaders = await importFresh('../src/lib/document-store-loaders.ts');

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('mergeParsedDocumentsForPaths should match Windows cache entries when input uses forward slashes', async () => {
  const scanRoot = path.join(storageRoot, 'files');
  const configFile = path.join(storageRoot, 'config', 'document-categories.json');
  const cacheFile = path.join(storageRoot, 'cache', 'documents-cache.json');
  const sourcePath = path.join(scanRoot, 'windows-path.md');
  const generatedAt = new Date('2026-04-12T04:00:00.000Z').toISOString();

  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.mkdir(scanRoot, { recursive: true });
  await fs.writeFile(sourcePath, '# Windows path\n\nMarkdown body', 'utf8');
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
  await fs.writeFile(cacheFile, JSON.stringify({
    generatedAt,
    scanRoot,
    scanRoots: [scanRoot],
    totalFiles: 1,
    scanSignature: 'sig-forward-slash-reparse',
    indexedPaths: [sourcePath],
    items: [
      {
        path: sourcePath,
        name: 'windows-path.md',
        ext: '.md',
        title: 'Legacy markdown',
        category: 'report',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseMethod: 'text-utf8',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        canonicalParseStatus: 'fallback_full_text',
        fullText: 'Legacy markdown',
        summary: 'legacy',
      },
    ],
  }, null, 2), 'utf8');

  const slashPath = sourcePath.replace(/\\/g, '/');
  const result = await documentStoreLoaders.mergeParsedDocumentsForPaths([slashPath], 200, [scanRoot], {
    parseStage: 'detailed',
    cloudEnhancement: false,
    clearQueueEntries: true,
  });

  const updated = result.items.find((item) => item.path === sourcePath);
  assert.ok(updated);
  assert.equal(updated.parseMethod, 'existing-markdown');
  assert.equal(updated.canonicalParseStatus, 'ready');
  assert.equal(updated.markdownMethod, 'existing-markdown');

  const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  const cached = cache.items.find((item) => item.path === sourcePath);
  assert.ok(cached);
  assert.equal(cached.parseMethod, 'existing-markdown');
  assert.equal(cached.canonicalParseStatus, 'ready');
  assert.equal(cached.markdownMethod, 'existing-markdown');
});
