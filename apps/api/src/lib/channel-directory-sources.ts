import path from 'node:path';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';
import { STORAGE_CONFIG_DIR } from './paths.js';
import type { BotChannel, BotDefinition } from './bot-definitions.js';

export type ChannelDirectorySourceType = 'http-json';
export type ChannelDirectorySyncMode = 'manual' | 'interval';
export type ChannelDirectorySyncStatus = 'idle' | 'success' | 'error';

export type ChannelDirectorySource = {
  id: string;
  botId: string;
  channel: Exclude<BotChannel, 'web'>;
  routeKey?: string;
  tenantId?: string;
  externalBotId?: string;
  enabled: boolean;
  sourceType: ChannelDirectorySourceType;
  request: {
    url: string;
    method: 'GET' | 'POST';
    headers: Array<{ key: string; value: string; secret: boolean }>;
    bodyTemplate?: string;
    timeoutMs?: number;
  };
  fieldMapping: {
    userIdField: string;
    userNameField: string;
    groupIdField: string;
    groupNameField: string;
    membershipUserIdField: string;
    membershipGroupIdField: string;
  };
  responseMapping: {
    usersPath: string;
    groupsPath: string;
    membershipsPath: string;
  };
  sync: {
    mode: ChannelDirectorySyncMode;
    intervalMinutes?: number;
  };
  lastSyncAt?: string;
  lastSyncStatus?: ChannelDirectorySyncStatus;
  lastSyncMessage?: string;
  updatedAt: string;
};

type ChannelDirectorySourcePayload = {
  items: ChannelDirectorySource[];
};

const STORAGE_FILE = path.join(STORAGE_CONFIG_DIR, 'channel-directory-sources.json');

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeTimestamp(value: unknown) {
  const text = normalizeText(value);
  if (!text) return '';
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : '';
}

function slugify(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `directory-source-${Date.now()}`;
}

function normalizeChannel(value: unknown): Exclude<BotChannel, 'web'> {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'wecom' || normalized === 'teams' || normalized === 'qq' || normalized === 'feishu') {
    return normalized;
  }
  return 'wecom';
}

function normalizeRequestMethod(value: unknown) {
  return normalizeText(value).toUpperCase() === 'POST' ? 'POST' : 'GET';
}

function normalizeIntervalMinutes(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  const rounded = Math.max(5, Math.floor(numeric));
  return rounded;
}

function normalizeSource(input: Partial<ChannelDirectorySource> & Pick<ChannelDirectorySource, 'botId' | 'channel'>) {
  const request = input.request && typeof input.request === 'object'
    ? input.request as Partial<ChannelDirectorySource['request']>
    : {};
  const fieldMapping = input.fieldMapping && typeof input.fieldMapping === 'object'
    ? input.fieldMapping as Partial<ChannelDirectorySource['fieldMapping']>
    : {};
  const responseMapping = input.responseMapping && typeof input.responseMapping === 'object'
    ? input.responseMapping as Partial<ChannelDirectorySource['responseMapping']>
    : {};
  const sync = input.sync && typeof input.sync === 'object'
    ? input.sync as Partial<ChannelDirectorySource['sync']>
    : {};
  const id = normalizeText(input.id) || slugify(`${input.botId}-${input.channel}-directory`);
  const timeoutMs = Number(request.timeoutMs);

  return {
    id,
    botId: normalizeText(input.botId),
    channel: normalizeChannel(input.channel),
    routeKey: normalizeText(input.routeKey) || undefined,
    tenantId: normalizeText(input.tenantId) || undefined,
    externalBotId: normalizeText(input.externalBotId) || undefined,
    enabled: input.enabled !== false,
    sourceType: 'http-json',
    request: {
      url: normalizeText(request.url),
      method: normalizeRequestMethod(request.method),
      headers: Array.isArray(request.headers)
        ? request.headers
            .map((item: unknown) => ({
              key: normalizeText((item as { key?: unknown })?.key),
              value: String((item as { value?: unknown })?.value || ''),
              secret: (item as { secret?: unknown })?.secret === true,
            }))
            .filter((item) => item.key)
        : [],
      bodyTemplate: normalizeText(request.bodyTemplate) || undefined,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.max(1000, Math.floor(timeoutMs)) : undefined,
    },
    fieldMapping: {
      userIdField: normalizeText(fieldMapping.userIdField) || 'id',
      userNameField: normalizeText(fieldMapping.userNameField) || 'name',
      groupIdField: normalizeText(fieldMapping.groupIdField) || 'id',
      groupNameField: normalizeText(fieldMapping.groupNameField) || 'name',
      membershipUserIdField: normalizeText(fieldMapping.membershipUserIdField) || 'userId',
      membershipGroupIdField: normalizeText(fieldMapping.membershipGroupIdField) || 'groupId',
    },
    responseMapping: {
      usersPath: normalizeText(responseMapping.usersPath) || 'users',
      groupsPath: normalizeText(responseMapping.groupsPath) || 'groups',
      membershipsPath: normalizeText(responseMapping.membershipsPath) || 'memberships',
    },
    sync: {
      mode: normalizeText(sync.mode).toLowerCase() === 'interval' ? 'interval' : 'manual',
      intervalMinutes: normalizeText(sync.mode).toLowerCase() === 'interval'
        ? normalizeIntervalMinutes(sync.intervalMinutes) || 60
        : undefined,
    },
    lastSyncAt: normalizeTimestamp(input.lastSyncAt) || undefined,
    lastSyncStatus: normalizeText(input.lastSyncStatus).toLowerCase() === 'success'
      ? 'success'
      : (normalizeText(input.lastSyncStatus).toLowerCase() === 'error' ? 'error' : 'idle'),
    lastSyncMessage: normalizeText(input.lastSyncMessage) || undefined,
    updatedAt: normalizeTimestamp(input.updatedAt) || new Date().toISOString(),
  } satisfies ChannelDirectorySource;
}

