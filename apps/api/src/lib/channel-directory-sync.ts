import path from 'node:path';
import { getChannelDirectorySource, type ChannelDirectorySource } from './channel-directory-sources.js';
import { fetchChannelDirectoryPayload } from './channel-directory-http-client.js';
import { STORAGE_CONFIG_DIR } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

export type ChannelDirectorySnapshotUser = {
  id: string;
  name: string;
};

export type ChannelDirectorySnapshotGroup = {
  id: string;
  name: string;
};

export type ChannelDirectorySnapshotMembership = {
  userId: string;
  groupId: string;
};

export type ChannelDirectorySnapshot = {
  sourceId: string;
  syncedAt: string;
  users: ChannelDirectorySnapshotUser[];
  groups: ChannelDirectorySnapshotGroup[];
  memberships: ChannelDirectorySnapshotMembership[];
};

export type ChannelDirectorySyncState = 'idle' | 'running' | 'success' | 'error';

export type ChannelDirectorySyncStatusRecord = {
  sourceId: string;
  status: ChannelDirectorySyncState;
  lastSyncAt: string;
  lastFinishedAt: string;
  lastMessage: string;
  lastDurationMs: number;
  userCount: number;
  groupCount: number;
  membershipCount: number;
  updatedAt: string;
};

type ChannelDirectorySyncStatusPayload = {
  updatedAt: string;
  items: ChannelDirectorySyncStatusRecord[];
};

const CHANNEL_DIRECTORY_CACHE_DIR = path.join(STORAGE_CONFIG_DIR, 'channel-directory-cache');
const CHANNEL_DIRECTORY_SYNC_STATUS_FILE = path.join(STORAGE_CONFIG_DIR, 'channel-directory-sync-status.json');

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeTimestamp(value: unknown) {
  const text = normalizeText(value);
  if (!text) return '';
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : '';
}

