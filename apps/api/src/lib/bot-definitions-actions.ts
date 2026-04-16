import {
  normalizeBotDefinition,
  normalizeBotItemsForWrite,
  normalizeText,
  slugifyBotDefinition,
} from './bot-definitions-normalization.js';
import { loadMergedBotConfig, writeBotConfigFile } from './bot-definitions-storage.js';
import type { BotDefinition, PersistedBotConfig } from './bot-definitions-types.js';
import { BOT_CONFIG_VERSION } from './bot-definitions-types.js';
import { scheduleOpenClawMemoryCatalogSync } from './openclaw-memory-sync.js';

export async function createBotDefinition(input: Partial<BotDefinition>) {
  const current = (await loadMergedBotConfig()).items;
  const name = normalizeText(input.name) || '新机器人';
  const candidate = normalizeBotDefinition({
    ...input,
    id: normalizeText(input.id) || slugifyBotDefinition(name),
    name,
    slug: normalizeText(input.slug) || slugifyBotDefinition(name),
    enabled: input.enabled !== false,
    isDefault: input.isDefault === true,
    channelBindings: Array.isArray(input.channelBindings) ? input.channelBindings : [{ channel: 'web', enabled: true }],
  });
  if (current.some((item) => item.id === candidate.id)) {
    throw new Error('bot already exists');
  }
  const items = normalizeBotItemsForWrite([...current, candidate], candidate.isDefault ? candidate.id : '');
  const payload = {
    version: BOT_CONFIG_VERSION,
    updatedAt: new Date().toISOString(),
    items,
  } satisfies PersistedBotConfig;
  await writeBotConfigFile(payload);
  scheduleOpenClawMemoryCatalogSync('bot-definitions-create');
  return items.find((item) => item.id === candidate.id) || candidate;
}

export async function updateBotDefinition(botId: string, patch: Partial<BotDefinition>) {
  const current = (await loadMergedBotConfig()).items;
  const target = current.find((item) => item.id === botId);
  if (!target) throw new Error('bot not found');

  const nextTarget = normalizeBotDefinition({
    ...target,
    ...patch,
    id: target.id,
  }, target.id);
  const items = normalizeBotItemsForWrite(
    current.map((item) => (item.id === botId ? nextTarget : item)),
    nextTarget.isDefault ? nextTarget.id : '',
  );
  const payload = {
    version: BOT_CONFIG_VERSION,
    updatedAt: new Date().toISOString(),
    items,
  } satisfies PersistedBotConfig;
  await writeBotConfigFile(payload);
  scheduleOpenClawMemoryCatalogSync('bot-definitions-update');
  return items.find((item) => item.id === botId) || nextTarget;
}

export async function assertBotManageAccess() {
  return true;
}
