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
import {
  buildKnowledgeCatalogPrompt,
} from './knowledge-prompts.js';
import { runOpenClawChat } from './openclaw-adapter.js';
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

function buildCatalogContextBlock(
  libraries: Array<{ key: string; label: string }>,
  contract: KnowledgeIntentContract,
) {
  const libraryText = libraries.length
    ? libraries.map((item) => item.label || item.key).join('、')
    : '当前知识目录';

  return [
    `Current route: catalog`,
    `Evidence state: catalog_memory`,
    `Preferred libraries: ${libraryText}`,
    `Target scope: ${contract.targetScope}`,
    `Normalized request: ${contract.normalizedRequest}`,
  ].join('\n');
}

export async function runGeneralKnowledgeAwareChat(input: {
  prompt: string;
  chatHistory: ChatHistoryItem[];
  existingState: KnowledgeConversationState | null;
  sessionUser?: string;
  debugResumePage?: boolean;
}): Promise<GeneralKnowledgeDispatchResult> {
  const { prompt, chatHistory, existingState, sessionUser } = input;

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
    const cloud = await runOpenClawChat({
      prompt,
      sessionUser,
      chatHistory,
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

  if (routeDecision.route === 'detail') {
    const result = await executeKnowledgeAnswer({
      prompt: routeDecision.contract.normalizedRequest || prompt,
      preferredLibraries: routeDecision.libraries,
      sessionUser,
      chatHistory,
    });

    return {
      libraries: result.libraries,
      content: result.content,
      output: result.output,
      intent: result.intent,
      mode: result.mode,
      debug: null,
      conversationState: null,
      routeKind: 'detail',
      evidenceMode: routeDecision.evidenceMode,
      intentContract: routeDecision.contract,
    };
  }

  if (routeDecision.route === 'catalog') {
    const cloud = await runOpenClawChat({
      prompt: routeDecision.contract.normalizedRequest || prompt,
      sessionUser,
      chatHistory,
      systemPrompt: buildKnowledgeCatalogPrompt(),
      contextBlocks: [
        buildCatalogContextBlock(routeDecision.libraries, routeDecision.contract),
      ],
    });

    return {
      libraries: routeDecision.libraries,
      content: cloud.content,
      output: { type: 'answer', content: cloud.content },
      intent: routeDecision.libraries.length ? 'report' : 'general',
      mode: 'openclaw',
      debug: null,
      conversationState: null,
      routeKind: 'catalog',
      evidenceMode: routeDecision.evidenceMode,
      intentContract: routeDecision.contract,
    };
  }

  const cloud = await runOpenClawChat({
    prompt,
    sessionUser,
    chatHistory,
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
