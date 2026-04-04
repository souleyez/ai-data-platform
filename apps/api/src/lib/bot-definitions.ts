import { promises as fs } from 'node:fs';
import path from 'node:path';
import { verifyAccessKey } from './access-keys.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { getIntelligenceModeStatus } from './intelligence-mode.js';
import { scheduleOpenClawMemoryCatalogSync } from './openclaw-memory-sync.js';
import { REPO_ROOT, STORAGE_CONFIG_DIR } from './paths.js';

export type BotChannel = 'web' | 'wecom' | 'teams';

export type BotChannelBinding = {
  channel: BotChannel;
  enabled: boolean;
  externalBotId?: string;
  tenantId?: string;
  routeKey?: string;
};

export type BotDefinition = {
  id: string;
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  isDefault: boolean;
  systemPrompt: string;
  visibleLibraryKeys: string[];
  includeUngrouped: boolean;
  includeFailedParseDocuments: boolean;
  channelBindings: BotChannelBinding[];
  updatedAt: string;
};

type PersistedBotConfig = {
  version: number;
  updatedAt: string;
  items: BotDefinition[];
};

export type PublicBotSummary = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isDefault: boolean;
  channelBindings: Array<{ channel: BotChannel; enabled: boolean }>;
};

const CONFIG_VERSION = 1;
const DEFAULT_FILE = path.join(REPO_ROOT, 'config', 'bots.default.json');
const STORAGE_FILE = path.join(STORAGE_CONFIG_DIR, 'bots.json');
const CHANNELS: BotChannel[] = ['web', 'wecom', 'teams'];

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function slugify(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `bot-${Date.now()}`;
}

function normalizeTimestamp(value: unknown) {
  const text = normalizeText(value);
  if (!text) return '';
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : '';
}

function uniqueList(values: unknown[]) {
  return [...new Set((values || []).map((item) => normalizeText(item)).filter(Boolean))];
}

function normalizeChannelBinding(value: unknown): BotChannelBinding | null {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!source) return null;
  const channel = CHANNELS.find((item) => item === normalizeText(source.channel).toLowerCase());
  if (!channel) return null;
  return {
    channel,
    enabled: source.enabled !== false,
    externalBotId: normalizeText(source.externalBotId) || undefined,
    tenantId: normalizeText(source.tenantId) || undefined,
    routeKey: normalizeText(source.routeKey) || undefined,
  };
}

function normalizeBotDefinition(value: unknown, fallbackId = ''): BotDefinition {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const id = normalizeText(source.id) || fallbackId || slugify(normalizeText(source.name) || 'bot');
  const name = normalizeText(source.name) || id;
  const channelBindings = Array.isArray(source.channelBindings)
    ? source.channelBindings
        .map((item) => normalizeChannelBinding(item))
        .filter((item): item is BotChannelBinding => Boolean(item))
    : [];

  return {
    id,
    name,
    slug: normalizeText(source.slug) || slugify(name),
    description: normalizeText(source.description),
    enabled: source.enabled !== false,
    isDefault: source.isDefault === true,
    systemPrompt: normalizeText(source.systemPrompt),
    visibleLibraryKeys: uniqueList(Array.isArray(source.visibleLibraryKeys) ? source.visibleLibraryKeys : []),
    includeUngrouped: source.includeUngrouped !== false,
    includeFailedParseDocuments: source.includeFailedParseDocuments === true,
    channelBindings: channelBindings.length ? channelBindings : [{ channel: 'web', enabled: true }],
    updatedAt: normalizeTimestamp(source.updatedAt) || new Date().toISOString(),
  };
}

function normalizePersistedBotConfig(value: unknown): PersistedBotConfig {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const items = Array.isArray(source.items)
    ? source.items.map((item, index) => normalizeBotDefinition(item, `bot-${index + 1}`))
    : [];
  return {
    version: CONFIG_VERSION,
    updatedAt: normalizeTimestamp(source.updatedAt) || new Date().toISOString(),
    items,
  };
}

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

async function writeConfigFile(config: PersistedBotConfig) {
  await ensureStorageDir();
  await fs.writeFile(STORAGE_FILE, JSON.stringify(config, null, 2), 'utf8');
}

function mergeBotLists(defaultItems: BotDefinition[], localItems: BotDefinition[]) {
  const merged = new Map<string, BotDefinition>();
  for (const item of defaultItems) merged.set(item.id, item);
  for (const item of localItems) merged.set(item.id, item);
  return [...merged.values()];
}

function ensureSingleDefault(items: BotDefinition[], preferredDefaultId = '') {
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
    if (firstEnabled) {
      firstEnabled.isDefault = true;
    }
  }

  return normalized;
}

function applyLibraryFallbacks(items: BotDefinition[], libraryKeys: string[]) {
  return items.map((item) => {
    const next = { ...item };
    if (next.isDefault && !next.visibleLibraryKeys.length) {
      next.visibleLibraryKeys = [...libraryKeys];
    }
    return next;
  });
}

