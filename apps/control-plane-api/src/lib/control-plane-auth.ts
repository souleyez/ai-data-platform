import type { FastifyRequest } from 'fastify';
import {
  getDeviceById,
  getSessionByToken,
  getUserById,
  mutateControlPlaneState,
  resolvePolicy,
} from './control-plane-state-repository.js';
import type {
  ClientPolicyView,
  ControlPlaneDevice,
  ControlPlaneSession,
  ControlPlaneUser,
} from './control-plane-schema.js';

export interface AuthenticatedClientContext {
  session: ControlPlaneSession;
  user: ControlPlaneUser;
  device: ControlPlaneDevice;
  policy: ClientPolicyView;
}

function extractBearerToken(request: FastifyRequest): string {
  const value = request.headers.authorization?.trim() || '';
  if (!value.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return value.slice('bearer '.length).trim();
}

export async function authenticateClientRequest(
  request: FastifyRequest,
): Promise<AuthenticatedClientContext | null> {
  const token = extractBearerToken(request);
  if (!token) {
    return null;
  }

  return mutateControlPlaneState((state) => {
    const session = getSessionByToken(state, token);
    if (!session) {
      return null;
    }
    const user = getUserById(state, session.userId);
    const device = getDeviceById(state, session.deviceId);
    if (!user || !device) {
      return null;
    }
    const policy = resolvePolicy(state, user.phone);
    return {
      session,
      user,
      device,
      policy: {
        channel: policy.channel,
        minSupportedVersion: policy.minSupportedVersion,
        targetVersion: policy.targetVersion,
        forceUpgrade: policy.forceUpgrade,
        allowSelfRegister: policy.allowSelfRegister,
        modelAccessMode: policy.modelAccessMode,
        providerScopes: policy.providerScopes,
      },
    };
  });
}
