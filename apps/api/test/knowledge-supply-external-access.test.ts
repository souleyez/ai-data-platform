import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BotDefinition } from '../src/lib/bot-definitions.js';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-knowledge-supply-external-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const knowledgeSupply = await importFresh<typeof import('../src/lib/knowledge-supply.js')>(
  '../src/lib/knowledge-supply.js',
);
const pathsModule = await importFresh<typeof import('../src/lib/paths.js')>(
  '../src/lib/paths.js',
);

const DOCUMENT_CACHE_FILE = path.join(pathsModule.STORAGE_CACHE_DIR, 'documents-cache.json');
const DOCUMENT_OVERRIDES_FILE = path.join(pathsModule.STORAGE_CONFIG_DIR, 'document-overrides.json');
const DOCUMENT_CONFIG_FILE = path.join(pathsModule.STORAGE_CONFIG_DIR, 'document-categories.json');
const DOCUMENT_LIBRARIES_FILE = path.join(pathsModule.STORAGE_CONFIG_DIR, 'document-libraries.json');
const RETAINED_DOCUMENTS_FILE = path.join(pathsModule.STORAGE_CONFIG_DIR, 'retained-documents.json');

async function withTemporaryDocumentCache<T>(payload: Record<string, unknown>, fn: () => Promise<T>) {
  await fs.mkdir(pathsModule.STORAGE_CACHE_DIR, { recursive: true });
  await fs.mkdir(pathsModule.STORAGE_CONFIG_DIR, { recursive: true });
  await fs.writeFile(DOCUMENT_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  await fs.writeFile(DOCUMENT_OVERRIDES_FILE, JSON.stringify({}, null, 2), 'utf8');
  await fs.writeFile(DOCUMENT_LIBRARIES_FILE, JSON.stringify({
    items: [
      {
        key: 'contract',
        label: '合同协议',
        permissionLevel: 0,
        knowledgePagesEnabled: false,
        knowledgePagesMode: 'none',
        createdAt: '2026-04-07T00:00:00.000Z',
      },
      {
        key: 'resume',
        label: '人才简历',
        permissionLevel: 0,
        knowledgePagesEnabled: false,
        knowledgePagesMode: 'none',
        createdAt: '2026-04-07T00:00:00.000Z',
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(DOCUMENT_CONFIG_FILE, JSON.stringify({
    scanRoot: payload.scanRoot,
    scanRoots: payload.scanRoots,
    categories: {
      contract: { label: '合同协议' },
      resume: { label: '人才简历' },
    },
    updatedAt: '2026-04-07T00:00:00.000Z',
  }, null, 2), 'utf8');
  await fs.writeFile(RETAINED_DOCUMENTS_FILE, JSON.stringify({ items: [] }, null, 2), 'utf8');
  return fn();
}

function createBot(): BotDefinition {
  return {
    id: 'shared-bot',
    name: '共享机器人',
    slug: 'shared-bot',
    description: '',
    enabled: true,
    isDefault: false,
    systemPrompt: '',
    libraryAccessLevel: 0,
    visibleLibraryKeys: ['contract', 'resume'],
    includeUngrouped: false,
    includeFailedParseDocuments: false,
    channelBindings: [{ channel: 'web', enabled: true }],
    updatedAt: '2026-04-07T00:00:00.000Z',
  };
}

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('prepareKnowledgeScope should enforce effectiveVisibleLibraryKeys over broader bot visibility', async () => {
  await withTemporaryDocumentCache({
    generatedAt: '2026-04-07T10:00:00.000Z',
    scanRoot: 'C:\\uploads',
    scanRoots: ['C:\\uploads'],
    totalFiles: 2,
    scanSignature: 'external-access-scope',
    items: [
      {
        path: 'C:\\uploads\\1744010000000-contract-a.txt',
        name: '1744010000000-contract-a.txt',
        ext: '.txt',
        title: 'contract-a',
        category: 'contract',
        bizCategory: 'contract',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        detailParsedAt: '2026-04-07T09:00:00.000Z',
        groups: ['contract'],
        confirmedGroups: ['contract'],
      },
      {
        path: 'C:\\uploads\\1744013600000-resume-a.txt',
        name: '1744013600000-resume-a.txt',
        ext: '.txt',
        title: 'resume-a',
        category: 'resume',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        detailParsedAt: '2026-04-07T10:00:00.000Z',
        groups: ['resume'],
        confirmedGroups: ['resume'],
      },
    ],
  }, async () => {
    const scope = await knowledgeSupply.prepareKnowledgeScope({
      requestText: 'show the most recently parsed document',
      chatHistory: [],
      botDefinition: createBot(),
      effectiveVisibleLibraryKeys: ['resume'],
    });

    assert.deepEqual(scope.libraries, [{ key: 'resume', label: '人才简历' }]);
    assert.equal(scope.scopedItems.length, 1);
    assert.equal(scope.scopedItems[0]?.title, 'resume-a');
  });
});

test('prepareKnowledgeScope should return no libraries and no documents when effectiveVisibleLibraryKeys is empty', async () => {
  await withTemporaryDocumentCache({
    generatedAt: '2026-04-07T10:00:00.000Z',
    scanRoot: 'C:\\uploads',
    scanRoots: ['C:\\uploads'],
    totalFiles: 1,
    scanSignature: 'external-access-empty-scope',
    items: [
      {
        path: 'C:\\uploads\\1744013600000-resume-a.txt',
        name: '1744013600000-resume-a.txt',
        ext: '.txt',
        title: 'resume-a',
        category: 'resume',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        detailParsedAt: '2026-04-07T10:00:00.000Z',
        groups: ['resume'],
        confirmedGroups: ['resume'],
      },
    ],
  }, async () => {
    const scope = await knowledgeSupply.prepareKnowledgeScope({
      requestText: 'show the most recently parsed document',
      chatHistory: [],
      botDefinition: createBot(),
      effectiveVisibleLibraryKeys: [],
    });

    assert.deepEqual(scope.libraries, []);
    assert.deepEqual(scope.scopedItems, []);
  });
});
