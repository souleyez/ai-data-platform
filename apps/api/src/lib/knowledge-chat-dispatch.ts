import { loadDocumentLibraries } from './document-libraries.js';
import { executeKnowledgeAnswer, executeKnowledgeOutput } from './knowledge-execution.js';
import {
  resolveKnowledgeChatRoute,
  type KnowledgeChatRouteKind,
  type KnowledgeEvidenceMode,
  type KnowledgeIntentContract,
} from './knowledge-chat-router.js';
import {
  explicitlyRejectsKnowledgeMode,
  isKnowledgeCancelPhrase,
} from './knowledge-intent.js';
import {
  parseKnowledgeConversationState,
  type KnowledgeConversationState,
} from './knowledge-request-state.js';
import { runOpenClawChat, tryRunOpenClawNativeWebSearchChat } from './openclaw-adapter.js';
import { buildWebSearchContextBlock, shouldUseWebSearchForPrompt } from './web-search.js';
import type { ChatOutput } from './knowledge-output.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type GeneralKnowledgeDispatchResult = {
  libraries: Array<{ key: string; label: string }>;
  content: string;
  output: ChatOutput;
  intent: 'general' | 'report';
  mode: 'openclaw';
  debug?: Record<string, unknown> | null;
  conversationState: KnowledgeConversationState | null;
  routeKind?: KnowledgeChatRouteKind;
  evidenceMode?: KnowledgeEvidenceMode | null;
  intentContract?: KnowledgeIntentContract | null;
};

async function runCloudChatWithSearchFallback(input: {
  prompt: string;
  chatHistory: ChatHistoryItem[];
  sessionUser?: string;
  systemContextBlocks?: string[];
}) {
  const { prompt, chatHistory, sessionUser, systemContextBlocks } = input;
  const needsWebSearch = shouldUseWebSearchForPrompt(prompt);
  const contextBlocks = [...(systemContextBlocks || [])];

  if (needsWebSearch) {
    const native = await tryRunOpenClawNativeWebSearchChat({
      prompt,
      sessionUser,
      chatHistory,
      contextBlocks,
    });
    if (native) return native;
  }

  const fallbackContext = needsWebSearch ? await buildWebSearchContextBlock(prompt) : '';
  return runOpenClawChat({
    prompt,
    sessionUser,
    chatHistory,
    contextBlocks: fallbackContext ? [...contextBlocks, fallbackContext] : contextBlocks,
  });
}

export async function runGeneralKnowledgeAwareChat(input: {
  prompt: string;
  chatHistory: ChatHistoryItem[];
  existingState: KnowledgeConversationState | null;
  sessionUser?: string;
  debugResumePage?: boolean;
  systemContextBlocks?: string[];
}): Promise<GeneralKnowledgeDispatchResult> {
  const { prompt, chatHistory, existingState, sessionUser, systemContextBlocks } = input;

  if (existingState && isKnowledgeCancelPhrase(prompt)) {
    const content = '已取消这次按库处理准备。你可以继续直接提问。';
    return {
      libraries: [],
      content,
      output: { type: 'answer', content },
      intent: 'general',
      mode: 'openclaw',
      debug: null,
      conversationState: null,
      routeKind: 'general',
      evidenceMode: null,
      intentContract: null,
    };
  }

  if (explicitlyRejectsKnowledgeMode(prompt)) {
    const cloud = await runCloudChatWithSearchFallback({
      prompt,
      sessionUser,
      chatHistory,
      systemContextBlocks,
    });

    return {
      libraries: [],
      content: cloud.content,
      output: { type: 'answer', content: cloud.content },
      intent: 'general',
      mode: 'openclaw',
      debug: null,
      conversationState: null,
      routeKind: 'general',
      evidenceMode: null,
      intentContract: null,
    };
  }

  const documentLibraries = await loadDocumentLibraries();
  const routeDecision = await resolveKnowledgeChatRoute({
    prompt,
    chatHistory,
    libraries: documentLibraries,
    sessionUser,
  });

  if (routeDecision.route === 'output') {
    const result = await executeKnowledgeOutput({
      prompt,
      confirmedRequest: routeDecision.contract.normalizedRequest || prompt,
      preferredLibraries: routeDecision.libraries,
      sessionUser,
      debugResumePage: input.debugResumePage === true,
      chatHistory,
    });

    return {
      libraries: result.libraries,
      content: result.content,
      output: result.output,
      intent: result.intent,
      mode: result.mode,
      debug: result.debug || null,
      conversationState: parseKnowledgeConversationState(input.existingState),
      routeKind: 'output',
      evidenceMode: routeDecision.evidenceMode,
      intentContract: routeDecision.contract,
    };
  }

  if (routeDecision.route === 'catalog' || routeDecision.route === 'detail') {
    const result = await executeKnowledgeAnswer({
      prompt: routeDecision.contract.normalizedRequest || prompt,
      preferredLibraries: routeDecision.libraries,
      sessionUser,
      chatHistory,
      answerMode: routeDecision.evidenceMode === 'catalog_memory'
        ? 'catalog_memory'
        : 'live_detail',
    });

    return {
      libraries: result.libraries,
      content: result.content,
      output: result.output,
      intent: result.intent,
      mode: result.mode,
      debug: null,
      conversationState: null,
      routeKind: routeDecision.route,
      evidenceMode: routeDecision.evidenceMode,
      intentContract: routeDecision.contract,
    };
  }

  const cloud = await runCloudChatWithSearchFallback({
    prompt,
    sessionUser,
    chatHistory,
    systemContextBlocks,
  });

  return {
    libraries: [],
    content: cloud.content,
    output: { type: 'answer', content: cloud.content },
    intent: 'general',
    mode: 'openclaw',
    debug: null,
    conversationState: null,
    routeKind: 'general',
    evidenceMode: null,
    intentContract: routeDecision.contract,
  };
}
