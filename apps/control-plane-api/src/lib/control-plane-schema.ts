export type ControlPlaneUserStatus = 'active' | 'disabled';
export type ControlPlaneUserSource = 'admin_created' | 'self_registered';
export type ControlPlaneReleaseStatus = 'draft' | 'published' | 'disabled';
export type ControlPlaneModelAccessMode = 'lease' | 'direct-config';
export type ControlPlanePolicyScopeType = 'global' | 'phone';
export type ControlPlaneUpgradeState = 'ok' | 'upgrade_available' | 'force_upgrade_required';

export interface ControlPlaneUser {
  id: string;
  phone: string;
  status: ControlPlaneUserStatus;
  source: ControlPlaneUserSource;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface ControlPlaneDevice {
  id: string;
  userId: string;
  deviceFingerprint: string;
  deviceName: string;
  osFamily: string;
  osVersion: string;
  clientVersion: string;
  openclawVersion: string;
  lastIp: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ControlPlaneRelease {
  id: string;
  channel: string;
  version: string;
  status: ControlPlaneReleaseStatus;
  artifactUrl: string;
  artifactSha256: string;
  artifactSize: number;
  openclawVersion: string;
  installerVersion: string;
  minSupportedVersion: string;
  releaseNotes: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ControlPlanePolicy {
  id: string;
  scopeType: ControlPlanePolicyScopeType;
  scopeValue: string;
  channel: string;
  minSupportedVersion: string;
  targetVersion: string;
  forceUpgrade: boolean;
  allowSelfRegister: boolean;
  modelAccessMode: ControlPlaneModelAccessMode;
  providerScopes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ControlPlaneSession {
  id: string;
  userId: string;
  deviceId: string;
  sessionTokenHash: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface ControlPlaneModelProviderKey {
  id: string;
  provider: string;
  region: string;
  label: string;
  apiKeyCiphertext: string;
  status: 'active' | 'disabled' | 'cooldown';
  weight: number;
  dailyQuota: number;
  usedQuota: number;
  lastErrorAt: string | null;
  lastErrorMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface ControlPlaneModelLease {
  id: string;
  userId: string;
  deviceId: string;
  providerScope: string;
  leaseTokenHash: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface ControlPlaneState {
  users: ControlPlaneUser[];
  devices: ControlPlaneDevice[];
  releases: ControlPlaneRelease[];
  policies: ControlPlanePolicy[];
  sessions: ControlPlaneSession[];
  modelProviderKeys: ControlPlaneModelProviderKey[];
  modelLeases: ControlPlaneModelLease[];
  updatedAt: string;
}

export interface BootstrapAuthRequest {
  phone: string;
  deviceFingerprint: string;
  deviceName?: string;
  osVersion?: string;
  clientVersion?: string;
  openclawVersion?: string;
}

export interface BootstrapAuthResult {
  status: 'ok';
  user: Pick<ControlPlaneUser, 'id' | 'phone' | 'source' | 'status'>;
  device: Pick<ControlPlaneDevice, 'id'>;
  session: {
    token: string;
    expiresAt: string;
  };
  upgrade: {
    state: ControlPlaneUpgradeState;
    channel: string;
    currentVersion: string;
    minSupportedVersion: string;
    latestVersion: string;
    targetVersion: string;
  };
  modelAccess: {
    mode: ControlPlaneModelAccessMode;
    providers: string[];
  };
}

export interface ClientPolicyView {
  channel: string;
  minSupportedVersion: string;
  targetVersion: string;
  forceUpgrade: boolean;
  allowSelfRegister: boolean;
  modelAccessMode: ControlPlaneModelAccessMode;
  providerScopes: string[];
}

export interface AdminDeviceView extends ControlPlaneDevice {
  userPhone: string;
}

export interface AdminSessionView extends ControlPlaneSession {
  userPhone: string;
  deviceName: string;
  deviceFingerprint: string;
  active: boolean;
}

export interface AdminModelLeaseView extends ControlPlaneModelLease {
  userPhone: string;
  deviceName: string;
  active: boolean;
}
