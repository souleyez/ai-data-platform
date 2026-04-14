import { promises as fs } from 'node:fs';
import path from 'node:path';
import { refreshBotMemoryCatalogs } from './bot-memory-catalog.js';
import { MEMORY_ROOT, STORAGE_CONFIG_DIR } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';
import { diffOpenClawMemoryState, type OpenClawMemoryState } from './openclaw-memory-changes.js';
import { buildOpenClawMemoryCatalogSnapshot } from './openclaw-memory-catalog-builders.js';
import type { OpenClawMemoryCatalogSnapshot } from './openclaw-memory-catalog-types.js';

const LEGACY_CATALOG_ROOT = path.join(MEMORY_ROOT, 'catalog');
export const OPENCLAW_MEMORY_STATE_FILE = path.join(STORAGE_CONFIG_DIR, 'openclaw-memory-catalog.json');
export const OPENCLAW_MEMORY_CATALOG_SNAPSHOT_FILE = path.join(STORAGE_CONFIG_DIR, 'openclaw-memory-catalog-snapshot.json');

async function ensureStateDir() {
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
}

async function readPreviousState(): Promise<OpenClawMemoryState | null> {
  const { data } = await readRuntimeStateJson<OpenClawMemoryState | null>({
    filePath: OPENCLAW_MEMORY_STATE_FILE,
    fallback: null,
    normalize: (parsed) => (
      parsed && typeof parsed === 'object'
        ? parsed as OpenClawMemoryState
        : null
    ),
  });
  return data;
}

async function writeState(state: OpenClawMemoryState) {
  await writeRuntimeStateJson({
    filePath: OPENCLAW_MEMORY_STATE_FILE,
    payload: state,
  });
}

async function writeCatalogSnapshot(snapshot: OpenClawMemoryCatalogSnapshot) {
  await writeRuntimeStateJson({
    filePath: OPENCLAW_MEMORY_CATALOG_SNAPSHOT_FILE,
    payload: snapshot,
  });
}

async function removeLegacyCatalogFiles() {
  await fs.rm(LEGACY_CATALOG_ROOT, { recursive: true, force: true });
}

export async function loadOpenClawMemoryCatalogSnapshot(): Promise<OpenClawMemoryCatalogSnapshot | null> {
  const { data } = await readRuntimeStateJson<OpenClawMemoryCatalogSnapshot | null>({
    filePath: OPENCLAW_MEMORY_CATALOG_SNAPSHOT_FILE,
    fallback: null,
    normalize: (parsed) => (
      parsed && typeof parsed === 'object'
        ? parsed as OpenClawMemoryCatalogSnapshot
        : null
    ),
  });
  if (data) return data;

  const snapshot = await buildOpenClawMemoryCatalogSnapshot();
  await writeCatalogSnapshot(snapshot);
  return snapshot;
}

export async function refreshOpenClawMemoryCatalog() {
  await ensureStateDir();
  const snapshot = await buildOpenClawMemoryCatalogSnapshot();
  const previousState = await readPreviousState();
  const nextState = diffOpenClawMemoryState({
    previous: previousState,
    nextDocuments: snapshot.documents.map((item) => ({
      id: item.id,
      libraryKeys: item.libraryKeys,
      title: item.title,
      summary: item.summary,
      availability: item.availability,
      updatedAt: item.updatedAt,
      parseStatus: item.parseStatus,
      parseStage: item.parseStage,
      detailParseStatus: item.detailParseStatus,
      fingerprint: item.fingerprint,
    })),
    generatedAt: snapshot.generatedAt,
  });
  await removeLegacyCatalogFiles();
  await writeCatalogSnapshot(snapshot);
  await writeState(nextState);
  const botRefresh = await refreshBotMemoryCatalogs(nextState);

  return {
    generatedAt: snapshot.generatedAt,
    libraryCount: snapshot.libraryCount,
    documentCount: snapshot.documentCount,
    templateCount: snapshot.templateCount,
    outputCount: snapshot.outputCount,
    changeCount: nextState.recentChanges.length,
    changedThisRun: nextState.recentChanges.filter((item) => item.happenedAt === snapshot.generatedAt).length,
    botCount: botRefresh.botCount,
  };
}
