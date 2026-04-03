import { randomUUID } from 'node:crypto';
import {
  getDeviceById,
  getUserById,
  mutateControlPlaneState,
  normalizePhone,
  resolvePolicy,
  upsertUser,
} from './control-plane-state-repository.js';
import type {
  AdminDeviceView,
  AdminModelLeaseView,
  AdminSessionView,
  ClientPolicyView,
  ControlPlaneModelProviderKey,
  ControlPlanePolicy,
  ControlPlaneRelease,
  ControlPlaneUser,
} from './control-plane-schema.js';
export {
  getAdminReportGovernance,
  updateAdminReportGovernance,
} from './report-governance-admin-service.js';

function nowIso() {
  return new Date().toISOString();
}

function encodeSecret(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function maskProviderKey(ciphertext: string): string {
  const raw = Buffer.from(ciphertext, 'base64').toString('utf8');
  if (raw.length <= 8) {
    return '****';
  }
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

export async function listAdminUsers(): Promise<Array<ControlPlaneUser & { deviceCount: number }>> {
  return mutateControlPlaneState((state) => state.users.map((user) => ({
    ...user,
    deviceCount: state.devices.filter((device) => device.userId === user.id).length,
  })));
}

export async function createAdminUser(input: {
  phone: string;
  note?: string;
  status?: 'active' | 'disabled';
}) {
  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw new Error('PHONE_REQUIRED');
  }

  return mutateControlPlaneState((state) => upsertUser(state, {
    phone,
    note: input.note?.trim() || '',
    status: input.status || 'active',
    source: 'admin_created',
  }));
}

export async function listAdminDevices(): Promise<AdminDeviceView[]> {
  return mutateControlPlaneState((state) => state.devices.map((device) => ({
    ...device,
    userPhone: getUserById(state, device.userId)?.phone || '',
  })));
}

export async function listAdminSessions(): Promise<AdminSessionView[]> {
  return mutateControlPlaneState((state) => {
    const now = Date.now();
    return state.sessions.map((session) => {
      const user = getUserById(state, session.userId);
      const device = getDeviceById(state, session.deviceId);
      return {
        ...session,
        userPhone: user?.phone || '',
        deviceName: device?.deviceName || '',
        deviceFingerprint: device?.deviceFingerprint || '',
        active: !session.revokedAt && Date.parse(session.expiresAt) > now,
      };
    });
  });
}

export async function listAdminModelLeases(): Promise<AdminModelLeaseView[]> {
  return mutateControlPlaneState((state) => {
    const now = Date.now();
    return state.modelLeases.map((lease) => {
      const user = getUserById(state, lease.userId);
      const device = getDeviceById(state, lease.deviceId);
      return {
        ...lease,
        userPhone: user?.phone || '',
        deviceName: device?.deviceName || '',
        active: !lease.revokedAt && Date.parse(lease.expiresAt) > now,
      };
    });
  });
}

export async function listAdminPolicies(): Promise<ControlPlanePolicy[]> {
  return mutateControlPlaneState((state) => [...state.policies]);
}

export async function updateAdminUser(
  userId: string,
  input: { status?: 'active' | 'disabled'; note?: string },
) {
  return mutateControlPlaneState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }
    user.status = input.status || user.status;
    if (input.note !== undefined) {
      user.note = input.note.trim();
    }
    user.updatedAt = nowIso();
    return user;
  });
}

