import type { ChatActionResult } from './platform-chat-actions.js';

function getDebugNumber(debug: Record<string, unknown> | null, key: string) {
  const value = debug?.[key];
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function getDebugString(debug: Record<string, unknown> | null, key: string, fallback: string) {
  const value = debug?.[key];
  return typeof value === 'string' ? value : fallback;
}

function getDebugBoolean(debug: Record<string, unknown> | null, key: string) {
  return debug?.[key] === true;
}

function buildMessageMeta(input: {
  backgroundHandoff: boolean;
  mode: string;
  actionResult: ChatActionResult | null;
}) {
  if (input.backgroundHandoff) return '已转报表中心后台生成';
  if (input.mode === 'openclaw') return '云端智能回复';
  if (input.mode === 'host') {
    return input.actionResult?.status === 'failed' ? '系统操作失败' : '系统操作已执行';
  }
  return '云端回复暂不可用';
}

export function buildChatOrchestrationResult(input: {
  mode: string;
  intent: string;
  libraries: Array<{ key: string; label: string }>;
  output: { type: string; content?: string };
  reportTemplate: { key: string; label: string; type: string } | null;
  savedReport: Record<string, unknown> | null;
  actionResult: ChatActionResult | null;
  knowledgePlan: unknown;
  guard: { requiresConfirmation: boolean; reason: string };
  traceId: string;
  content: string;
  references: Array<{ id: string; name: string; path?: string }>;
  confirmation: Record<string, unknown> | null;
  effectiveIntelligenceCapabilities: unknown;
  routeKind: string;
  evidenceMode: string | null;
  gatewayConfigured: boolean;
  fallbackReason: string;
  backgroundHandoff: boolean;
  preferredDocumentPath: string;
  debug: Record<string, unknown> | null;
  botDefinition?: { id?: string; name?: string } | null;
  conversationState: unknown;
}) {
  return {
    mode: input.mode,
    intent: input.intent,
    needsKnowledge: input.intent === 'report' || input.libraries.length > 0,
    libraries: input.libraries,
    output: input.output,
    reportTemplate: input.reportTemplate,
    savedReport: input.savedReport,
    actionResult: input.actionResult,
    knowledgePlan: input.knowledgePlan,
    guard: {
      requiresConfirmation: input.guard.requiresConfirmation,
      reason: input.guard.reason,
    },
    traceId: input.traceId,
    message: {
      role: 'assistant' as const,
      content: input.content,
      output: input.output,
      meta: buildMessageMeta({
        backgroundHandoff: input.backgroundHandoff,
        mode: input.mode,
        actionResult: input.actionResult,
      }),
      references: input.references,
      confirmation: input.confirmation,
      actionResult: input.actionResult,
    },
    sources: [],
    permissions: {
      readOnly: !(input.effectiveIntelligenceCapabilities as { canModifyLocalSystemFiles?: boolean } | null)?.canModifyLocalSystemFiles,
      capabilities: input.effectiveIntelligenceCapabilities,
    },
    orchestration: {
      mode: input.mode,
      routeKind: input.routeKind,
      docMatches: input.libraries.length,
      evidenceMode: input.evidenceMode,
      gatewayConfigured: input.gatewayConfigured,
      fallbackReason: input.mode === 'fallback' ? input.fallbackReason : '',
      backgroundContinuation: input.backgroundHandoff,
      searchEnabledByDefault: true,
      nativeSearchPreferred: true,
      preferredDocumentPath: input.preferredDocumentPath,
      latestDocumentFullTextIncluded: getDebugBoolean(input.debug, 'latestDocumentFullTextIncluded'),
      preferredDocumentStatus: getDebugString(
        input.debug,
        'preferredDocumentStatus',
        input.preferredDocumentPath ? 'unknown' : 'none',
      ),
      catalogMemoryLibraries: getDebugNumber(input.debug, 'catalogMemoryLibraries'),
      catalogMemoryDocuments: getDebugNumber(input.debug, 'catalogMemoryDocuments'),
      catalogMemoryOutputs: getDebugNumber(input.debug, 'catalogMemoryOutputs'),
      matchedFullTextDocuments: getDebugNumber(input.debug, 'matchedFullTextDocuments'),
      botId: input.botDefinition?.id || '',
      botName: input.botDefinition?.name || '',
    },
    debug: input.debug,
    conversationState: input.conversationState,
    latencyMs: 120,
  };
}