async function readPayload() {
  const { data } = await readRuntimeStateJson<ChannelDirectorySourcePayload>({
    filePath: STORAGE_FILE,
    fallback: { items: [] },
    normalize: (parsed) => {
      if (!parsed || typeof parsed !== 'object') return { items: [] };
      const items = Array.isArray((parsed as { items?: unknown[] }).items)
        ? (parsed as { items: unknown[] }).items.map((item) => normalizeSource((item || {}) as Partial<ChannelDirectorySource> & Pick<ChannelDirectorySource, 'botId' | 'channel'>))
        : [];
      return { items };
    },
  });
  return data;
}

async function writePayload(items: ChannelDirectorySource[]) {
  await writeRuntimeStateJson({
    filePath: STORAGE_FILE,
    payload: {
      items,
    },
  });
}

function matchesRouteContext(source: ChannelDirectorySource, routeContext?: {
  routeKey?: string;
  tenantId?: string;
  externalBotId?: string;
}) {
  if (!routeContext) return true;
  if (source.routeKey && normalizeText(routeContext.routeKey) && source.routeKey !== normalizeText(routeContext.routeKey)) return false;
  if (source.tenantId && normalizeText(routeContext.tenantId) && source.tenantId !== normalizeText(routeContext.tenantId)) return false;
  if (source.externalBotId && normalizeText(routeContext.externalBotId) && source.externalBotId !== normalizeText(routeContext.externalBotId)) return false;
  return true;
}

export async function listChannelDirectorySources() {
  const payload = await readPayload();
  return payload.items.sort((left, right) => (
    left.channel.localeCompare(right.channel, 'zh-CN')
    || left.id.localeCompare(right.id, 'zh-CN')
  ));
}

export async function listChannelDirectorySourcesForBot(botId: string) {
  const normalizedBotId = normalizeText(botId);
  const items = await listChannelDirectorySources();
  return items.filter((item) => item.botId === normalizedBotId);
}

export async function getChannelDirectorySource(sourceId: string) {
  const normalizedSourceId = normalizeText(sourceId);
  if (!normalizedSourceId) return null;
  const items = await listChannelDirectorySources();
  return items.find((item) => item.id === normalizedSourceId) || null;
}

export async function createChannelDirectorySource(input: Partial<ChannelDirectorySource> & Pick<ChannelDirectorySource, 'botId' | 'channel'>) {
  const current = await listChannelDirectorySources();
  const nextItem = normalizeSource(input);
  if (!nextItem.botId) throw new Error('botId is required');
  if (!nextItem.request.url) throw new Error('directory source url is required');
  if (current.some((item) => item.id === nextItem.id)) throw new Error('directory source already exists');
  await writePayload([...current, nextItem]);
  return nextItem;
}

export async function updateChannelDirectorySource(sourceId: string, patch: Partial<ChannelDirectorySource>) {
  const normalizedSourceId = normalizeText(sourceId);
  const current = await listChannelDirectorySources();
  const target = current.find((item) => item.id === normalizedSourceId);
  if (!target) throw new Error('directory source not found');
  const nextItem = normalizeSource({
    ...target,
    ...patch,
    id: target.id,
    botId: target.botId,
    channel: target.channel,
    updatedAt: new Date().toISOString(),
  });
  const nextItems = current.map((item) => (item.id === normalizedSourceId ? nextItem : item));
  await writePayload(nextItems);
  return nextItem;
}

export async function resolveChannelDirectorySource(
  bot: BotDefinition | null | undefined,
  channel: BotChannel,
  routeContext?: {
    routeKey?: string;
    tenantId?: string;
    externalBotId?: string;
  },
) {
  if (!bot?.enabled || channel === 'web') return null;
  const binding = bot.channelBindings.find((item) => item.channel === channel && item.enabled);
  if (!binding?.directorySourceId) return null;
  const source = await getChannelDirectorySource(binding.directorySourceId);
  if (!source || !source.enabled) return null;
  if (source.botId !== bot.id || source.channel !== channel) return null;
  if (!matchesRouteContext(source, routeContext)) return null;
  return source;
}