export async function updateAdminPolicy(
  policyId: string,
  input: Partial<Pick<
    ClientPolicyView,
    'channel' | 'minSupportedVersion' | 'targetVersion' | 'forceUpgrade' | 'allowSelfRegister' | 'modelAccessMode' | 'providerScopes'
  >>,
) {
  return mutateControlPlaneState((state) => {
    const policy = state.policies.find((item) => item.id === policyId);
    if (!policy) {
      throw new Error('POLICY_NOT_FOUND');
    }

    if (input.channel !== undefined) {
      policy.channel = input.channel.trim();
    }
    if (input.minSupportedVersion !== undefined) {
      policy.minSupportedVersion = input.minSupportedVersion.trim();
    }
    if (input.targetVersion !== undefined) {
      policy.targetVersion = input.targetVersion.trim();
    }
    if (input.forceUpgrade !== undefined) {
      policy.forceUpgrade = input.forceUpgrade;
    }
    if (input.allowSelfRegister !== undefined) {
      policy.allowSelfRegister = input.allowSelfRegister;
    }
    if (input.modelAccessMode !== undefined) {
      policy.modelAccessMode = input.modelAccessMode;
    }
    if (input.providerScopes !== undefined) {
      policy.providerScopes = input.providerScopes.map((item) => item.trim()).filter(Boolean);
    }

    policy.updatedAt = nowIso();
    return resolvePolicy(state, policy.scopeValue);
  });
}

export async function listAdminReleases(): Promise<ControlPlaneRelease[]> {
  return mutateControlPlaneState((state) => [...state.releases]);
}

export async function createAdminRelease(input: {
  channel: string;
  version: string;
  artifactUrl: string;
  artifactSha256: string;
  artifactSize: number;
  openclawVersion?: string;
  installerVersion?: string;
  minSupportedVersion?: string;
  releaseNotes?: string;
  status?: 'draft' | 'published' | 'disabled';
}) {
  if (!input.channel?.trim()) {
    throw new Error('CHANNEL_REQUIRED');
  }
  if (!input.version?.trim()) {
    throw new Error('VERSION_REQUIRED');
  }
  if (!input.artifactUrl?.trim()) {
    throw new Error('ARTIFACT_URL_REQUIRED');
  }
  if (!input.artifactSha256?.trim()) {
    throw new Error('ARTIFACT_SHA256_REQUIRED');
  }
  if (!Number.isFinite(input.artifactSize) || input.artifactSize <= 0) {
    throw new Error('ARTIFACT_SIZE_INVALID');
  }

  return mutateControlPlaneState((state) => {
    const now = nowIso();
    const existing = state.releases.find(
      (item) => item.channel === input.channel.trim() && item.version === input.version.trim(),
    );
    if (existing) {
      throw new Error('RELEASE_ALREADY_EXISTS');
    }
    const created: ControlPlaneRelease = {
      id: randomUUID(),
      channel: input.channel.trim(),
      version: input.version.trim(),
      status: input.status || 'draft',
      artifactUrl: input.artifactUrl.trim(),
      artifactSha256: input.artifactSha256.trim(),
      artifactSize: input.artifactSize,
      openclawVersion: input.openclawVersion?.trim() || '',
      installerVersion: input.installerVersion?.trim() || '',
      minSupportedVersion: input.minSupportedVersion?.trim() || '',
      releaseNotes: input.releaseNotes?.trim() || '',
      publishedAt: input.status === 'published' ? now : '',
      createdAt: now,
      updatedAt: now,
    };
    state.releases.push(created);
    return created;
  });
}

export async function updateAdminRelease(
  releaseId: string,
  input: Partial<Pick<
    ControlPlaneRelease,
    | 'channel'
    | 'version'
    | 'status'
    | 'artifactUrl'
    | 'artifactSha256'
    | 'artifactSize'
    | 'openclawVersion'
    | 'installerVersion'
    | 'minSupportedVersion'
    | 'releaseNotes'
  >>,
) {
  return mutateControlPlaneState((state) => {
    const release = state.releases.find((item) => item.id === releaseId);
    if (!release) {
      throw new Error('RELEASE_NOT_FOUND');
    }
    if (input.channel !== undefined) {
      release.channel = input.channel.trim();
    }
    if (input.version !== undefined) {
      release.version = input.version.trim();
    }
    if (input.status !== undefined) {
      release.status = input.status;
    }
    if (input.artifactUrl !== undefined) {
      release.artifactUrl = input.artifactUrl.trim();
    }
    if (input.artifactSha256 !== undefined) {
      release.artifactSha256 = input.artifactSha256.trim();
    }
    if (input.artifactSize !== undefined) {
      release.artifactSize = input.artifactSize;
    }
    if (input.openclawVersion !== undefined) {
      release.openclawVersion = input.openclawVersion.trim();
    }
    if (input.installerVersion !== undefined) {
      release.installerVersion = input.installerVersion.trim();
    }
    if (input.minSupportedVersion !== undefined) {
      release.minSupportedVersion = input.minSupportedVersion.trim();
    }
    if (input.releaseNotes !== undefined) {
      release.releaseNotes = input.releaseNotes.trim();
    }
    release.updatedAt = nowIso();
    return release;
  });
}

