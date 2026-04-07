import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { OpenClawMemoryState } from '../src/lib/openclaw-memory-changes.js';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-memory-external-access-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const selectionModule = await importFresh<typeof import('../src/lib/openclaw-memory-selection.js')>(
  '../src/lib/openclaw-memory-selection.js',
);
const pathsModule = await importFresh<typeof import('../src/lib/paths.js')>(
  '../src/lib/paths.js',
);

function buildGlobalState(): OpenClawMemoryState {
  return {
    version: 1,
    generatedAt: '2026-04-07T00:00:00.000Z',
    documents: {
      'doc-resume': {
        id: 'doc-resume',
        libraryKeys: ['resume'],
        title: 'Resume A',
        summary: 'Candidate resume summary',
        availability: 'available',
        updatedAt: '2026-04-07T10:00:00.000Z',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        fingerprint: 'fp-resume',
      },
      'doc-bid': {
        id: 'doc-bid',
        libraryKeys: ['bids'],
        title: 'Bid A',
        summary: 'Bid package summary',
        availability: 'available',
        updatedAt: '2026-04-07T09:00:00.000Z',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        fingerprint: 'fp-bid',
      },
    },
    recentChanges: [],
  };
}

async function seedMemoryFiles() {
  const globalFile = path.join(pathsModule.STORAGE_CONFIG_DIR, 'openclaw-memory-catalog.json');
  const botFile = path.join(pathsModule.STORAGE_CONFIG_DIR, 'bots', 'shared-bot', 'memory-catalog.json');
  const botsFile = path.join(pathsModule.STORAGE_CONFIG_DIR, 'bots.json');
  await fs.mkdir(path.dirname(botFile), { recursive: true });
  await fs.writeFile(botsFile, JSON.stringify({
    version: 1,
    updatedAt: '2026-04-07T00:00:00.000Z',
    items: [
      {
        id: 'shared-bot',
        name: 'Shared Bot',
        slug: 'shared-bot',
        description: '',
        enabled: true,
        isDefault: false,
        systemPrompt: '',
        libraryAccessLevel: 0,
        visibleLibraryKeys: ['resume', 'bids'],
        includeUngrouped: false,
        includeFailedParseDocuments: false,
        channelBindings: [{ channel: 'web', enabled: true }],
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(globalFile, JSON.stringify(buildGlobalState(), null, 2), 'utf8');
  await fs.writeFile(botFile, JSON.stringify({
    version: 1,
    generatedAt: '2026-04-07T00:00:00.000Z',
    documents: {
      'doc-bid': buildGlobalState().documents['doc-bid'],
    },
    recentChanges: [],
  }, null, 2), 'utf8');
}

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('loadOpenClawMemorySelectionState should keep bot-only requests on per-bot memory state', async () => {
  await seedMemoryFiles();

  const state = await selectionModule.loadOpenClawMemorySelectionState({ botId: 'shared-bot' });
  const selection = selectionModule.selectOpenClawMemoryDocumentCandidatesFromState({
    state,
    requestText: 'show latest documents',
    limit: 4,
  });

  assert.deepEqual(Object.keys(state?.documents || {}), ['doc-bid']);
  assert.deepEqual(selection.documentIds, ['doc-bid']);
});

test('loadOpenClawMemorySelectionState should use global state and effectiveVisibleLibraryKeys for mapped requests', async () => {
  await seedMemoryFiles();

  const state = await selectionModule.loadOpenClawMemorySelectionState({
    botId: 'shared-bot',
    forceGlobalState: true,
  });
  const selection = selectionModule.selectOpenClawMemoryDocumentCandidatesFromState({
    state,
    requestText: 'show latest documents',
    limit: 4,
    effectiveVisibleLibraryKeys: ['resume'],
  });

  assert.deepEqual(Object.keys(state?.documents || {}).sort(), ['doc-bid', 'doc-resume']);
  assert.deepEqual(selection.documentIds, ['doc-resume']);
  assert.doesNotMatch(selection.documentIds.join(','), /doc-bid/);
});
