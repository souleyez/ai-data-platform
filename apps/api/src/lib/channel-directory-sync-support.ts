import type { ChannelDirectorySource } from './channel-directory-sources.js';
import type {
  ChannelDirectorySnapshot,
  ChannelDirectorySnapshotGroup,
  ChannelDirectorySnapshotMembership,
  ChannelDirectorySnapshotUser,
  ChannelDirectorySyncState,
  ChannelDirectorySyncStatusRecord,
} from './channel-directory-sync-types.js';

export function normalizeChannelDirectoryText(value: unknown) {
  return String(value || '').trim();
}

export function normalizeChannelDirectoryTimestamp(value: unknown) {
  const text = normalizeChannelDirectoryText(value);
  if (!text) return '';
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : '';
}

export function normalizeChannelDirectoryCount(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

export function normalizeChannelDirectoryDuration(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

export function sanitizeChannelDirectorySourceId(sourceId: string) {
  return normalizeChannelDirectoryText(sourceId)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'directory-source';
}

function getValueAtPath(input: unknown, pathText: string) {
  const normalizedPath = normalizeChannelDirectoryText(pathText);
  if (!normalizedPath) return input;
  const segments = normalizedPath.split('.').map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = input;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function isChannelDirectoryRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSnapshotEntity(
  item: unknown,
  idField: string,
  nameField: string,
) {
  if (!isChannelDirectoryRecord(item)) return null;
  const id = normalizeChannelDirectoryText(getValueAtPath(item, idField));
  if (!id) return null;
  const name = normalizeChannelDirectoryText(getValueAtPath(item, nameField)) || id;
  return { id, name };
}

function normalizeMembership(
  item: unknown,
  userIdField: string,
  groupIdField: string,
) {
  if (!isChannelDirectoryRecord(item)) return null;
  const userId = normalizeChannelDirectoryText(getValueAtPath(item, userIdField));
  const groupId = normalizeChannelDirectoryText(getValueAtPath(item, groupIdField));
  if (!userId || !groupId) return null;
  return { userId, groupId };
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const deduped = new Map<string, T>();
  for (const item of items) {
    if (!deduped.has(item.id)) deduped.set(item.id, item);
  }
  return [...deduped.values()];
}

function uniqueMemberships(items: ChannelDirectorySnapshotMembership[]) {
  const deduped = new Map<string, ChannelDirectorySnapshotMembership>();
  for (const item of items) {
    const key = `${item.userId}::${item.groupId}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }
  return [...deduped.values()];
}

function sortNamedEntities<T extends { id: string; name: string }>(items: T[]) {
  return [...items].sort((left, right) => (
    left.name.localeCompare(right.name, 'zh-CN')
    || left.id.localeCompare(right.id, 'zh-CN')
  ));
}

function sortMemberships(items: ChannelDirectorySnapshotMembership[]) {
  return [...items].sort((left, right) => (
    left.userId.localeCompare(right.userId, 'zh-CN')
    || left.groupId.localeCompare(right.groupId, 'zh-CN')
  ));
}

function mapArrayAtPath(input: unknown, pathText: string, label: string) {
  const value = getValueAtPath(input, pathText);
  if (!Array.isArray(value)) {
    throw new Error(`${label} path did not resolve to an array`);
  }
  return value;
}

export function normalizeChannelDirectorySnapshot(raw: unknown, fallbackSourceId = ''): ChannelDirectorySnapshot | null {
  if (!isChannelDirectoryRecord(raw)) return null;
  const sourceId = normalizeChannelDirectoryText(raw.sourceId) || fallbackSourceId;
  if (!sourceId) return null;
  return {
    sourceId,
    syncedAt: normalizeChannelDirectoryTimestamp(raw.syncedAt) || '',
    users: Array.isArray(raw.users)
      ? sortNamedEntities(uniqueById(
          raw.users
            .map((item) => normalizeSnapshotEntity(item, 'id', 'name'))
            .filter((item): item is ChannelDirectorySnapshotUser => Boolean(item)),
        ))
      : [],
    groups: Array.isArray(raw.groups)
      ? sortNamedEntities(uniqueById(
          raw.groups
            .map((item) => normalizeSnapshotEntity(item, 'id', 'name'))
            .filter((item): item is ChannelDirectorySnapshotGroup => Boolean(item)),
        ))
      : [],
    memberships: Array.isArray(raw.memberships)
      ? sortMemberships(uniqueMemberships(
          raw.memberships
            .map((item) => normalizeMembership(item, 'userId', 'groupId'))
            .filter((item): item is ChannelDirectorySnapshotMembership => Boolean(item)),
        ))
      : [],
  };
}

export function normalizeChannelDirectorySyncStatusRecord(
  raw: unknown,
  fallbackSourceId = '',
): ChannelDirectorySyncStatusRecord | null {
  if (!isChannelDirectoryRecord(raw)) return null;
  const sourceId = normalizeChannelDirectoryText(raw.sourceId) || fallbackSourceId;
  if (!sourceId) return null;
  const statusText = normalizeChannelDirectoryText(raw.status).toLowerCase();
  const status: ChannelDirectorySyncState =
    statusText === 'running'
      ? 'running'
      : (statusText === 'success'
        ? 'success'
        : (statusText === 'error' ? 'error' : 'idle'));
  return {
    sourceId,
    status,
    lastSyncAt: normalizeChannelDirectoryTimestamp(raw.lastSyncAt) || '',
    lastFinishedAt: normalizeChannelDirectoryTimestamp(raw.lastFinishedAt) || '',
    lastMessage: normalizeChannelDirectoryText(raw.lastMessage),
    lastDurationMs: normalizeChannelDirectoryDuration(raw.lastDurationMs),
    userCount: normalizeChannelDirectoryCount(raw.userCount),
    groupCount: normalizeChannelDirectoryCount(raw.groupCount),
    membershipCount: normalizeChannelDirectoryCount(raw.membershipCount),
    updatedAt: normalizeChannelDirectoryTimestamp(raw.updatedAt) || new Date().toISOString(),
  };
}

export function buildChannelDirectorySnapshotFromPayload(source: ChannelDirectorySource, body: unknown): ChannelDirectorySnapshot {
  const usersRaw = mapArrayAtPath(body, source.responseMapping.usersPath, 'users');
  const groupsRaw = mapArrayAtPath(body, source.responseMapping.groupsPath, 'groups');
  const membershipsRaw = mapArrayAtPath(body, source.responseMapping.membershipsPath, 'memberships');
  const syncedAt = new Date().toISOString();

  return {
    sourceId: source.id,
    syncedAt,
    users: sortNamedEntities(uniqueById(
      usersRaw
        .map((item) => normalizeSnapshotEntity(item, source.fieldMapping.userIdField, source.fieldMapping.userNameField))
        .filter((item): item is ChannelDirectorySnapshotUser => Boolean(item)),
    )),
    groups: sortNamedEntities(uniqueById(
      groupsRaw
        .map((item) => normalizeSnapshotEntity(item, source.fieldMapping.groupIdField, source.fieldMapping.groupNameField))
        .filter((item): item is ChannelDirectorySnapshotGroup => Boolean(item)),
    )),
    memberships: sortMemberships(uniqueMemberships(
      membershipsRaw
        .map((item) => normalizeMembership(item, source.fieldMapping.membershipUserIdField, source.fieldMapping.membershipGroupIdField))
        .filter((item): item is ChannelDirectorySnapshotMembership => Boolean(item)),
    )),
  };
}
