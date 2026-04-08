import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isOpenClawGatewayConfigured, isOpenClawGatewayReachable } from './openclaw-adapter.js';
import { loadModelConfigState } from './model-config.js';

export type DocumentImageVlmProviderMode = 'disabled' | 'openclaw-skill';

export type DocumentImageVlmCapability = {
  enabled: boolean;
  available: boolean;
  providerMode: DocumentImageVlmProviderMode;
  toolName: string;
  currentModelId?: string;
  gatewayUrl?: string;
  imageModelId?: string;
  minimaxConfigured?: boolean;
  reason:
    | 'disabled'
    | 'ocr-only-mode'
    | 'missing-tool'
    | 'gateway-not-configured'
    | 'gateway-unreachable'
    | 'minimax-not-configured'
    | 'image-model-missing'
    | 'ready';
};

type DocumentImageVlmCapabilityDependencies = {
  gatewayReachable?: () => Promise<boolean>;
  loadModelState?: typeof loadModelConfigState;
  readImageModelId?: () => Promise<string>;
};

function env(name: string, fallback?: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function resolveOpenClawRuntimeModelsPath(agentId = env('OPENCLAW_AGENT_ID', 'main')) {
  return path.join(os.homedir(), '.openclaw-autoclaw', 'agents', String(agentId || 'main').trim() || 'main', 'agent', 'models.json');
}

async function readOpenClawImageCapableMiniMaxModelId() {
  try {
    const raw = await fs.readFile(resolveOpenClawRuntimeModelsPath(), 'utf8');
    const parsed = JSON.parse(raw) as {
      providers?: Record<string, { models?: Array<{ id?: string; input?: string[] }> }>;
    };
    const minimaxModels = Array.isArray(parsed?.providers?.minimax?.models) ? parsed.providers.minimax.models : [];
    const imageModel = minimaxModels.find((item) => Array.isArray(item?.input) && item.input.includes('image'));
    return String(imageModel?.id || '').trim() || '';
  } catch {
    return '';
  }
}

export function resolveDocumentImageVlmProviderMode(
  value = env('DOCUMENT_IMAGE_VLM_PROVIDER', 'openclaw-skill'),
): DocumentImageVlmProviderMode {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'disabled' ? 'disabled' : 'openclaw-skill';
}

export function resolveDocumentImageParseMode(
  value = env('DOCUMENT_IMAGE_PARSE_MODE', 'ocr-plus-vlm'),
) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'ocr-only' || normalized === 'disabled'
    ? 'ocr-only'
    : 'ocr-plus-vlm';
}

export function resolveDocumentImageVlmToolName(
  value = env('DOCUMENT_IMAGE_VLM_TOOL', 'image'),
) {
  return String(value || '').trim().toLowerCase();
}

export function readDocumentImageVlmCapability(): DocumentImageVlmCapability {
  const providerMode = resolveDocumentImageVlmProviderMode();
  const parseMode = resolveDocumentImageParseMode();
  const toolName = resolveDocumentImageVlmToolName();

  if (parseMode !== 'ocr-plus-vlm') {
    return {
      enabled: false,
      available: false,
      providerMode,
      toolName,
      reason: 'ocr-only-mode',
    };
  }

  if (providerMode === 'disabled') {
    return {
      enabled: false,
      available: false,
      providerMode,
      toolName,
      reason: 'disabled',
    };
  }

  if (!toolName) {
    return {
      enabled: true,
      available: false,
      providerMode,
      toolName,
      reason: 'missing-tool',
    };
  }

  if (!isOpenClawGatewayConfigured()) {
    return {
      enabled: true,
      available: false,
      providerMode,
      toolName,
      reason: 'gateway-not-configured',
    };
  }

  return {
    enabled: true,
    available: true,
    providerMode,
    toolName,
    reason: 'ready',
  };
}

export async function loadDocumentImageVlmCapability(
  dependencies: DocumentImageVlmCapabilityDependencies = {},
): Promise<DocumentImageVlmCapability> {
  const base = readDocumentImageVlmCapability();
  if (base.reason === 'ocr-only-mode' || base.reason === 'disabled' || base.reason === 'missing-tool') {
    return base;
  }

  const loadModelState = dependencies.loadModelState || loadModelConfigState;
  const readImageModelId = dependencies.readImageModelId || readOpenClawImageCapableMiniMaxModelId;
  let state: Awaited<ReturnType<typeof loadModelConfigState>> | null = null;

  try {
    state = await loadModelState();
  } catch {
    state = null;
  }

  const gatewayUrl = state?.openclaw?.gatewayUrl || undefined;

  const gatewayReachable = dependencies.gatewayReachable || isOpenClawGatewayReachable;
  const reachable =
    base.reason === 'gateway-not-configured'
      ? Boolean(state?.openclaw?.running && gatewayUrl)
      : await gatewayReachable();

  if (!reachable) {
    return {
      ...base,
      gatewayUrl,
      available: false,
      reason: base.reason === 'gateway-not-configured' ? 'gateway-not-configured' : 'gateway-unreachable',
    };
  }

  try {
    const currentState = state;
    if (!currentState) {
      throw new Error('model-state-unavailable');
    }

    const minimaxProvider = (currentState.providers || []).find((item) => item.id === 'minimax');
    const imageModelId = await readImageModelId();
    const minimaxConfigured = Boolean(
      minimaxProvider?.configured
      || (currentState.availableModels || []).some((item) => String(item.familyId || '').toLowerCase() === 'minimax'),
    );

    if (!minimaxConfigured) {
      return {
        ...base,
        available: false,
        minimaxConfigured: false,
        gatewayUrl,
        imageModelId: imageModelId || undefined,
        currentModelId: currentState.currentModel?.id || undefined,
        reason: 'minimax-not-configured',
      };
    }

    if (!imageModelId) {
      return {
        ...base,
        available: false,
        minimaxConfigured: true,
        gatewayUrl,
        currentModelId: currentState.currentModel?.id || undefined,
        reason: 'image-model-missing',
      };
    }

    return {
      ...base,
      available: true,
      currentModelId: currentState.currentModel?.id || undefined,
      gatewayUrl,
      imageModelId,
      minimaxConfigured: true,
      reason: 'ready',
    };
  } catch {
    return {
      ...base,
      available: false,
      gatewayUrl,
      reason: 'minimax-not-configured',
    };
  }
}
