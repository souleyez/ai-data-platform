import { persistChatOutputIfNeeded } from './chat-output-persistence.js';
import {
  buildBotConfigurationMemoryContextBlock,
  buildBotIdentityContextBlock,
  buildSystemCapabilityContextBlock,
  buildUserConstraintsContextBlock,
} from './chat-system-context.js';
import { listBotDefinitionsForManage, resolveBotDefinition } from './bot-definitions.js';
import { recordDocumentAnswerUsage } from './document-answer-usage.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { executeKnowledgeOutput } from './knowledge-execution.js';
import { runGeneralKnowledgeAwareChat } from './knowledge-chat-dispatch.js';
import type { KnowledgePlan } from './knowledge-plan.js';
import { executeKnowledgePlan } from './knowledge-plan-execution.js';
import {
  parseKnowledgeConversationState,
  type KnowledgeConversationState,
} from './knowledge-request-state.js';
import { isOpenClawGatewayConfigured, isOpenClawGatewayReachable } from './openclaw-adapter.js';
import { getIntelligenceModeStatus } from './intelligence-mode.js';
import type { ChatOutput } from './knowledge-output.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type ChatRequestInput = {
  prompt: string;
  sessionUser?: string;
  chatHistory?: ChatHistoryItem[];
  mode?: 'general' | 'knowledge_plan' | 'knowledge_output';
  debugResumePage?: boolean;
  confirmedRequest?: string;
  preferredLibraries?: Array<{ key: string; label: string }>;
  conversationState?: unknown;
  systemConstraints?: string;
  confirmedAction?: 'openclaw_action' | 'template_output';
  botId?: string;
};

function normalizeHistory(chatHistory?: ChatHistoryItem[]) {
  if (!Array.isArray(chatHistory)) return [];
  return chatHistory
    .filter((item): item is ChatHistoryItem => item?.role === 'user' || item?.role === 'assistant')
    .map((item) => ({
      role: item.role,
      content: String(item.content || '').trim(),
    }))
    .filter((item) => Boolean(item.content))
    .slice(-12);
}

function buildCloudUnavailableAnswer() {
  return '当前云端模型暂时不可用，请稍后再试。';
}

function summarizeError(error: unknown) {
  if (error instanceof Error) return error.message || error.name || 'unknown-error';
  return String(error || 'unknown-error');
}

function buildFallbackResponse(
  gatewayConfigured: boolean,
  requestMode: ChatRequestInput['mode'],
): {
  mode: 'openclaw' | 'fallback';
  intent: 'general' | 'report';
  content: string;
  output: ChatOutput;
  libraries: Array<{ key: string; label: string }>;
  knowledgePlan: KnowledgePlan | null;
  conversationState: KnowledgeConversationState | null;
  fallbackReason: string;
} {
  const content = buildCloudUnavailableAnswer();
  return {
    mode: 'fallback',
    intent: requestMode === 'general' ? 'general' : 'report',
    content,
    output: { type: 'answer', content },
    libraries: [],
    knowledgePlan: null,
    conversationState: null,
    fallbackReason: gatewayConfigured ? '' : 'cloud-gateway-not-configured',
  };
}