function normalizeCount(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function normalizeDuration(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

function sanitizeSourceId(sourceId: string) {
  return normalizeText(sourceId)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'directory-source';
}

function buildSnapshotFilePath(sourceId: string) {
  return path.join(CHANNEL_DIRECTORY_CACHE_DIR, `${sanitizeSourceId(sourceId)}.json`);
}

function getValueAtPath(input: unknown, pathText: string) {
  const normalizedPath = normalizeText(pathText);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSnapshotEntity(
  item: unknown,
  idField: string,
  nameField: string,
) {
  if (!isRecord(item)) return null;
  const id = normalizeText(getValueAtPath(item, idField));
  if (!id) return null;
  const name = normalizeText(getValueAtPath(item, nameField)) || id;
  return { id, name };
}

function normalizeMembership(
  item: unknown,
  userIdField: string,
  groupIdField: string,
) {
  if (!isRecord(item)) return null;
  const userId = normalizeText(getValueAtPath(item, userIdField));
  const groupId = normalizeText(getValueAtPath(item, groupIdField));
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

function normalizeSnapshot(raw: unknown, fallbackSourceId = ''): ChannelDirectorySnapshot | null {
  if (!isRecord(raw)) return null;
  const sourceId = normalizeText(raw.sourceId) || fallbackSourceId;
  if (!sourceId) return null;
  return {
    sourceId,
    syncedAt: normalizeTimestamp(raw.syncedAt) || '',
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

function normalizeStatusRecord(
  raw: unknown,
  fallbackSourceId = '',
): ChannelDirectorySyncStatusRecord | null {
  if (!isRecord(raw)) return null;
  const sourceId = normalizeText(raw.sourceId) || fallbackSourceId;
  if (!sourceId) return null;
  const statusText = normalizeText(raw.status).toLowerCase();
  const status: ChannelDirectorySyncState =
    statusText === 'running'
      ? 'running'
      : (statusText === 'success'
        ? 'success'
        : (statusText === 'error' ? 'error' : 'idle'));
  return {
    sourceId,
    status,
    lastSyncAt: normalizeTimestamp(raw.lastSyncAt) || '',
    lastFinishedAt: normalizeTimestamp(raw.lastFinishedAt) || '',
    lastMessage: normalizeText(raw.lastMessage),
    lastDurationMs: normalizeDuration(raw.lastDurationMs),
    userCount: normalizeCount(raw.userCount),
    groupCount: normalizeCount(raw.groupCount),
    membershipCount: normalizeCount(raw.membershipCount),
    updatedAt: normalizeTimestamp(raw.updatedAt) || new Date().toISOString(),
  };
}

async function readSyncStatusPayload(): Promise<ChannelDirectorySyncStatusPayload> {
  const { data } = await readRuntimeStateJson<ChannelDirectorySyncStatusPayload>({
    filePath: CHANNEL_DIRECTORY_SYNC_STATUS_FILE,
    fallback: {
      updatedAt: new Date().toISOString(),
      items: [],
    },
    normalize: (raw) => {
      if (!isRecord(raw)) {
        return {
          updatedAt: new Date().toISOString(),
          items: [],
        };
      }
      return {
        updatedAt: normalizeTimestamp(raw.updatedAt) || new Date().toISOString(),
        items: Array.isArray(raw.items)
          ? raw.items
              .map((item) => normalizeStatusRecord(item))
              .filter((item): item is ChannelDirectorySyncStatusRecord => Boolean(item))
          : [],
      };
    },
  });
  return data;
}

async function writeSyncStatusPayload(payload: ChannelDirectorySyncStatusPayload) {
  await writeRuntimeStateJson({
    filePath: CHANNEL_DIRECTORY_SYNC_STATUS_FILE,
    payload,
  });
}

async function upsertSyncStatus(
  sourceId: string,
  patch: Partial<ChannelDirectorySyncStatusRecord>,
) {
  const normalizedSourceId = normalizeText(sourceId);
  const payload = await readSyncStatusPayload();
  const current = payload.items.find((item) => item.sourceId === normalizedSourceId) || null;
  const next = normalizeStatusRecord({
    ...(current || {}),
    ...patch,
    sourceId: normalizedSourceId,
    updatedAt: new Date().toISOString(),
  }, normalizedSourceId);
  if (!next) {
    throw new Error('failed to normalize directory sync status');
  }
  const items = current
    ? payload.items.map((item) => (item.sourceId === normalizedSourceId ? next : item))
    : [...payload.items, next];
  await writeSyncStatusPayload({
    updatedAt: new Date().toISOString(),
    items: items.sort((left, right) => left.sourceId.localeCompare(right.sourceId, 'zh-CN')),
  });
  return next;
}

function buildSnapshotFromPayload(source: ChannelDirectorySource, body: unknown): ChannelDirectorySnapshot {
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

async function writeSnapshot(snapshot: ChannelDirectorySnapshot) {
  await writeRuntimeStateJson({
    filePath: buildSnapshotFilePath(snapshot.sourceId),
    payload: snapshot,
  });
}

async function readSnapshotCounts(sourceId: string) {
  const snapshot = await readChannelDirectorySnapshot(sourceId);
  return {
    userCount: snapshot?.users.length || 0,
    groupCount: snapshot?.groups.length || 0,
    membershipCount: snapshot?.memberships.length || 0,
  };
}

export async function listChannelDirectorySyncStatuses() {
  const payload = await readSyncStatusPayload();
  return payload.items.sort((left, right) => left.sourceId.localeCompare(right.sourceId, 'zh-CN'));
}

export async function getChannelDirectorySyncStatus(sourceId: string) {
  const normalizedSourceId = normalizeText(sourceId);
  if (!normalizedSourceId) return null;
  const items = await listChannelDirectorySyncStatuses();
  return items.find((item) => item.sourceId === normalizedSourceId) || null;
}

export async function readChannelDirectorySnapshot(sourceId: string) {
  const normalizedSourceId = normalizeText(sourceId);
  if (!normalizedSourceId) return null;
  const { data } = await readRuntimeStateJson<ChannelDirectorySnapshot | null>({
    filePath: buildSnapshotFilePath(normalizedSourceId),
    fallback: null,
    normalize: (raw) => normalizeSnapshot(raw, normalizedSourceId),
  });
  return data;
}

export async function runChannelDirectorySync(sourceId: string) {
  const normalizedSourceId = normalizeText(sourceId);
  if (!normalizedSourceId) throw new Error('sourceId is required');
  const source = await getChannelDirectorySource(normalizedSourceId);
  if (!source) throw new Error('directory source not found');
  if (!source.request.url) throw new Error('directory source url is required');

  const startedAt = Date.now();
  await upsertSyncStatus(normalizedSourceId, {
    status: 'running',
    lastMessage: 'syncing directory source',
  });

  try {
    const response = await fetchChannelDirectoryPayload(source);
    const snapshot = buildSnapshotFromPayload(source, response.body);
    await writeSnapshot(snapshot);
    const status = await upsertSyncStatus(normalizedSourceId, {
      status: 'success',
      lastSyncAt: snapshot.syncedAt,
      lastFinishedAt: new Date().toISOString(),
      lastDurationMs: Date.now() - startedAt,
      userCount: snapshot.users.length,
      groupCount: snapshot.groups.length,
      membershipCount: snapshot.memberships.length,
      lastMessage: `synced ${snapshot.users.length} users, ${snapshot.groups.length} groups, ${snapshot.memberships.length} memberships`,
    });
    return {
      source,
      snapshot,
      status,
      response,
    };
  } catch (error) {
    const fallbackCounts = await readSnapshotCounts(normalizedSourceId);
    const message = error instanceof Error ? error.message : 'directory sync failed';
    const status = await upsertSyncStatus(normalizedSourceId, {
      status: 'error',
      lastFinishedAt: new Date().toISOString(),
      lastDurationMs: Date.now() - startedAt,
      userCount: fallbackCounts.userCount,
      groupCount: fallbackCounts.groupCount,
      membershipCount: fallbackCounts.membershipCount,
      lastMessage: message.slice(0, 240),
    });
    throw Object.assign(new Error(message), { status });
  }
}
