import { isOpenClawGatewayConfigured } from './openclaw-adapter.js';

export type DocumentImageVlmProviderMode = 'disabled' | 'openclaw-skill';

export type DocumentImageVlmCapability = {
  enabled: boolean;
  available: boolean;
  providerMode: DocumentImageVlmProviderMode;
  toolName: string;
  reason:
    | 'disabled'
    | 'ocr-only-mode'
    | 'missing-tool'
    | 'gateway-not-configured'
    | 'ready';
};

function env(name: string, fallback?: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
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
