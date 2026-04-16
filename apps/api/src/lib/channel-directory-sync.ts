import { getChannelDirectorySource } from './channel-directory-sources.js';
import { fetchChannelDirectoryPayload } from './channel-directory-http-client.js';
import {
  buildChannelDirectorySnapshotFromPayload,
  normalizeChannelDirectoryText,
} from './channel-directory-sync-support.js';
import {
  listChannelDirectorySyncStatusesFromStore,
  readChannelDirectorySnapshot,
  readChannelDirectorySnapshotCounts,
  upsertChannelDirectorySyncStatus,
  writeChannelDirectorySnapshot,
} from './channel-directory-sync-storage.js';

export type {
  ChannelDirectorySnapshot,
  ChannelDirectorySnapshotGroup,
  ChannelDirectorySnapshotMembership,
  ChannelDirectorySnapshotUser,
  ChannelDirectorySyncState,
  ChannelDirectorySyncStatusPayload,
  ChannelDirectorySyncStatusRecord,
} from './channel-directory-sync-types.js';

export async function listChannelDirectorySyncStatuses() {
  return listChannelDirectorySyncStatusesFromStore();
}

export async function getChannelDirectorySyncStatus(sourceId: string) {
  const normalizedSourceId = normalizeChannelDirectoryText(sourceId);
  if (!normalizedSourceId) return null;
  const items = await listChannelDirectorySyncStatusesFromStore();
  return items.find((item) => item.sourceId === normalizedSourceId) || null;
}

export { readChannelDirectorySnapshot } from './channel-directory-sync-storage.js';

export async function runChannelDirectorySync(sourceId: string) {
  const normalizedSourceId = normalizeChannelDirectoryText(sourceId);
  if (!normalizedSourceId) throw new Error('sourceId is required');
  const source = await getChannelDirectorySource(normalizedSourceId);
  if (!source) throw new Error('directory source not found');
  if (!source.request.url) throw new Error('directory source url is required');

  const startedAt = Date.now();
  await upsertChannelDirectorySyncStatus(normalizedSourceId, {
    status: 'running',
    lastMessage: 'syncing directory source',
  });

  try {
    const response = await fetchChannelDirectoryPayload(source);
    const snapshot = buildChannelDirectorySnapshotFromPayload(source, response.body);
    await writeChannelDirectorySnapshot(snapshot);
    const status = await upsertChannelDirectorySyncStatus(normalizedSourceId, {
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
    const fallbackCounts = await readChannelDirectorySnapshotCounts(normalizedSourceId);
    const message = error instanceof Error ? error.message : 'directory sync failed';
    const status = await upsertChannelDirectorySyncStatus(normalizedSourceId, {
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
