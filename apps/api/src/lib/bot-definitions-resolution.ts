import { isBotChannelEnabled } from './bot-definitions-normalization.js';
import { loadMergedBotConfig } from './bot-definitions-storage.js';
import type { BotChannel, BotDefinition, PublicBotSummary } from './bot-definitions-types.js';

export async function listBotDefinitions() {
  const config = await loadMergedBotConfig();
  return config.items.filter((item) => item.enabled);
}

export async function listBotDefinitionsForManage() {
  const config = await loadMergedBotConfig();
  return config.items;
}

export async function getDefaultBotDefinition() {
  const items = await listBotDefinitions();
  return items.find((item) => item.isDefault) || items[0] || null;
}

export async function getBotDefinition(botId?: string) {
  const config = await loadMergedBotConfig();
  if (!botId) {
    return config.items.find((item) => item.isDefault) || config.items[0] || null;
  }
  return config.items.find((item) => item.id === botId) || null;
}

export async function resolveBotDefinition(botId?: string) {
  const config = await loadMergedBotConfig();
  const requested = botId
    ? config.items.find((item) => item.id === botId && item.enabled)
    : null;
  if (requested) return requested;
  return config.items.find((item) => item.isDefault && item.enabled)
    || config.items.find((item) => item.enabled)
    || null;
}

export async function resolveBotForChannel(channel: BotChannel, routeContext?: {
  botId?: string;
  routeKey?: string;
  tenantId?: string;
  externalBotId?: string;
}) {
  const config = await loadMergedBotConfig();
  const enabledItems = config.items.filter((item) => item.enabled);
  if (routeContext?.botId) {
    const explicit = enabledItems.find((item) => item.id === routeContext.botId);
    if (explicit && isBotChannelEnabled(explicit, channel)) return explicit;
  }

  const candidates = enabledItems.filter((item) => isBotChannelEnabled(item, channel));
  if (!candidates.length) return null;

  const matchedByRoute = routeContext?.routeKey
    ? candidates.find((item) => item.channelBindings.some((binding) => (
      binding.channel === channel && binding.routeKey && binding.routeKey === routeContext.routeKey
    )))
    : null;
  if (matchedByRoute) return matchedByRoute;

  const matchedByTenant = routeContext?.tenantId
    ? candidates.find((item) => item.channelBindings.some((binding) => (
      binding.channel === channel && binding.tenantId && binding.tenantId === routeContext.tenantId
    )))
    : null;
  if (matchedByTenant) return matchedByTenant;

  const matchedByExternalBot = routeContext?.externalBotId
    ? candidates.find((item) => item.channelBindings.some((binding) => (
      binding.channel === channel && binding.externalBotId && binding.externalBotId === routeContext.externalBotId
    )))
    : null;
  if (matchedByExternalBot) return matchedByExternalBot;

  return candidates.find((item) => item.isDefault) || candidates[0] || null;
}

export function buildPublicBotSummary(bot: BotDefinition): PublicBotSummary {
  return {
    id: bot.id,
    name: bot.name,
    description: bot.description,
    enabled: bot.enabled,
    isDefault: bot.isDefault,
    intelligenceMode: bot.intelligenceMode === 'full' ? 'full' : 'service',
    libraryAccessLevel: bot.libraryAccessLevel,
    systemPromptSummary: bot.systemPrompt,
    channelBindings: bot.channelBindings.map((item) => ({
      channel: item.channel,
      enabled: item.enabled,
      configured: item.channel === 'web'
        ? item.enabled
        : Boolean(item.enabled && (item.externalBotId || item.tenantId || item.routeKey)),
    })),
  };
}
