import type { BotChannel, BotDefinition } from './bot-definitions.js';
import { buildVisibleLibraryKeySetFromBot } from './bot-visibility.js';
import { resolveChannelDirectorySource } from './channel-directory-sources.js';
import { readChannelDirectorySnapshot, type ChannelDirectorySnapshotGroup, type ChannelDirectorySnapshotUser } from './channel-directory-sync.js';
import { getSubjectAssignedLibraryKeys } from './channel-user-access-policies.js';
import { loadDocumentLibraries } from './document-libraries.js';

export type ChannelAccessDenyReason =
  | ''
  | 'missing_sender_id'
  | 'directory_snapshot_unavailable'
  | 'sender_not_found'
  | 'no_assignment'
  | 'bot_scope_excludes_assignment';

export type ResolvedChannelAccess = {
  source: 'bot-only' | 'external-directory';
  channel: BotChannel;
  botId: string;
  directorySourceId: string;
  senderId: string;
  senderName: string;
  matchedUser: ChannelDirectorySnapshotUser | null;
  matchedGroups: ChannelDirectorySnapshotGroup[];
  botVisibleLibraryKeys: string[];
  assignedLibraryKeys: string[];
  effectiveVisibleLibraryKeys: string[];
  denyReason: ChannelAccessDenyReason;
  isDenied: boolean;
};

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function intersectLibraryKeys(keys: string[], visibleSet: Set<string>) {
  const items: string[] = [];
  for (const key of keys) {
    const normalized = normalizeText(key);
    if (!normalized || !visibleSet.has(normalized) || items.includes(normalized)) continue;
    items.push(normalized);
  }
  return items;
}

function buildDeniedResult(input: {
  source: ResolvedChannelAccess['source'];
  channel: BotChannel;
  botId: string;
  directorySourceId?: string;
  senderId?: string;
  senderName?: string;
  matchedUser?: ChannelDirectorySnapshotUser | null;
  matchedGroups?: ChannelDirectorySnapshotGroup[];
  botVisibleLibraryKeys: string[];
  assignedLibraryKeys?: string[];
  denyReason: ChannelAccessDenyReason;
}) {
  return {
    source: input.source,
    channel: input.channel,
    botId: input.botId,
    directorySourceId: normalizeText(input.directorySourceId),
    senderId: normalizeText(input.senderId),
    senderName: normalizeText(input.senderName),
    matchedUser: input.matchedUser || null,
    matchedGroups: input.matchedGroups || [],
    botVisibleLibraryKeys: input.botVisibleLibraryKeys,
    assignedLibraryKeys: input.assignedLibraryKeys || [],
    effectiveVisibleLibraryKeys: [],
    denyReason: input.denyReason,
    isDenied: true,
  } satisfies ResolvedChannelAccess;
}

export async function resolveChannelAccessContext(input: {
  bot: BotDefinition;
  channel: BotChannel;
  senderId?: string;
  senderName?: string;
  routeKey?: string;
  tenantId?: string;
  externalBotId?: string;
}) {
  const libraries = await loadDocumentLibraries();
  const botVisibleLibraryKeys = [...buildVisibleLibraryKeySetFromBot(input.bot, libraries)];
  const botVisibleLibrarySet = new Set(botVisibleLibraryKeys);
  const directorySource = await resolveChannelDirectorySource(input.bot, input.channel, {
    routeKey: normalizeText(input.routeKey) || undefined,
    tenantId: normalizeText(input.tenantId) || undefined,
    externalBotId: normalizeText(input.externalBotId) || undefined,
  });

  if (!directorySource) {
    return {
      source: 'bot-only',
      channel: input.channel,
      botId: input.bot.id,
      directorySourceId: '',
      senderId: normalizeText(input.senderId),
      senderName: normalizeText(input.senderName),
      matchedUser: null,
      matchedGroups: [],
      botVisibleLibraryKeys,
      assignedLibraryKeys: [],
      effectiveVisibleLibraryKeys: botVisibleLibraryKeys,
      denyReason: '',
      isDenied: false,
    } satisfies ResolvedChannelAccess;
  }

  const senderId = normalizeText(input.senderId);
  if (!senderId) {
    return buildDeniedResult({
      source: 'external-directory',
      channel: input.channel,
      botId: input.bot.id,
      directorySourceId: directorySource.id,
      senderName: input.senderName,
      botVisibleLibraryKeys,
      denyReason: 'missing_sender_id',
    });
  }

  const snapshot = await readChannelDirectorySnapshot(directorySource.id);
  if (!snapshot) {
    return buildDeniedResult({
      source: 'external-directory',
      channel: input.channel,
      botId: input.bot.id,
      directorySourceId: directorySource.id,
      senderId,
      senderName: input.senderName,
      botVisibleLibraryKeys,
      denyReason: 'directory_snapshot_unavailable',
    });
  }

  const matchedUser = snapshot.users.find((item) => item.id === senderId) || null;
  if (!matchedUser) {
    return buildDeniedResult({
      source: 'external-directory',
      channel: input.channel,
      botId: input.bot.id,
      directorySourceId: directorySource.id,
      senderId,
      senderName: input.senderName,
      botVisibleLibraryKeys,
      denyReason: 'sender_not_found',
    });
  }

  const matchedGroupIdSet = new Set(
    snapshot.memberships
      .filter((membership) => membership.userId === matchedUser.id)
      .map((membership) => membership.groupId),
  );
  const matchedGroups = snapshot.groups.filter((group) => matchedGroupIdSet.has(group.id));
  const matchedGroupIds = matchedGroups.map((group) => group.id);
  const assignedLibraryKeys = await getSubjectAssignedLibraryKeys(directorySource.id, matchedUser.id, matchedGroupIds);
  if (!assignedLibraryKeys.length) {
    return buildDeniedResult({
      source: 'external-directory',
      channel: input.channel,
      botId: input.bot.id,
      directorySourceId: directorySource.id,
      senderId,
      senderName: input.senderName,
      matchedUser,
      matchedGroups,
      botVisibleLibraryKeys,
      denyReason: 'no_assignment',
    });
  }

  const effectiveVisibleLibraryKeys = intersectLibraryKeys(assignedLibraryKeys, botVisibleLibrarySet);
  if (!effectiveVisibleLibraryKeys.length) {
    return buildDeniedResult({
      source: 'external-directory',
      channel: input.channel,
      botId: input.bot.id,
      directorySourceId: directorySource.id,
      senderId,
      senderName: input.senderName,
      matchedUser,
      matchedGroups,
      botVisibleLibraryKeys,
      assignedLibraryKeys,
      denyReason: 'bot_scope_excludes_assignment',
    });
  }

  return {
    source: 'external-directory',
    channel: input.channel,
    botId: input.bot.id,
    directorySourceId: directorySource.id,
    senderId,
    senderName: normalizeText(input.senderName),
    matchedUser,
    matchedGroups,
    botVisibleLibraryKeys,
    assignedLibraryKeys,
    effectiveVisibleLibraryKeys,
    denyReason: '',
    isDenied: false,
  } satisfies ResolvedChannelAccess;
}
