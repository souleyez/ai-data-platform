import type { FastifyRequest } from 'fastify';
import {
  createModelLease,
  createSession,
  findUserByPhone,
  listPublishedReleases,
  mutateControlPlaneState,
  normalizePhone,
  resolvePolicy,
  upsertDevice,
  upsertUser,
} from './control-plane-state-repository.js';
import { resolveUpgradeState, sortReleasesDescending } from './control-plane-versions.js';
import type {
  BootstrapAuthRequest,
  BootstrapAuthResult,
  ClientPolicyView,
  ControlPlaneRelease,
} from './control-plane-schema.js';

function uniqueProviders(providers: string[]): string[] {
  return [...new Set(providers.filter(Boolean))];
}

function resolveClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || '';
  }
  return request.ip || '';
}

function resolveLatestRelease(releases: ControlPlaneRelease[]): ControlPlaneRelease | null {
  return sortReleasesDescending(releases)[0] ?? null;
}

function toPolicyView(policy: ClientPolicyView): ClientPolicyView {
  return {
    channel: policy.channel,
    minSupportedVersion: policy.minSupportedVersion,
    targetVersion: policy.targetVersion,
    forceUpgrade: policy.forceUpgrade,
    allowSelfRegister: policy.allowSelfRegister,
    modelAccessMode: policy.modelAccessMode,
    providerScopes: [...policy.providerScopes],
  };
}

export async function handleBootstrapAuth(
  request: FastifyRequest,
  input: BootstrapAuthRequest,
): Promise<BootstrapAuthResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw new Error('PHONE_REQUIRED');
  }
  if (!input.deviceFingerprint?.trim()) {
    throw new Error('DEVICE_FINGERPRINT_REQUIRED');
  }

  return mutateControlPlaneState((state) => {
    const policy = resolvePolicy(state, phone);
    let user = findUserByPhone(state, phone);
    let createdNow = false;

    if (!user) {
      if (!policy.allowSelfRegister) {
        throw new Error('SELF_REGISTER_DISABLED');
      }
      user = upsertUser(state, {
        phone,
        status: 'active',
        source: 'self_registered',
      });
      createdNow = true;
    }

    if (user.status !== 'active') {
      throw new Error('USER_DISABLED');
    }

    const device = upsertDevice(state, {
      userId: user.id,
      deviceFingerprint: input.deviceFingerprint.trim(),
      deviceName: input.deviceName?.trim() || '',
      osFamily: 'windows',
      osVersion: input.osVersion?.trim() || '',
      clientVersion: input.clientVersion?.trim() || '',
      openclawVersion: input.openclawVersion?.trim() || '',
      lastIp: resolveClientIp(request),
    });

    const { token, session } = createSession(state, user.id, device.id);
    const releases = listPublishedReleases(state, policy.channel);
    const latestRelease = resolveLatestRelease(releases);
    const minSupportedVersion = policy.minSupportedVersion || latestRelease?.minSupportedVersion || '';
    const latestVersion = latestRelease?.version || '';
    const targetVersion = policy.targetVersion || latestVersion;
    const upgradeState = resolveUpgradeState({
      currentVersion: input.clientVersion?.trim() || '',
      minSupportedVersion,
      latestVersion,
      forceUpgrade: policy.forceUpgrade,
      selfRegistered: createdNow,
    });

    const activeProviders = uniqueProviders([
      ...policy.providerScopes,
      ...state.modelProviderKeys.filter((item) => item.status === 'active').map((item) => item.provider),
    ]);

    return {
      status: 'ok',
      user: {
        id: user.id,
        phone: user.phone,
        source: user.source,
        status: user.status,
      },
      device: {
        id: device.id,
      },
      session: {
        token,
        expiresAt: session.expiresAt,
      },
      upgrade: {
        state: upgradeState,
        channel: policy.channel,
        currentVersion: input.clientVersion?.trim() || '',
        minSupportedVersion,
        latestVersion,
        targetVersion,
      },
      modelAccess: {
        mode: policy.modelAccessMode,
        providers: activeProviders,
      },
    };
  });
}

export async function getLatestReleaseForChannel(channel: string): Promise<ControlPlaneRelease | null> {
  return mutateControlPlaneState((state) => resolveLatestRelease(listPublishedReleases(state, channel)));
}

export async function getPolicyForPhone(phone: string): Promise<ClientPolicyView> {
  return mutateControlPlaneState((state) => {
    const policy = resolvePolicy(state, phone);
    return toPolicyView({
      channel: policy.channel,
      minSupportedVersion: policy.minSupportedVersion,
      targetVersion: policy.targetVersion,
      forceUpgrade: policy.forceUpgrade,
      allowSelfRegister: policy.allowSelfRegister,
      modelAccessMode: policy.modelAccessMode,
      providerScopes: policy.providerScopes,
    });
  });
}

export async function issueModelLease(userId: string, deviceId: string, providerScope: string) {
  return mutateControlPlaneState((state) => createModelLease(state, userId, deviceId, providerScope));
}
