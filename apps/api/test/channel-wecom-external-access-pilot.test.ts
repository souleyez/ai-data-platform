import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { OpenClawMemoryState } from '../src/lib/openclaw-memory-changes.js';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-wecom-external-pilot-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const botDefinitions = await importFresh<typeof import('../src/lib/bot-definitions.js')>(
  '../src/lib/bot-definitions.js',
);
const directorySources = await importFresh<typeof import('../src/lib/channel-directory-sources.js')>(
  '../src/lib/channel-directory-sources.js',
);
const directorySync = await importFresh<typeof import('../src/lib/channel-directory-sync.js')>(
  '../src/lib/channel-directory-sync.js',
);
const accessPolicies = await importFresh<typeof import('../src/lib/channel-user-access-policies.js')>(
  '../src/lib/channel-user-access-policies.js',
);
const channelIngress = await importFresh<typeof import('../src/lib/channel-ingress.js')>(
  '../src/lib/channel-ingress.js',
);
const knowledgeSupply = await importFresh<typeof import('../src/lib/knowledge-supply.js')>(
  '../src/lib/knowledge-supply.js',
);
const memorySelection = await importFresh<typeof import('../src/lib/openclaw-memory-selection.js')>(
  '../src/lib/openclaw-memory-selection.js',
);
const pathsModule = await importFresh<typeof import('../src/lib/paths.js')>(
  '../src/lib/paths.js',
);

function buildGlobalMemoryState(): OpenClawMemoryState {
  return {
    version: 1,
    generatedAt: '2026-04-07T00:00:00.000Z',
    documents: {
      'doc-contract': {
        id: 'doc-contract',
        libraryKeys: ['contract'],
        title: '合同制度总览',
        summary: '合同制度总览摘要',
        availability: 'available',
        updatedAt: '2026-04-07T09:00:00.000Z',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        fingerprint: 'fp-contract',
      },
      'doc-ioa': {
        id: 'doc-ioa',
        libraryKeys: ['ioa'],
        title: '新世界 IOA 制度',
        summary: '新世界 IOA 制度摘要',
        availability: 'available',
        updatedAt: '2026-04-07T10:00:00.000Z',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        fingerprint: 'fp-ioa',
      },
    },
    recentChanges: [],
  };
}