async function loadMergedConfig() {
  const [defaultRaw, localRaw, libraries] = await Promise.all([
    readJsonFile(DEFAULT_FILE),
    readJsonFile(STORAGE_FILE),
    loadDocumentLibraries(),
  ]);
  const defaultConfig = normalizePersistedBotConfig(defaultRaw);
  const localConfig = normalizePersistedBotConfig(localRaw);
  const libraryKeys = libraries.map((item) => item.key);
  const mergedItems = ensureSingleDefault(
    applyLibraryFallbacks(
      mergeBotLists(defaultConfig.items, localConfig.items),
      libraryKeys,
    ),
  );

  if (!mergedItems.length) {
    const fallback = ensureSingleDefault(applyLibraryFallbacks([normalizeBotDefinition({
      id: 'default',
      name: '默认助手',
      isDefault: true,
      enabled: true,
      includeUngrouped: true,
      channelBindings: [{ channel: 'web', enabled: true }],
      visibleLibraryKeys: [],
    }, 'default')], libraryKeys));
    return {
      version: CONFIG_VERSION,
      updatedAt: new Date().toISOString(),
      items: fallback,
    } satisfies PersistedBotConfig;
  }

  return {
    version: CONFIG_VERSION,
    updatedAt: normalizeTimestamp(localConfig.updatedAt) || normalizeTimestamp(defaultConfig.updatedAt) || new Date().toISOString(),
    items: mergedItems,
  } satisfies PersistedBotConfig;
}

function normalizeItemsForWrite(items: BotDefinition[], preferredDefaultId = '') {
  return ensureSingleDefault(items.map((item) => normalizeBotDefinition(item, item.id)), preferredDefaultId).map((item) => ({
    ...item,
    updatedAt: new Date().toISOString(),
  }));
}

export function isBotChannelEnabled(bot: BotDefinition, channel: BotChannel) {
  return bot.channelBindings.some((item) => item.channel === channel && item.enabled);
}

export async function listBotDefinitions() {
  const config = await loadMergedConfig();
  return config.items.filter((item) => item.enabled);
}

export async function listBotDefinitionsForManage() {
  const config = await loadMergedConfig();
  return config.items;
}

export async function getDefaultBotDefinition() {
  const items = await listBotDefinitions();
  return items.find((item) => item.isDefault) || items[0] || null;
}

export async function getBotDefinition(botId?: string) {
  const config = await loadMergedConfig();
  if (!botId) {
    return config.items.find((item) => item.isDefault) || config.items[0] || null;
  }
  return config.items.find((item) => item.id === botId) || null;
}

export async function resolveBotDefinition(botId?: string) {
  const config = await loadMergedConfig();
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
  const config = await loadMergedConfig();
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
    channelBindings: bot.channelBindings.map((item) => ({
      channel: item.channel,
      enabled: item.enabled,
    })),
  };
}

export async function createBotDefinition(input: Partial<BotDefinition>) {
  const current = await listBotDefinitionsForManage();
  const name = normalizeText(input.name) || '新机器人';
  const candidate = normalizeBotDefinition({
    ...input,
    id: normalizeText(input.id) || slugify(name),
    name,
    slug: normalizeText(input.slug) || slugify(name),
    enabled: input.enabled !== false,
    isDefault: input.isDefault === true,
    channelBindings: Array.isArray(input.channelBindings) ? input.channelBindings : [{ channel: 'web', enabled: true }],
  });
  if (current.some((item) => item.id === candidate.id)) {
    throw new Error('bot already exists');
  }
  const items = normalizeItemsForWrite([...current, candidate], candidate.isDefault ? candidate.id : '');
  const payload = {
    version: CONFIG_VERSION,
    updatedAt: new Date().toISOString(),
    items,
  } satisfies PersistedBotConfig;
  await writeConfigFile(payload);
  scheduleOpenClawMemoryCatalogSync('bot-definitions-create');
  return items.find((item) => item.id === candidate.id) || candidate;
}

export async function updateBotDefinition(botId: string, patch: Partial<BotDefinition>) {
  const current = await listBotDefinitionsForManage();
  const target = current.find((item) => item.id === botId);
  if (!target) throw new Error('bot not found');

  const nextTarget = normalizeBotDefinition({
    ...target,
    ...patch,
    id: target.id,
  }, target.id);
  const items = normalizeItemsForWrite(
    current.map((item) => (item.id === botId ? nextTarget : item)),
    nextTarget.isDefault ? nextTarget.id : '',
  );
  const payload = {
    version: CONFIG_VERSION,
    updatedAt: new Date().toISOString(),
    items,
  } satisfies PersistedBotConfig;
  await writeConfigFile(payload);
  scheduleOpenClawMemoryCatalogSync('bot-definitions-update');
  return items.find((item) => item.id === botId) || nextTarget;
}

export async function assertBotManageAccess(accessKeyCode: string) {
  const key = normalizeText(accessKeyCode);
  if (!key) throw new Error('full mode access key is required');
  const intelligence = await getIntelligenceModeStatus();
  if (intelligence.mode !== 'full') throw new Error('full mode is required');
  const verified = await verifyAccessKey(key);
  if (!verified) throw new Error('invalid access key');
  return verified;
}
