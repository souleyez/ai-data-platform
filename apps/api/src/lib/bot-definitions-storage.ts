import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadDocumentLibraries } from './document-libraries.js';
import {
  applyBotLibraryFallbacks,
  ensureSingleDefaultBot,
  mergeBotLists,
  normalizeBotDefinition,
  normalizeBotTimestamp,
  normalizePersistedBotConfig,
} from './bot-definitions-normalization.js';
import type { PersistedBotConfig } from './bot-definitions-types.js';
import { BOT_CONFIG_VERSION } from './bot-definitions-types.js';
import { REPO_ROOT, STORAGE_CONFIG_DIR } from './paths.js';

const DEFAULT_FILE = path.join(REPO_ROOT, 'config', 'bots.default.json');
const STORAGE_FILE = path.join(STORAGE_CONFIG_DIR, 'bots.json');

async function readJsonFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function ensureStorageDir() {
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
}

export async function writeBotConfigFile(config: PersistedBotConfig) {
  await ensureStorageDir();
  await fs.writeFile(STORAGE_FILE, JSON.stringify(config, null, 2), 'utf8');
}

export async function loadMergedBotConfig() {
  const [defaultRaw, localRaw, libraries] = await Promise.all([
    readJsonFile(DEFAULT_FILE),
    readJsonFile(STORAGE_FILE),
    loadDocumentLibraries(),
  ]);
  const defaultConfig = normalizePersistedBotConfig(defaultRaw);
  const localConfig = normalizePersistedBotConfig(localRaw);
  const libraryKeys = libraries.map((item) => item.key);
  const mergedItems = ensureSingleDefaultBot(
    applyBotLibraryFallbacks(
      mergeBotLists(defaultConfig.items, localConfig.items),
      libraryKeys,
    ),
  );

  if (!mergedItems.length) {
    const fallback = ensureSingleDefaultBot(applyBotLibraryFallbacks([normalizeBotDefinition({
      id: 'default',
      name: '默认助手',
      isDefault: true,
      enabled: true,
      includeUngrouped: true,
      libraryAccessLevel: 0,
      channelBindings: [{ channel: 'web', enabled: true }],
      visibleLibraryKeys: [],
    }, 'default')], libraryKeys));
    return {
      version: BOT_CONFIG_VERSION,
      updatedAt: new Date().toISOString(),
      items: fallback,
    } satisfies PersistedBotConfig;
  }

  return {
    version: BOT_CONFIG_VERSION,
    updatedAt: normalizeBotTimestamp(localConfig.updatedAt) || normalizeBotTimestamp(defaultConfig.updatedAt) || new Date().toISOString(),
    items: mergedItems,
  } satisfies PersistedBotConfig;
}
