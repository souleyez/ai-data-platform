import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';

export const PLATFORM_PROJECT_KEY = 'ai-data-platform';
export const PLATFORM_SERVICE_NAME = 'ai-data-platform-api';
export const PLATFORM_INTEGRATION_CAPABILITIES = ['health', 'broadcasts'] as const;

const PLATFORM_INTEGRATION_STATE_PATH = path.join(
  STORAGE_CONFIG_DIR,
  'platform-integration.json',
);
const MAX_RECEIPTS = 100;

export interface PlatformBroadcastRequest {
  broadcastId?: string;
  projectKey?: string;
  kind?: string;
  scope?: string;
  title?: string;
  body?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt?: string;
  expiresAt?: string | null;
  idempotencyKey?: string | null;
}

interface PlatformBroadcastReceipt {
  idempotencyKey: string;
  broadcastId: string;
  projectKey: string;
  kind: string;
  scope: string;
  title: string;
  createdAt: string;
  expiresAt?: string | null;
  receivedAt: string;
}

interface PlatformIntegrationState {
  lastBroadcast?: PlatformBroadcastReceipt;
  receipts: PlatformBroadcastReceipt[];
}

export class PlatformIntegrationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'PlatformIntegrationError';
    this.statusCode = statusCode;
  }
}

export function getPlatformIntegrationHealth(platformToken?: string) {
  assertPlatformAuthorized(platformToken);
  return {
    status: 'ok',
    projectKey: PLATFORM_PROJECT_KEY,
    service: PLATFORM_SERVICE_NAME,
    acceptsBroadcast: true,
    capabilities: [...PLATFORM_INTEGRATION_CAPABILITIES],
    version: resolvePlatformVersion(),
    message: 'integration healthy',
  };
}

export function acceptPlatformBroadcast(
  platformToken: string | undefined,
  request: PlatformBroadcastRequest,
) {
  assertPlatformAuthorized(platformToken);
  const normalizedRequest = normalizePlatformBroadcastRequest(request);
  const state = readPlatformIntegrationState();
  const duplicate = state.receipts.find(
    (item) =>
      item.idempotencyKey === normalizedRequest.idempotencyKey ||
      item.broadcastId === normalizedRequest.broadcastId,
  );

  if (duplicate) {
    return {
      status: 'accepted',
      broadcastId: duplicate.broadcastId,
      projectKey: PLATFORM_PROJECT_KEY,
      receivedAt: duplicate.receivedAt,
      mode: 'async',
      message: 'duplicate ignored',
    };
  }

  const receivedAt = new Date().toISOString();
  const receipt: PlatformBroadcastReceipt = {
    idempotencyKey: normalizedRequest.idempotencyKey,
    broadcastId: normalizedRequest.broadcastId,
    projectKey: PLATFORM_PROJECT_KEY,
    kind: normalizedRequest.kind,
    scope: normalizedRequest.scope,
    title: normalizedRequest.title,
    createdAt: normalizedRequest.createdAt,
    expiresAt: normalizedRequest.expiresAt ?? null,
    receivedAt,
  };

  const nextState: PlatformIntegrationState = {
    lastBroadcast: receipt,
    receipts: [receipt, ...state.receipts].slice(0, MAX_RECEIPTS),
  };

  writePlatformIntegrationState(nextState);

  return {
    status: 'accepted',
    broadcastId: receipt.broadcastId,
    projectKey: PLATFORM_PROJECT_KEY,
    receivedAt,
    mode: 'async',
    message: 'queued',
  };
}

function assertPlatformAuthorized(platformToken?: string) {
  const expectedToken = (process.env.HOME_PLATFORM_TOKEN ?? '').trim();
  if (!expectedToken) {
    return;
  }

  if ((platformToken ?? '').trim() !== expectedToken) {
    throw new PlatformIntegrationError('PLATFORM_TOKEN_INVALID', 401);
  }
}

function normalizePlatformBroadcastRequest(request: PlatformBroadcastRequest) {
  if (request == null || typeof request !== 'object') {
    throw new PlatformIntegrationError('PLATFORM_BROADCAST_INVALID', 400);
  }

  const broadcastId = String(request.broadcastId ?? '').trim();
  const projectKey = String(request.projectKey ?? '').trim();
  const kind = String(request.kind ?? '').trim();
  const scope = String(request.scope ?? '').trim();
  const title = String(request.title ?? '').trim();
  const createdAt = String(request.createdAt ?? '').trim();
  const idempotencyKey = String(
    request.idempotencyKey ?? request.broadcastId ?? '',
  ).trim();

  if (!broadcastId || !projectKey || !kind || !scope || !title || !createdAt || !idempotencyKey) {
    throw new PlatformIntegrationError('PLATFORM_BROADCAST_INVALID', 400);
  }

  if (projectKey !== PLATFORM_PROJECT_KEY) {
    throw new PlatformIntegrationError('PLATFORM_PROJECT_KEY_MISMATCH', 400);
  }

  return {
    broadcastId,
    projectKey,
    kind,
    scope,
    title,
    createdAt,
    expiresAt: request.expiresAt ?? null,
    idempotencyKey,
  };
}

function resolvePlatformVersion() {
  return (process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.1.0').trim();
}

function readPlatformIntegrationState(): PlatformIntegrationState {
  if (!existsSync(PLATFORM_INTEGRATION_STATE_PATH)) {
    return { receipts: [] };
  }

  try {
    const parsed = JSON.parse(
      readFileSync(PLATFORM_INTEGRATION_STATE_PATH, 'utf8'),
    ) as PlatformIntegrationState;
    const receipts = Array.isArray(parsed.receipts)
      ? parsed.receipts.filter((item): item is PlatformBroadcastReceipt => {
          return (
            item != null &&
            typeof item.idempotencyKey === 'string' &&
            typeof item.broadcastId === 'string' &&
            typeof item.projectKey === 'string' &&
            typeof item.kind === 'string' &&
            typeof item.scope === 'string' &&
            typeof item.title === 'string' &&
            typeof item.createdAt === 'string' &&
            typeof item.receivedAt === 'string'
          );
        })
      : [];

    return {
      lastBroadcast:
        parsed.lastBroadcast &&
        typeof parsed.lastBroadcast.broadcastId === 'string' &&
        typeof parsed.lastBroadcast.receivedAt === 'string'
          ? parsed.lastBroadcast
          : receipts[0],
      receipts,
    };
  } catch {
    return { receipts: [] };
  }
}

function writePlatformIntegrationState(state: PlatformIntegrationState) {
  mkdirSync(STORAGE_CONFIG_DIR, { recursive: true });
  writeFileSync(PLATFORM_INTEGRATION_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
