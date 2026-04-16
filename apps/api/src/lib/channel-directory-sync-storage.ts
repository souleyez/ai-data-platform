import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';
import {
  normalizeChannelDirectorySnapshot,
  normalizeChannelDirectoryTimestamp,
  normalizeChannelDirectorySyncStatusRecord,
  normalizeChannelDirectoryText,
  sanitizeChannelDirectorySourceId,
} from './channel-directory-sync-support.js';
import type {
  ChannelDirectorySnapshot,
  ChannelDirectorySyncStatusPayload,
  ChannelDirectorySyncStatusRecord,
} from './channel-directory-sync-types.js';

const CHANNEL_DIRECTORY_CACHE_DIR = path.join(STORAGE_CONFIG_DIR, 'channel-directory-cache');
const CHANNEL_DIRECTORY_SYNC_STATUS_FILE = path.join(STORAGE_CONFIG_DIR, 'channel-directory-sync-status.json');

function buildSnapshotFilePath(sourceId: string) {
  return path.join(CHANNEL_DIRECTORY_CACHE_DIR, `${sanitizeChannelDirectorySourceId(sourceId)}.json`);
}

async function readSyncStatusPayload(): Promise<ChannelDirectorySyncStatusPayload> {
  const { data } = await readRuntimeStateJson<ChannelDirectorySyncStatusPayload>({
    filePath: CHANNEL_DIRECTORY_SYNC_STATUS_FILE,
    fallback: {
      updatedAt: new Date().toISOString(),
      items: [],
    },
    normalize: (raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
          updatedAt: new Date().toISOString(),
          items: [],
        };
      }
      const record = raw as Record<string, unknown>;
      return {
        updatedAt: normalizeChannelDirectoryTimestamp(record.updatedAt) || new Date().toISOString(),
        items: Array.isArray(record.items)
          ? record.items
              .map((item) => normalizeChannelDirectorySyncStatusRecord(item))
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

export async function upsertChannelDirectorySyncStatus(
  sourceId: string,
  patch: Partial<ChannelDirectorySyncStatusRecord>,
) {
  const normalizedSourceId = normalizeChannelDirectoryText(sourceId);
  const payload = await readSyncStatusPayload();
  const current = payload.items.find((item) => item.sourceId === normalizedSourceId) || null;
  const next = normalizeChannelDirectorySyncStatusRecord({
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

export async function listChannelDirectorySyncStatusesFromStore() {
  const payload = await readSyncStatusPayload();
  return payload.items.sort((left, right) => left.sourceId.localeCompare(right.sourceId, 'zh-CN'));
}

export async function readChannelDirectorySnapshot(sourceId: string) {
  const normalizedSourceId = normalizeChannelDirectoryText(sourceId);
  if (!normalizedSourceId) return null;
  const { data } = await readRuntimeStateJson<ChannelDirectorySnapshot | null>({
    filePath: buildSnapshotFilePath(normalizedSourceId),
    fallback: null,
    normalize: (raw) => normalizeChannelDirectorySnapshot(raw, normalizedSourceId),
  });
  return data;
}

export async function writeChannelDirectorySnapshot(snapshot: ChannelDirectorySnapshot) {
  await writeRuntimeStateJson({
    filePath: buildSnapshotFilePath(snapshot.sourceId),
    payload: snapshot,
  });
}

export async function readChannelDirectorySnapshotCounts(sourceId: string) {
  const snapshot = await readChannelDirectorySnapshot(sourceId);
  return {
    userCount: snapshot?.users.length || 0,
    groupCount: snapshot?.groups.length || 0,
    membershipCount: snapshot?.memberships.length || 0,
  };
}
