import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CONTROL_PLANE_STATE_FILE, CONTROL_PLANE_STORAGE_DIR } from './paths.js';
import type {
  ControlPlaneDevice,
  ControlPlaneModelLease,
  ControlPlanePolicy,
  ControlPlaneRelease,
  ControlPlaneSession,
  ControlPlaneState,
  ControlPlaneUser,
} from './control-plane-schema.js';

function nowIso() {
  return new Date().toISOString();
}

function buildDefaultState(): ControlPlaneState {
  const now = nowIso();
  return {
    users: [],
    devices: [],
    releases: [],
    policies: [
      {
        id: randomUUID(),
        scopeType: 'global',
        scopeValue: '*',
        channel: 'stable',
        minSupportedVersion: '',
        targetVersion: '',
        forceUpgrade: false,
        allowSelfRegister: true,
        modelAccessMode: 'lease',
        providerScopes: ['moonshot', 'minimax'],
        createdAt: now,
        updatedAt: now,
      },
    ],
    sessions: [],
    modelProviderKeys: [],
    modelLeases: [],
    updatedAt: now,
  };
}

async function ensureStateFile() {
  await fs.mkdir(CONTROL_PLANE_STORAGE_DIR, { recursive: true });
  try {
    await fs.access(CONTROL_PLANE_STATE_FILE);
  } catch {
    await fs.writeFile(
      CONTROL_PLANE_STATE_FILE,
      `${JSON.stringify(buildDefaultState(), null, 2)}\n`,
      'utf8',
    );
  }
}

export async function readControlPlaneState(): Promise<ControlPlaneState> {
  await ensureStateFile();
  const raw = await fs.readFile(CONTROL_PLANE_STATE_FILE, 'utf8');
  return JSON.parse(raw) as ControlPlaneState;
}

export async function writeControlPlaneState(state: ControlPlaneState) {
  await fs.mkdir(path.dirname(CONTROL_PLANE_STATE_FILE), { recursive: true });
  const nextState = {
    ...state,
    updatedAt: nowIso(),
  };
  await fs.writeFile(CONTROL_PLANE_STATE_FILE, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
}

export async function mutateControlPlaneState<T>(
  mutator: (state: ControlPlaneState) => T | Promise<T>,
): Promise<T> {
  const state = await readControlPlaneState();
  const result = await mutator(state);
  await writeControlPlaneState(state);
  return result;
}

export function normalizePhone(input: string): string {
  const normalized = input.replace(/[^\d+]/g, '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.startsWith('+')) {
    return `+${normalized.slice(1).replace(/\D/g, '')}`;
  }
  return normalized.replace(/\D/g, '');
}

export function createOpaqueToken(prefix: string): string {
  const seed = createHash('sha256')
    .update(`${prefix}:${randomUUID()}:${Date.now()}`)
    .digest('hex');
  return `${prefix}_${seed.slice(0, 48)}`;
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function resolvePolicy(state: ControlPlaneState, phone: string): ControlPlanePolicy {
  const phonePolicy = state.policies.find(
    (item) => item.scopeType === 'phone' && item.scopeValue === phone,
  );
  if (phonePolicy) {
    return phonePolicy;
  }
  return state.policies.find((item) => item.scopeType === 'global') ?? buildDefaultState().policies[0];
}

export function listPublishedReleases(state: ControlPlaneState, channel: string): ControlPlaneRelease[] {
  return state.releases.filter((item) => item.channel === channel && item.status === 'published');
}

export function findUserByPhone(state: ControlPlaneState, phone: string): ControlPlaneUser | undefined {
  return state.users.find((item) => item.phone === phone);
}

export function getSessionByToken(state: ControlPlaneState, token: string): ControlPlaneSession | undefined {
  const tokenHash = hashOpaqueToken(token);
  const now = Date.now();
  return state.sessions.find((item) => (
    item.sessionTokenHash === tokenHash
    && !item.revokedAt
    && Date.parse(item.expiresAt) > now
  ));
}

export function getUserById(state: ControlPlaneState, userId: string): ControlPlaneUser | undefined {
  return state.users.find((item) => item.id === userId);
}

export function getDeviceById(state: ControlPlaneState, deviceId: string): ControlPlaneDevice | undefined {
  return state.devices.find((item) => item.id === deviceId);
}

export function upsertUser(
  state: ControlPlaneState,
  user: Partial<ControlPlaneUser> & Pick<ControlPlaneUser, 'phone' | 'status' | 'source'>,
): ControlPlaneUser {
  const now = nowIso();
  const existing = state.users.find((item) => item.phone === user.phone);
  if (existing) {
    existing.status = user.status;
    existing.source = user.source;
    existing.note = user.note ?? existing.note;
    existing.updatedAt = now;
    return existing;
  }

  const created: ControlPlaneUser = {
    id: user.id ?? randomUUID(),
    phone: user.phone,
    status: user.status,
    source: user.source,
    note: user.note ?? '',
    createdAt: now,
    updatedAt: now,
  };
  state.users.push(created);
  return created;
}

export function upsertDevice(
  state: ControlPlaneState,
  input: Omit<ControlPlaneDevice, 'id' | 'createdAt' | 'updatedAt' | 'lastSeenAt'> & { id?: string },
): ControlPlaneDevice {
  const now = nowIso();
  const existing = state.devices.find(
    (item) => item.userId === input.userId && item.deviceFingerprint === input.deviceFingerprint,
  );
  if (existing) {
    existing.deviceName = input.deviceName;
    existing.osFamily = input.osFamily;
    existing.osVersion = input.osVersion;
    existing.clientVersion = input.clientVersion;
    existing.openclawVersion = input.openclawVersion;
    existing.lastIp = input.lastIp;
    existing.lastSeenAt = now;
    existing.updatedAt = now;
    return existing;
  }

  const created: ControlPlaneDevice = {
    id: input.id ?? randomUUID(),
    userId: input.userId,
    deviceFingerprint: input.deviceFingerprint,
    deviceName: input.deviceName,
    osFamily: input.osFamily,
    osVersion: input.osVersion,
    clientVersion: input.clientVersion,
    openclawVersion: input.openclawVersion,
    lastIp: input.lastIp,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  };
  state.devices.push(created);
  return created;
}

export function createSession(state: ControlPlaneState, userId: string, deviceId: string) {
  const now = Date.now();
  const expiresAt = new Date(now + 8 * 60 * 60 * 1000).toISOString();
  const token = createOpaqueToken('sess');
  const session: ControlPlaneSession = {
    id: randomUUID(),
    userId,
    deviceId,
    sessionTokenHash: hashOpaqueToken(token),
    expiresAt,
    createdAt: new Date(now).toISOString(),
    revokedAt: null,
  };
  state.sessions.push(session);
  return {
    session,
    token,
  };
}

export function createModelLease(
  state: ControlPlaneState,
  userId: string,
  deviceId: string,
  providerScope: string,
): { lease: ControlPlaneModelLease; token: string } {
  const now = Date.now();
  const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();
  const token = createOpaqueToken('lease');
  const lease: ControlPlaneModelLease = {
    id: randomUUID(),
    userId,
    deviceId,
    providerScope,
    leaseTokenHash: hashOpaqueToken(token),
    expiresAt,
    createdAt: new Date(now).toISOString(),
    revokedAt: null,
  };
  state.modelLeases.push(lease);
  return {
    lease,
    token,
  };
}
