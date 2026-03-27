import { loadDocumentLibraries } from './document-libraries.js';
import { executeKnowledgeOutput } from './knowledge-execution.js';
import {
  buildKnowledgePlanMessage,
  buildKnowledgePlanPrompt,
  buildLocalKnowledgePlan,
  buildNoPlanMessage,
  buildPromptForScoring,
  collectLibraryMatches,
  extractPlanningResult,
  shouldFallbackToLocalPlan,
  type KnowledgePlan,
} from './knowledge-plan.js';
import { isOpenClawGatewayConfigured, isOpenClawGatewayReachable, runOpenClawChat } from './openclaw-adapter.js';
import type { ChatOutput } from './knowledge-output.js';

export type ChatRequestInput = {
  prompt: string;
  sessionUser?: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode?: 'general' | 'knowledge_plan' | 'knowledge_output';
  confirmedRequest?: string;
  preferredLibraries?: Array<{ key: string; label: string }>;
};

function normalizeHistory(chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>) {
  return Array.isArray(chatHistory)
    ? chatHistory
        .map((item) => ({
          role: item?.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: String(item?.content || '').trim(),
        }))
        .filter((item) => item.content)
        .slice(-8)
    : [];
}

function summarizeError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error ?? '').trim();
  return message ? message.replace(/\s+/g, ' ').slice(0, 240) : 'unknown-error';
}

function buildCloudUnavailableAnswer() {
  return '当前云端模型暂时不可用，请稍后再试。';
}

async function executeKnowledgePlan(
  prompt: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  sessionUser?: string,
) {
  const [documentLibraries, cloud] = await Promise.all([
    loadDocumentLibraries(),
    runOpenClawChat({
      prompt: buildKnowledgePlanPrompt(prompt, chatHistory),
      sessionUser,
      chatHistory: [],
    }),
  ]);

  const cloudPlan = extractPlanningResult(cloud.content, prompt);
  const planning = shouldFallbackToLocalPlan(cloudPlan.request)
    ? buildLocalKnowledgePlan(prompt, chatHistory)
    : cloudPlan;
  const matchedLibraries = collectLibraryMatches(
    buildPromptForScoring(planning.request, chatHistory),
    documentLibraries,
  ).map((item) => ({ key: item.library.key, label: item.library.label }));

  const knowledgePlan: KnowledgePlan = {
    request: planning.request,
    libraries: matchedLibraries,
    outputType: planning.outputType,
  };

  const content = planning.request ? buildKnowledgePlanMessage() : buildNoPlanMessage();
  const output: ChatOutput = { type: 'answer', content };

  return {
    libraries: matchedLibraries,
    knowledgePlan,
    content,
    output,
    intent: 'report' as const,
    mode: 'openclaw' as const,
  };
}

export async function runChatOrchestrationV2(input: ChatRequestInput) {
  const prompt = String(input.prompt || '').trim();
  const chatHistory = normalizeHistory(input.chatHistory);
  const gatewayReachable = await isOpenClawGatewayReachable();
  const gatewayConfigured = gatewayReachable || isOpenClawGatewayConfigured();
  const traceId = `trace_${Date.now()}`;
  const requestMode = input.mode || 'general';

  let mode: 'openclaw' | 'fallback' = 'fallback';
  let content = buildCloudUnavailableAnswer();
  let output: ChatOutput = { type: 'answer', content };
  let intent: 'general' | 'report' = requestMode === 'general' ? 'general' : 'report';
  let libraries: Array<{ key: string; label: string }> = [];
  let fallbackReason = gatewayConfigured ? '' : 'cloud-gateway-not-configured';
  let knowledgePlan: KnowledgePlan | null = null;

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
          sessionUser: input.sessionUser,
          chatHistory,
        });
        libraries = result.libraries;
        output = result.output;
        content = result.content;
        intent = result.intent;
        mode = result.mode;
      } else {
        const cloud = await runOpenClawChat({
          prompt,
          sessionUser: input.sessionUser,
          chatHistory,
        });

        content = cloud.content;
        output = { type: 'answer', content };
        intent = 'general';
        mode = 'openclaw';
      }
    } catch (error) {
      fallbackReason = summarizeError(error);
      console.warn(`[chat:fallback] trace=${traceId} reason=${fallbackReason}`);
      content = buildCloudUnavailableAnswer();
      output = { type: 'answer', content };
      mode = 'fallback';
    }
  }

  return {
    mode,
    intent,
    needsKnowledge: requestMode !== 'general',
    libraries,
    output,
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
    conversationState: null,
    latencyMs: 120,
  };
}
