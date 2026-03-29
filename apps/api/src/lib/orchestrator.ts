import { executeKnowledgeOutput } from './knowledge-execution.js';
import { runGeneralKnowledgeAwareChat } from './knowledge-chat-dispatch.js';
import type { KnowledgePlan } from './knowledge-plan.js';
import { executeKnowledgePlan } from './knowledge-plan-execution.js';
import {
  parseKnowledgeConversationState,
  type KnowledgeConversationState,
} from './knowledge-request-state.js';
import { isOpenClawGatewayConfigured, isOpenClawGatewayReachable } from './openclaw-adapter.js';
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
    mode: 'fallback' as const,
    intent: requestMode === 'general' ? ('general' as const) : ('report' as const),
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
  const traceId = `trace_${Date.now()}`;
  const requestMode = input.mode || 'general';
  const existingState = requestMode === 'knowledge_output'
    ? parseKnowledgeConversationState(input.conversationState)
    : null;

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
        });
        libraries = result.libraries;
        output = result.output;
        content = result.content;
        intent = result.intent;
        mode = result.mode;
        reportTemplate = result.reportTemplate || null;
        debug = result.debug || null;
      } else {
        const result = await runGeneralKnowledgeAwareChat({
          prompt,
          chatHistory,
          existingState,
          sessionUser: input.sessionUser,
        });
        libraries = result.libraries;
        output = result.output;
        content = result.content;
        intent = result.intent;
        mode = result.mode;
        conversationState = result.conversationState;
      }
    } catch (error) {
      fallbackReason = summarizeError(error);
      console.warn(`[chat:fallback] trace=${traceId} reason=${fallbackReason}`);
      content = buildCloudUnavailableAnswer();
      output = { type: 'answer', content };
      mode = 'fallback';
      conversationState = null;
    }
  }

  return {
    mode,
    intent,
    needsKnowledge: intent === 'report' || libraries.length > 0,
    libraries,
    output,
    reportTemplate,
    knowledgePlan,
    guard: {
      requiresConfirmation: false,
      reason: '',
    },
    traceId,
    message: {
      role: 'assistant' as const,
      content,
      output,
      meta: mode === 'openclaw' ? '云端智能回复' : '云端回复暂不可用',
      references: [],
    },
    sources: [],
    permissions: { mode: 'read-only' as const },
    orchestration: {
      mode,
      docMatches: libraries.length,
      gatewayConfigured,
      fallbackReason: mode === 'fallback' ? fallbackReason : '',
    },
    debug,
    conversationState,
    latencyMs: 120,
  };
}