async function startJsonServer(body: unknown) {
  const server = http.createServer((_request, response) => {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(body));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to start json server');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function seedDocumentLibraries() {
  await fs.mkdir(pathsModule.STORAGE_CONFIG_DIR, { recursive: true });
  await fs.writeFile(path.join(pathsModule.STORAGE_CONFIG_DIR, 'document-libraries.json'), JSON.stringify({
    items: [
      { key: 'contract', label: '合同库', permissionLevel: 0, createdAt: '2026-04-07T00:00:00.000Z' },
      { key: 'ioa', label: '新世界IOA', permissionLevel: 0, createdAt: '2026-04-07T00:00:00.000Z' },
    ],
  }, null, 2), 'utf8');
}

async function seedDocumentCache() {
  await fs.mkdir(pathsModule.STORAGE_CACHE_DIR, { recursive: true });
  await fs.mkdir(pathsModule.STORAGE_CONFIG_DIR, { recursive: true });
  await fs.writeFile(path.join(pathsModule.STORAGE_CACHE_DIR, 'documents-cache.json'), JSON.stringify({
    generatedAt: '2026-04-07T10:00:00.000Z',
    scanRoot: 'C:\\uploads',
    scanRoots: ['C:\\uploads'],
    totalFiles: 2,
    scanSignature: 'wecom-external-access-pilot',
    items: [
      {
        path: 'C:\\uploads\\1744010000000-contract-handbook.txt',
        name: '1744010000000-contract-handbook.txt',
        ext: '.txt',
        title: '合同制度总览',
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
        path: 'C:\\uploads\\1744013600000-ioa-handbook.txt',
        name: '1744013600000-ioa-handbook.txt',
        ext: '.txt',
        title: '新世界 IOA 制度',
        category: 'ioa',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        detailParsedAt: '2026-04-07T10:00:00.000Z',
        groups: ['ioa'],
        confirmedGroups: ['ioa'],
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(pathsModule.STORAGE_CONFIG_DIR, 'document-overrides.json'), JSON.stringify({}, null, 2), 'utf8');
  await fs.writeFile(path.join(pathsModule.STORAGE_CONFIG_DIR, 'document-categories.json'), JSON.stringify({
    scanRoot: 'C:\\uploads',
    scanRoots: ['C:\\uploads'],
    categories: {
      contract: { label: '合同库' },
      ioa: { label: '新世界IOA' },
    },
    updatedAt: '2026-04-07T00:00:00.000Z',
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(pathsModule.STORAGE_CONFIG_DIR, 'retained-documents.json'), JSON.stringify({ items: [] }, null, 2), 'utf8');
}

async function seedGlobalMemoryCatalog() {
  await fs.mkdir(pathsModule.STORAGE_CONFIG_DIR, { recursive: true });
  await fs.writeFile(
    path.join(pathsModule.STORAGE_CONFIG_DIR, 'openclaw-memory-catalog.json'),
    JSON.stringify(buildGlobalMemoryState(), null, 2),
    'utf8',
  );
}

async function createWecomBot(directorySourceId: string) {
  return botDefinitions.createBotDefinition({
    id: 'shared-wecom-bot',
    name: '共享企业微信机器人',
    slug: 'shared-wecom-bot',
    enabled: true,
    isDefault: false,
    libraryAccessLevel: 0,
    visibleLibraryKeys: ['contract', 'ioa'],
    includeUngrouped: false,
    includeFailedParseDocuments: false,
    channelBindings: [
      { channel: 'web', enabled: true },
      {
        channel: 'wecom',
        enabled: true,
        routeKey: 'corp-route',
        tenantId: 'corp-01',
        externalBotId: 'wecom-bot-01',
        directorySourceId,
      },
    ],
  });
}

async function createSourceAndSync(baseUrl: string, sourceId: string) {
  await directorySources.createChannelDirectorySource({
    id: sourceId,
    botId: 'shared-wecom-bot',
    channel: 'wecom',
    routeKey: 'corp-route',
    tenantId: 'corp-01',
    externalBotId: 'wecom-bot-01',
    enabled: true,
    request: {
      url: `${baseUrl}/directory`,
      method: 'GET',
      headers: [],
    },
    responseMapping: {
      usersPath: 'users',
      groupsPath: 'groups',
      membershipsPath: 'memberships',
    },
    fieldMapping: {
      userIdField: 'id',
      userNameField: 'name',
      groupIdField: 'id',
      groupNameField: 'name',
      membershipUserIdField: 'userId',
      membershipGroupIdField: 'groupId',
    },
    sync: { mode: 'manual' },
  });
  await directorySync.runChannelDirectorySync(sourceId);
}

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('shared wecom bot should resolve different external users to different memory and retrieval scopes', async () => {
  await seedDocumentLibraries();
  await seedDocumentCache();
  await seedGlobalMemoryCatalog();
  const server = await startJsonServer({
    users: [
      { id: 'u-contract', name: '合同专员' },
      { id: 'u-ioa', name: 'IOA 专员' },
    ],
    groups: [
      { id: 'g-contract', name: '合同组' },
      { id: 'g-ioa', name: 'IOA组' },
    ],
    memberships: [
      { userId: 'u-contract', groupId: 'g-contract' },
      { userId: 'u-ioa', groupId: 'g-ioa' },
    ],
  });

  try {
    await createWecomBot('shared-wecom-directory');
    await createSourceAndSync(server.baseUrl, 'shared-wecom-directory');
    await accessPolicies.upsertChannelUserAccessPolicies('shared-wecom-directory', [
      { subjectType: 'group', subjectId: 'g-contract', visibleLibraryKeys: ['contract'] },
      { subjectType: 'group', subjectId: 'g-ioa', visibleLibraryKeys: ['ioa'] },
    ], 'tester');

    const contractContext = await channelIngress.resolveChannelIngressContext({
      channel: 'wecom',
      botId: 'shared-wecom-bot',
      prompt: '看最新制度',
      senderId: 'u-contract',
      senderName: '合同专员',
      routeKey: 'corp-route',
      tenantId: 'corp-01',
      externalBotId: 'wecom-bot-01',
    });
    const ioaContext = await channelIngress.resolveChannelIngressContext({
      channel: 'wecom',
      botId: 'shared-wecom-bot',
      prompt: '看最新制度',
      senderId: 'u-ioa',
      senderName: 'IOA 专员',
      routeKey: 'corp-route',
      tenantId: 'corp-01',
      externalBotId: 'wecom-bot-01',
    });

    assert.deepEqual(contractContext.accessContext.effectiveVisibleLibraryKeys, ['contract']);
    assert.deepEqual(ioaContext.accessContext.effectiveVisibleLibraryKeys, ['ioa']);

    const contractScope = await knowledgeSupply.prepareKnowledgeScope({
      requestText: 'show latest parsed document',
      chatHistory: [],
      botDefinition: contractContext.bot,
      effectiveVisibleLibraryKeys: contractContext.accessContext.effectiveVisibleLibraryKeys,
    });
    const ioaScope = await knowledgeSupply.prepareKnowledgeScope({
      requestText: 'show latest parsed document',
      chatHistory: [],
      botDefinition: ioaContext.bot,
      effectiveVisibleLibraryKeys: ioaContext.accessContext.effectiveVisibleLibraryKeys,
    });

    assert.deepEqual(contractScope.libraries, [{ key: 'contract', label: '合同库' }]);
    assert.deepEqual(ioaScope.libraries, [{ key: 'ioa', label: '新世界IOA' }]);
    assert.equal(contractScope.scopedItems[0]?.title, '合同制度总览');
    assert.equal(ioaScope.scopedItems[0]?.title, '新世界 IOA 制度');

    const state = await memorySelection.loadOpenClawMemorySelectionState({
      botId: 'shared-wecom-bot',
      forceGlobalState: true,
    });
    const contractMemory = memorySelection.selectOpenClawMemoryDocumentCandidatesFromState({
      state,
      requestText: 'show latest parsed document',
      limit: 4,
      effectiveVisibleLibraryKeys: contractContext.accessContext.effectiveVisibleLibraryKeys,
    });
    const ioaMemory = memorySelection.selectOpenClawMemoryDocumentCandidatesFromState({
      state,
      requestText: 'show latest parsed document',
      limit: 4,
      effectiveVisibleLibraryKeys: ioaContext.accessContext.effectiveVisibleLibraryKeys,
    });

    assert.deepEqual(contractMemory.documentIds, ['doc-contract']);
    assert.deepEqual(ioaMemory.documentIds, ['doc-ioa']);
  } finally {
    await server.close();
  }
});
