import {
  handoffTimedOutChatToBackground,
  isChatTimeoutBackgroundCandidate,
} from './chat-background-jobs.js';
import { persistChatOutputIfNeeded } from './chat-output-persistence.js';
import type { ChatActionResult } from './platform-chat-actions.js';
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
import {
  parseGeneralKnowledgeConversationState,
  parseKnowledgeConversationState,
} from './knowledge-request-state.js';
import { isOpenClawGatewayConfigured, isOpenClawGatewayReachable } from './openclaw-adapter.js';
import {
  getIntelligenceModeStatus,
  resolveEffectiveIntelligenceMode,
  resolveIntelligenceCapabilities,
} from './intelligence-mode.js';
import {
  buildBackgroundContinuationAnswer,
  buildCloudUnavailableAnswer,
  buildFallbackResponse,
  normalizeHistory,
  summarizeError,
  withBackgroundHandoffTimeout,
} from './orchestrator-support.js';
import { tryRunHostPlatformAction } from './orchestrator-host.js';
import { buildChatOrchestrationResult } from './orchestrator-result.js';
import type { ChatRequestInput } from './orchestrator-types.js';

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
  const effectivePreferredDocumentPath = String(
    input.preferredDocumentPath || existingGeneralState?.preferredDocumentPath || '',
  ).trim();
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
  let actionResult: ChatActionResult | null = null;
  let references: Array<{ id: string; name: string; path?: string }> = [];
  let guard = {
    requiresConfirmation: false,
    reason: '',
  };
  let confirmation: Record<string, unknown> | null = null;

  const hostAction = await tryRunHostPlatformAction({
    prompt,
    requestMode,
    backgroundContinuation: input.backgroundContinuation,
  });
  if (hostAction?.handled) {
    mode = hostAction.mode;
    intent = hostAction.intent;
    content = hostAction.content;
    output = hostAction.output;
    libraries = hostAction.libraries;
    conversationState = hostAction.conversationState;
    routeKind = hostAction.routeKind;
    evidenceMode = hostAction.evidenceMode;
    actionResult = hostAction.actionResult;
    fallbackReason = hostAction.fallbackReason || fallbackReason;
    guard = hostAction.guard;
  }

  if (mode !== 'host' && gatewayConfigured) {
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
          existingState: input.conversationState ?? null,
          sessionUser: input.sessionUser,
          debugResumePage: input.debugResumePage === true,
          systemContextBlocks,
          skipTemplateConfirmation: input.confirmedAction === 'openclaw_action',
          botDefinition,
          effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
          accessContext: input.accessContext || null,
          cloudTimeoutMs: input.cloudTimeoutMs,
          preferredDocumentPath: effectivePreferredDocumentPath,
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
            preferredDocumentPath: effectivePreferredDocumentPath,
            conversationState: input.conversationState ?? null,
          });
          backgroundHandoff = true;
          savedReport = handoff.savedReport as Record<string, unknown>;
          libraries = Array.isArray(handoff.savedReport?.libraries)
            ? handoff.savedReport.libraries as Array<{ key: string; label: string }>
            : [];
          content = buildBackgroundContinuationAnswer();
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

  return buildChatOrchestrationResult({
    mode,
    intent,
    libraries,
    output,
    reportTemplate,
    savedReport,
    actionResult,
    knowledgePlan,
    guard,
    traceId,
    content,
    references,
    confirmation,
    effectiveIntelligenceMode,
    effectiveIntelligenceCapabilities,
    routeKind,
    evidenceMode,
    gatewayConfigured,
    fallbackReason,
    backgroundHandoff,
    preferredDocumentPath: effectivePreferredDocumentPath,
    debug,
    botDefinition,
    conversationState,
  });
}