export async function publishAdminRelease(releaseId: string) {
  return mutateControlPlaneState((state) => {
    const release = state.releases.find((item) => item.id === releaseId);
    if (!release) {
      throw new Error('RELEASE_NOT_FOUND');
    }
    const now = nowIso();
    release.status = 'published';
    release.publishedAt = now;
    release.updatedAt = now;
    return release;
  });
}

export async function listAdminModelProviderKeys() {
  return mutateControlPlaneState((state) => state.modelProviderKeys.map((item) => ({
    ...item,
    apiKeyMasked: maskProviderKey(item.apiKeyCiphertext),
  })));
}

export async function createAdminModelProviderKey(input: {
  provider: string;
  apiKey: string;
  region?: string;
  label?: string;
  status?: 'active' | 'disabled' | 'cooldown';
  weight?: number;
  dailyQuota?: number;
}) {
  if (!input.provider?.trim()) {
    throw new Error('PROVIDER_REQUIRED');
  }
  if (!input.apiKey?.trim()) {
    throw new Error('API_KEY_REQUIRED');
  }

  return mutateControlPlaneState((state) => {
    const now = nowIso();
    const created: ControlPlaneModelProviderKey = {
      id: randomUUID(),
      provider: input.provider.trim(),
      region: input.region?.trim() || '',
      label: input.label?.trim() || '',
      apiKeyCiphertext: encodeSecret(input.apiKey.trim()),
      status: input.status || 'active',
      weight: input.weight ?? 100,
      dailyQuota: input.dailyQuota ?? 0,
      usedQuota: 0,
      lastErrorAt: null,
      lastErrorMessage: '',
      createdAt: now,
      updatedAt: now,
    };
    state.modelProviderKeys.push(created);
    return {
      ...created,
      apiKeyMasked: maskProviderKey(created.apiKeyCiphertext),
    };
  });
}

export async function updateAdminModelProviderKey(
  keyId: string,
  input: {
    label?: string;
    region?: string;
    status?: 'active' | 'disabled' | 'cooldown';
    weight?: number;
    dailyQuota?: number;
    apiKey?: string;
  },
) {
  return mutateControlPlaneState((state) => {
    const item = state.modelProviderKeys.find((entry) => entry.id === keyId);
    if (!item) {
      throw new Error('MODEL_KEY_NOT_FOUND');
    }
    if (input.label !== undefined) {
      item.label = input.label.trim();
    }
    if (input.region !== undefined) {
      item.region = input.region.trim();
    }
    if (input.status !== undefined) {
      item.status = input.status;
    }
    if (input.weight !== undefined) {
      item.weight = input.weight;
    }
    if (input.dailyQuota !== undefined) {
      item.dailyQuota = input.dailyQuota;
    }
    if (input.apiKey !== undefined && input.apiKey.trim()) {
      item.apiKeyCiphertext = encodeSecret(input.apiKey.trim());
    }
    item.updatedAt = nowIso();
    return {
      ...item,
      apiKeyMasked: maskProviderKey(item.apiKeyCiphertext),
    };
  });
}
