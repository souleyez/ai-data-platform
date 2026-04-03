import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  getBotDefinition,
  listBotDefinitionsForManage,
  type BotDefinition,
} from './bot-definitions.js';
import {
  filterMemoryDocumentsForBot,
} from './bot-visibility.js';
import type { OpenClawMemoryState } from './openclaw-memory-changes.js';
import { STORAGE_CONFIG_DIR } from './paths.js';

const GLOBAL_STATE_FILE = path.join(STORAGE_CONFIG_DIR, 'openclaw-memory-catalog.json');

function getBotStateFile(botId: string) {
  return path.join(STORAGE_CONFIG_DIR, 'bots', botId, 'memory-catalog.json');
}

async function ensureBotDir(botId: string) {
  await fs.mkdir(path.dirname(getBotStateFile(botId)), { recursive: true });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function buildBotScopedMemoryState(bot: BotDefinition, state: OpenClawMemoryState): OpenClawMemoryState {
  const documents = filterMemoryDocumentsForBot(bot, Object.values(state.documents || {}));
  const nextDocuments = Object.fromEntries(documents.map((item) => [item.id, item]));
  const visibleDocumentIds = new Set(documents.map((item) => item.id));
  const visibleLibraryKeys = new Set(bot.visibleLibraryKeys);
  if (bot.includeUngrouped) visibleLibraryKeys.add('ungrouped');

  return {
    version: state.version,
    generatedAt: state.generatedAt,
    documents: nextDocuments,
    recentChanges: (state.recentChanges || []).filter((change) => (
      visibleDocumentIds.has(change.documentId)
      || change.libraryKeys.some((key) => visibleLibraryKeys.has(key))
    )),
  };
}

async function loadGlobalState() {
  return readJsonFile<OpenClawMemoryState>(GLOBAL_STATE_FILE);
}

export async function refreshBotMemoryCatalogs(globalState?: OpenClawMemoryState | null) {
  const [bots, state] = await Promise.all([
    listBotDefinitionsForManage(),
    globalState ? Promise.resolve(globalState) : loadGlobalState(),
  ]);

  if (!state) return { botCount: 0 };

  const enabledBots = bots.filter((item) => item.enabled);
  await Promise.all(enabledBots.map(async (bot) => {
    const scopedState = buildBotScopedMemoryState(bot, state);
    await ensureBotDir(bot.id);
    await fs.writeFile(getBotStateFile(bot.id), JSON.stringify(scopedState, null, 2), 'utf8');
  }));

  return { botCount: enabledBots.length };
}

export async function loadBotMemorySelectionState(botId?: string) {
  const bot = await getBotDefinition(botId);
  const globalState = await loadGlobalState();
  if (!globalState) return null;
  if (!bot) return globalState;

  const fileState = await readJsonFile<OpenClawMemoryState>(getBotStateFile(bot.id));
  return fileState || buildBotScopedMemoryState(bot, globalState);
}
