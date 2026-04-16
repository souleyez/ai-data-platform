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

export type ChannelDirectorySyncStatusPayload = {
  updatedAt: string;
  items: ChannelDirectorySyncStatusRecord[];
};
