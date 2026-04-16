import type {
  GeneralKnowledgeConversationState,
  KnowledgeConversationState,
} from './knowledge-request-state-types.js';

const GENERAL_KNOWLEDGE_PREFERRED_DOCUMENT_TTL_MS = 10 * 60 * 1000;

function normalizeText(text: string) {
  return String(text || '').trim();
}

export function buildGeneralKnowledgeConversationState(
  preferredDocumentPath?: string,
) {
  const normalizedPath = normalizeText(preferredDocumentPath || '');
  if (!normalizedPath) return null;
  const expiresAt = new Date(Date.now() + GENERAL_KNOWLEDGE_PREFERRED_DOCUMENT_TTL_MS).toISOString();
  return {
    kind: 'general' as const,
    preferredDocumentPath: normalizedPath,
    expiresAt,
  };
}

export function parseGeneralKnowledgeConversationState(value: unknown): GeneralKnowledgeConversationState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== 'general') return null;
  const preferredDocumentPath = normalizeText(String(raw.preferredDocumentPath || ''));
  const expiresAt = normalizeText(String(raw.expiresAt || ''));
  const expiresAtMs = Date.parse(expiresAt);
  if (!preferredDocumentPath || !expiresAt || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return null;

  return {
    kind: 'general',
    preferredDocumentPath,
    expiresAt,
  };
}

export function parseKnowledgeConversationState(value: unknown): KnowledgeConversationState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== 'knowledge_output') return null;

  const outputType = String(raw.outputType || '').trim();
  const missingSlot = String(raw.missingSlot || '').trim();
  if (!['', 'table', 'page', 'pdf', 'ppt', 'doc', 'md'].includes(outputType)) return null;
  if (!['time', 'content', 'output'].includes(missingSlot)) return null;

  return {
    kind: 'knowledge_output',
    libraries: Array.isArray(raw.libraries)
      ? raw.libraries
          .map((item) => {
            const entry = item as { key?: unknown; label?: unknown };
            return {
              key: String(entry?.key || '').trim(),
              label: String(entry?.label || '').trim(),
            };
          })
          .filter((item) => item.key || item.label)
      : [],
    timeRange: String(raw.timeRange || '').trim(),
    contentFocus: String(raw.contentFocus || '').trim(),
    outputType: outputType as KnowledgeConversationState['outputType'],
    missingSlot: missingSlot as KnowledgeConversationState['missingSlot'],
  };
}
