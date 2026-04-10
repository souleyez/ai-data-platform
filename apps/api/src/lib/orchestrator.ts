import {
  handoffTimedOutChatToBackground,
  isChatTimeoutBackgroundCandidate,
} from './chat-background-jobs.js';
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
import {
  buildGeneralKnowledgeConversationState,
  parseGeneralKnowledgeConversationState,
  parseKnowledgeConversationState,
  type GeneralKnowledgeConversationState,
  type KnowledgeConversationState,
} from './knowledge-request-state.js';
import { isOpenClawGatewayConfigured, isOpenClawGatewayReachable } from './openclaw-adapter.js';
import {
  getIntelligenceModeStatus,
  resolveEffectiveIntelligenceMode,
  resolveIntelligenceCapabilities,
} from './intelligence-mode.js';
import type { ChatOutput } from './knowledge-output.js';
import type { ResolvedChannelAccess } from './channel-access-resolver.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type ChatRequestInput = {
  prompt: string;
  sessionUser?: string;
  chatHistory?: ChatHistoryItem[];
  mode?: 'general' | 'knowledge_output';
  debugResumePage?: boolean;
  confirmedRequest?: string;
  preferredLibraries?: Array<{ key: string; label: string }>;
  conversationState?: unknown;
  systemConstraints?: string;
  confirmedAction?: 'openclaw_action' | 'template_output';
  botId?: string;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
  cloudTimeoutMs?: number;
  backgroundContinuation?: boolean;
  preferredDocumentPath?: string;
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

function buildBackgroundContinuationAnswer() {
  return '这次内容较长，已转入报表中心继续生成。生成完成后会出现在“已出报表”里。';
}

function getBackgroundHandoffTimeoutMs() {
  const parsed = Number(process.env.CHAT_BACKGROUND_HANDOFF_TIMEOUT_MS || '45000');
  if (!Number.isFinite(parsed) || parsed < 5000) return 45000;
  return Math.floor(parsed);
}

async function withBackgroundHandoffTimeout<T>(promise: Promise<T>) {
  const timeoutMs = getBackgroundHandoffTimeoutMs();
  let timer: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Chat background handoff timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  conversationState: KnowledgeConversationState | GeneralKnowledgeConversationState | null;
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
  const effectiveIntelligenceMode = resolveEffectiveIntelligenceMode(
    intelligence.mode,
    botDefinition?.intelligenceMode,
  );
  const effectiveIntelligenceCapabilities = resolveIntelligenceCapabilities(effectiveIntelligenceMode);
  const traceId = `trace_${Date.now()}`;
  const requestMode = input.mode || 'general';
  const existingKnowledgeState = requestMode === 'knowledge_output'
    ? parseKnowledgeConversationState(input.conversationState)
    : null;
  const existingGeneralState = requestMode === 'general'
    ? parseGeneralKnowledgeConversationState(input.conversationState)
    : null;
  const systemContextBlocks = [
    buildSystemCapabilityContextBlock({
      mode: effectiveIntelligenceMode,
      capabilities: effectiveIntelligenceCapabilities,
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
  let backgroundHandoff = false;
  let references: Array<{ id: string; name: string; path?: string }> = [];
  let guard = {
    requiresConfirmation: false,
    reason: '',
  };
  let confirmation: Record<string, unknown> | null = null;

  if (gatewayConfigured) {
    try {
      if (requestMode === 'knowledge_output') {
        const result = await executeKnowledgeOutput({
          prompt,
          confirmedRequest: input.confirmedRequest,
          preferredLibraries: input.preferredLibraries,
          timeRange: existingKnowledgeState?.timeRange,
          contentFocus: existingKnowledgeState?.contentFocus,
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
        const generalChatPromise = runGeneralKnowledgeAwareChat({
          prompt,
          chatHistory,
          existingState: existingGeneralState,
          sessionUser: input.sessionUser,
          debugResumePage: input.debugResumePage === true,
          systemContextBlocks,
          skipTemplateConfirmation: input.confirmedAction === 'openclaw_action',
          botDefinition,
          effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
          accessContext: input.accessContext || null,
          cloudTimeoutMs: input.cloudTimeoutMs,
          preferredDocumentPath: input.preferredDocumentPath || existingGeneralState?.preferredDocumentPath,
        });
        const result = await (
          requestMode === 'general' && !input.backgroundContinuation
            ? withBackgroundHandoffTimeout(generalChatPromise)
            : generalChatPromise
        );
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
      if (
        requestMode === 'general'
        && !input.backgroundContinuation
        && isChatTimeoutBackgroundCandidate(error)
      ) {
        try {
          const handoff = await handoffTimedOutChatToBackground({
            prompt,
            sessionUser: input.sessionUser,
            chatHistory,
            systemConstraints: input.systemConstraints,
            botId: input.botId,
            botDefinition,
            effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
            accessContext: input.accessContext || null,
            preferredDocumentPath: input.preferredDocumentPath || existingGeneralState?.preferredDocumentPath,
          });
          backgroundHandoff = true;
          savedReport = handoff.savedReport as Record<string, unknown>;
          libraries = Array.isArray(handoff.savedReport?.libraries)
            ? handoff.savedReport.libraries as Array<{ key: string; label: string }>
            : [];
          content = buildBackgroundContinuationAnswer();
          output = { type: 'answer', content };
          mode = 'fallback';
          conversationState = buildGeneralKnowledgeConversationState(handoff.job.latestDocumentPath);
          routeKind = 'general';
          evidenceMode = null;
          guard = {
            requiresConfirmation: false,
            reason: '',
          };
          confirmation = null;
        } catch (handoffError) {
          console.warn(`[chat:background-handoff] trace=${traceId} reason=${summarizeError(handoffError)}`);
        }
      }

      if (!backgroundHandoff) {
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

  if (!backgroundHandoff && !guard.requiresConfirmation && mode !== 'fallback' && output.type !== 'answer') {
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
      meta: backgroundHandoff
        ? '已转报表中心后台生成'
        : (mode === 'openclaw' ? '云端智能回复' : '云端回复暂不可用'),
      references,
      confirmation,
    },
    sources: [],
    permissions: {
      mode: effectiveIntelligenceMode,
      readOnly: !effectiveIntelligenceCapabilities.canModifyLocalSystemFiles,
      capabilities: effectiveIntelligenceCapabilities,
    },
    orchestration: {
      mode,
      routeKind,
      docMatches: libraries.length,
      evidenceMode,
      gatewayConfigured,
      intelligenceMode: effectiveIntelligenceMode,
      fallbackReason: mode === 'fallback' ? fallbackReason : '',
      backgroundContinuation: backgroundHandoff,
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