export async function runChatOrchestrationV2(input: ChatRequestInput) {
  const prompt = String(input.prompt || '').trim();
  const chatHistory = normalizeHistory(input.chatHistory);
  const gatewayReachable = await isOpenClawGatewayReachable();
  const gatewayConfigured = gatewayReachable || isOpenClawGatewayConfigured();
  const [intelligence, botDefinition, configuredBots, documentLibraries] = await Promise.all([
    getIntelligenceModeStatus(),
    resolveBotDefinition(input.botId),
    listBotDefinitionsForManage(),
    loadDocumentLibraries(),
  ]);
  const traceId = `trace_${Date.now()}`;
  const requestMode = input.mode || 'general';
  const existingState = requestMode === 'knowledge_output'
    ? parseKnowledgeConversationState(input.conversationState)
    : null;
  const systemContextBlocks = [
    buildSystemCapabilityContextBlock({
      mode: intelligence.mode,
      capabilities: intelligence.capabilities,
    }),
    buildBotIdentityContextBlock({
      bot: botDefinition,
      channel: 'web',
    }),
    buildBotConfigurationMemoryContextBlock({
      mode: intelligence.mode,
      bots: configuredBots,
      libraries: documentLibraries,
    }),
    buildUserConstraintsContextBlock(input.systemConstraints),
  ].filter(Boolean);

  let {
    mode,
    intent,
    content,
    output,
    libraries,
    knowledgePlan,
    conversationState,
    fallbackReason,
  } = buildFallbackResponse(gatewayConfigured, requestMode);
  let reportTemplate: { key: string; label: string; type: string } | null = null;
  let debug: Record<string, unknown> | null = null;
  let routeKind = 'general';
  let evidenceMode: string | null = null;
  let savedReport: Record<string, unknown> | null = null;
  let references: Array<{ id: string; name: string; path?: string }> = [];
  let guard = {
    requiresConfirmation: false,
    reason: '',
  };
  let confirmation: Record<string, unknown> | null = null;

  if (gatewayConfigured) {
    try {
      if (requestMode === 'knowledge_plan') {
        const result = await executeKnowledgePlan(prompt, chatHistory, input.sessionUser);
        libraries = result.libraries;
        knowledgePlan = result.knowledgePlan;
        content = result.content;
        output = result.output;
        intent = result.intent;
        mode = result.mode;
      } else if (requestMode === 'knowledge_output') {
        const result = await executeKnowledgeOutput({
          prompt,
          confirmedRequest: input.confirmedRequest,
          preferredLibraries: input.preferredLibraries,
          timeRange: existingState?.timeRange,
          contentFocus: existingState?.contentFocus,
          sessionUser: input.sessionUser,
          debugResumePage: input.debugResumePage === true,
          chatHistory,
          botDefinition,
        });
        libraries = result.libraries;
        output = result.output;
        content = result.content;
        intent = result.intent;
        mode = result.mode;
        reportTemplate = result.reportTemplate || null;
        debug = result.debug || null;
        routeKind = 'knowledge_output';
      } else {
        const result = await runGeneralKnowledgeAwareChat({
          prompt,
          chatHistory,
          existingState,
          sessionUser: input.sessionUser,
          debugResumePage: input.debugResumePage === true,
          systemContextBlocks,
          skipTemplateConfirmation: input.confirmedAction === 'openclaw_action',
          botDefinition,
        });
        libraries = result.libraries;
        output = result.output;
        content = result.content;
        intent = result.intent;
        mode = result.mode;
        conversationState = result.conversationState;
        references = result.references || [];
        debug = result.debug || null;
        routeKind = result.routeKind || 'general';
        evidenceMode = result.evidenceMode || null;
        guard = {
          requiresConfirmation: Boolean(result.guard?.requiresConfirmation),
          reason: String(result.guard?.reason || ''),
        };
        confirmation = result.guard?.confirmation || null;
      }
    } catch (error) {
      fallbackReason = summarizeError(error);
      console.warn(`[chat:fallback] trace=${traceId} reason=${fallbackReason}`);
      content = buildCloudUnavailableAnswer();
      output = { type: 'answer', content };
      mode = 'fallback';
      conversationState = null;
      routeKind = 'general';
      evidenceMode = null;
      guard = {
        requiresConfirmation: false,
        reason: '',
      };
      confirmation = null;
    }
  }

  if (routeKind === 'general' && output.type === 'answer' && references.length) {
    try {
      await recordDocumentAnswerUsage({
        traceId,
        botId: botDefinition?.id || '',
        sessionUser: input.sessionUser || '',
        references,
      });
    } catch (error) {
      console.warn(`[chat:answer-usage] trace=${traceId} reason=${summarizeError(error)}`);
    }
  }

  if (output.type !== 'answer') {
    try {
      savedReport = await persistChatOutputIfNeeded({
        prompt,
        output,
        libraries,
        reportTemplate,
      });
    } catch (error) {
      console.warn(`[chat:auto-save] trace=${traceId} reason=${summarizeError(error)}`);
    }
  }

  return {
    mode,
    intent,
    needsKnowledge: intent === 'report' || libraries.length > 0,
    libraries,
    output,
    reportTemplate,
    savedReport,
    knowledgePlan,
    guard: {
      requiresConfirmation: guard.requiresConfirmation,
      reason: guard.reason,
    },
    traceId,
    message: {
      role: 'assistant' as const,
      content,
      output,
      meta: mode === 'openclaw' ? '云端智能回复' : '云端回复暂不可用',
      references,
      confirmation,
    },
    sources: [],
    permissions: {
      mode: intelligence.mode,
      readOnly: !intelligence.capabilities.canModifyLocalSystemFiles,
      capabilities: intelligence.capabilities,
    },
    orchestration: {
      mode,
      routeKind,
      docMatches: libraries.length,
      evidenceMode,
      gatewayConfigured,
      intelligenceMode: intelligence.mode,
      fallbackReason: mode === 'fallback' ? fallbackReason : '',
      searchEnabledByDefault: true,
      nativeSearchPreferred: true,
      botId: botDefinition?.id || '',
      botName: botDefinition?.name || '',
      },
    debug,
    conversationState,
    latencyMs: 120,
  };
}
