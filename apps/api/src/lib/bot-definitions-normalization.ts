import type { BotChannelBinding, BotDefinition, PersistedBotConfig } from './bot-definitions-types.js';
import { BOT_CHANNELS, BOT_CONFIG_VERSION } from './bot-definitions-types.js';

export function normalizeText(value: unknown) {
  return String(value || '').trim();
}

export function slugifyBotDefinition(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `bot-${Date.now()}`;
}

export function normalizeBotTimestamp(value: unknown) {
  const text = normalizeText(value);
  if (!text) return '';
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : '';
}

export function uniqueBotList(values: unknown[]) {
  return [...new Set((values || []).map((item) => normalizeText(item)).filter(Boolean))];
}

export function normalizeBotLibraryAccessLevel(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

export function normalizeBotChannelBinding(value: unknown): BotChannelBinding | null {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!source) return null;
  const channel = BOT_CHANNELS.find((item) => item === normalizeText(source.channel).toLowerCase());
  if (!channel) return null;
  return {
    channel,
    enabled: source.enabled !== false,
    externalBotId: normalizeText(source.externalBotId) || undefined,
    tenantId: normalizeText(source.tenantId) || undefined,
    routeKey: normalizeText(source.routeKey) || undefined,
    directorySourceId: normalizeText(source.directorySourceId) || undefined,
  };
}

export function normalizeBotDefinition(value: unknown, fallbackId = ''): BotDefinition {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const id = normalizeText(source.id) || fallbackId || slugifyBotDefinition(normalizeText(source.name) || 'bot');
  const name = normalizeText(source.name) || id;
  const channelBindings = Array.isArray(source.channelBindings)
    ? source.channelBindings
        .map((item) => normalizeBotChannelBinding(item))
        .filter((item): item is BotChannelBinding => Boolean(item))
    : [];

  return {
    id,
    name,
    slug: normalizeText(source.slug) || slugifyBotDefinition(name),
    description: normalizeText(source.description),
    enabled: source.enabled !== false,
    isDefault: source.isDefault === true,
    systemPrompt: normalizeText(source.systemPrompt),
    libraryAccessLevel: normalizeBotLibraryAccessLevel(source.libraryAccessLevel),
    visibleLibraryKeys: uniqueBotList(Array.isArray(source.visibleLibraryKeys) ? source.visibleLibraryKeys : []),
    includeUngrouped: source.includeUngrouped !== false,
    includeFailedParseDocuments: source.includeFailedParseDocuments === true,
    channelBindings: channelBindings.length ? channelBindings : [{ channel: 'web', enabled: true }],
    updatedAt: normalizeBotTimestamp(source.updatedAt) || new Date().toISOString(),
  };
}

export function normalizePersistedBotConfig(value: unknown): PersistedBotConfig {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const items = Array.isArray(source.items)
    ? source.items.map((item, index) => normalizeBotDefinition(item, `bot-${index + 1}`))
    : [];
  return {
    version: BOT_CONFIG_VERSION,
    updatedAt: normalizeBotTimestamp(source.updatedAt) || new Date().toISOString(),
    items,
  };
}

export function mergeBotLists(defaultItems: BotDefinition[], localItems: BotDefinition[]) {
  const merged = new Map<string, BotDefinition>();
  for (const item of defaultItems) merged.set(item.id, item);
  for (const item of localItems) merged.set(item.id, item);
  return [...merged.values()];
}

export function ensureSingleDefaultBot(items: BotDefinition[], preferredDefaultId = '') {
  const preferred = normalizeText(preferredDefaultId);
  if (preferred) {
    let matched = false;
    const normalized = items.map((item) => {
      const next = { ...item, isDefault: false };
      if (!matched && next.id === preferred && next.enabled) {
        next.isDefault = true;
        matched = true;
      }
      return next;
    });
    if (matched) return normalized;
  }

  let defaultFound = false;
  const normalized = items.map((item) => {
    const next = { ...item };
    if (next.isDefault && !defaultFound && next.enabled) {
      defaultFound = true;
      return next;
    }
    next.isDefault = false;
    return next;
  });

  if (!defaultFound && normalized.length) {
    const firstEnabled = normalized.find((item) => item.enabled) || normalized[0];
    if (firstEnabled) firstEnabled.isDefault = true;
  }

  return normalized;
}

export function applyBotLibraryFallbacks(items: BotDefinition[], libraryKeys: string[]) {
  return items.map((item) => {
    const next = { ...item };
    if (next.isDefault && !next.visibleLibraryKeys.length) {
      next.visibleLibraryKeys = [...libraryKeys];
    }
    return next;
  });
}

export function normalizeBotItemsForWrite(items: BotDefinition[], preferredDefaultId = '') {
  return ensureSingleDefaultBot(items.map((item) => normalizeBotDefinition(item, item.id)), preferredDefaultId).map((item) => ({
    ...item,
    updatedAt: new Date().toISOString(),
  }));
}

export function isBotChannelEnabled(bot: BotDefinition, channel: BotChannelBinding['channel']) {
  return bot.channelBindings.some((item) => item.channel === channel && item.enabled);
}
