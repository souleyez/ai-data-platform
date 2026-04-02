import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-local-datasource-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const datasourceDefinitions = await importFresh<typeof import('../src/lib/datasource-definitions.js')>(
  '../src/lib/datasource-definitions.js',
);
const datasourceExecution = await importFresh<typeof import('../src/lib/datasource-execution.js')>(
  '../src/lib/datasource-execution.js',
);
const documentOverrides = await importFresh<typeof import('../src/lib/document-overrides.js')>(
  '../src/lib/document-overrides.js',
);
const documentCacheRepository = await importFresh<typeof import('../src/lib/document-cache-repository.js')>(
  '../src/lib/document-cache-repository.js',
);
const documentStore = await importFresh<typeof import('../src/lib/document-store.js')>(
  '../src/lib/document-store.js',
);

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('local directory datasource should initialize cache, keep unsupported files out, and fallback to ungrouped', async () => {
  const sourceDir = path.join(storageRoot, 'source-files');
  const supportedFile = path.join(sourceDir, 'project-note.txt');
  const unsupportedFile = path.join(sourceDir, 'raw-config.json');

  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(supportedFile, 'Project handoff note with implementation details.', 'utf8');
  await fs.writeFile(unsupportedFile, '{"ignored": true}', 'utf8');

  const cachedBefore = await documentStore.listCachedDocumentPaths();
  assert.equal(cachedBefore.has(supportedFile), false);

  await datasourceDefinitions.upsertDatasourceDefinition({
    id: 'ds-local-dir',
    name: 'Local project files',
    kind: 'local_directory',
    status: 'active',
    targetLibraries: [{ key: 'custom-project', label: 'Project Library', mode: 'primary' }],
    schedule: { kind: 'manual', maxItemsPerRun: 10 },
    authMode: 'credential',
    credentialRef: { id: 'cred-should-be-cleared', kind: 'credential', label: 'legacy' },
    config: {
      path: sourceDir,
    },
  });

  const definition = await datasourceDefinitions.getDatasourceDefinition('ds-local-dir');
  assert.equal(definition?.authMode, 'none');
  assert.equal(definition?.credentialRef, null);

  const result = await datasourceExecution.runDatasourceDefinition('ds-local-dir');
  const overrides = await documentOverrides.loadDocumentOverrides();
  const cachedAfter = await documentStore.listCachedDocumentPaths();

  assert.equal(result.run?.status, 'success');
  assert.equal(result.run?.ingestedCount, 1);
  assert.equal(result.run?.ungroupedCount, 1);
  assert.equal(result.run?.groupedCount, 0);
  assert.equal(result.run?.unsupportedCount, 1);
  assert.equal(result.run?.skippedCount, 0);
  assert.equal(cachedAfter.has(supportedFile), true);
  assert.deepEqual(overrides[supportedFile]?.groups, ['ungrouped']);
  assert.ok((result.run?.resultSummaries || []).some((item) => item.id === 'local:filtered-ext'));
  assert.ok((result.run?.resultSummaries || []).some((item) => item.id === 'ingest:ungrouped'));

  const cache = await documentCacheRepository.readDocumentCache();
  assert.ok(cache?.indexedPaths?.includes(supportedFile));

  await documentCacheRepository.writeDocumentCache({
    ...cache!,
    items: [],
    indexedPaths: [supportedFile],
    totalFiles: 1,
  });

  const rerun = await datasourceExecution.runDatasourceDefinition('ds-local-dir');
  assert.equal(rerun.run?.ingestedCount, 0);
  assert.equal(rerun.run?.skippedCount, 1);
});
