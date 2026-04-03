import { buildKnowledgeContext } from './knowledge-evidence.js';
import { buildTemplateConfirmationPayload, type TemplateConfirmationPayload } from './chat-template-confirmation.js';
import {
  prepareKnowledgeSupply,
  type KnowledgeLibraryRef,
} from './knowledge-supply.js';
import { runOpenClawChat, tryRunOpenClawNativeWebSearchChat } from './openclaw-adapter.js';
import { buildWebSearchContextBlock, shouldUseWebSearchForPrompt } from './web-search.js';
import type { ChatOutput } from './knowledge-output.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type GeneralKnowledgeDispatchResult = {
  libraries: KnowledgeLibraryRef[];
  content: string;
  output: ChatOutput;
  intent: 'general';
  mode: 'openclaw';
  debug?: Record<string, unknown> | null;
  conversationState: null;
  routeKind?: 'general' | 'template_confirmation';
  evidenceMode?: 'supply_only' | null;
  guard?: {
    requiresConfirmation: boolean;
    reason: string;
    confirmation: TemplateConfirmationPayload | null;
  } | null;
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
  existingState: unknown;
  sessionUser?: string;
  debugResumePage?: boolean;
  systemContextBlocks?: string[];
  skipTemplateConfirmation?: boolean;
}): Promise<GeneralKnowledgeDispatchResult> {
  const requestText = String(input.prompt || '').trim();
  const systemContextBlocks = [...(input.systemContextBlocks || [])];
  const supply = await prepareKnowledgeSupply({
    requestText,
    chatHistory: input.chatHistory,
    docLimit: 5,
    evidenceLimit: 6,
  });

  const knowledgeContext = supply.libraries.length
    ? buildKnowledgeContext(
      requestText,
      supply.libraries,
      supply.effectiveRetrieval,
      {},
      {
        maxDocuments: 5,
        maxEvidence: 5,
        includeExcerpt: false,
        maxClaimsPerDocument: 1,
        maxEvidenceChunksPerDocument: 1,
        maxStructuredProfileEntries: 4,
        maxStructuredArrayValues: 3,
        maxStructuredObjectEntries: 3,
      },
    )
    : '';
  const fullContextBlocks = [...systemContextBlocks, knowledgeContext].filter(Boolean);

  const confirmation = input.skipTemplateConfirmation
    ? null
    : await buildTemplateConfirmationPayload({
      prompt: requestText,
      chatHistory: input.chatHistory,
      sessionUser: input.sessionUser,
      supply,
      systemContextBlocks: fullContextBlocks,
    });

  if (confirmation) {
    const content = [
      '这次命中了库内资料模板输出。',
      '我不直接推进，先给你两个确认选项：一个按 OpenClaw 自己的理解执行，一个按命中资料和模板输出。',
      '请直接点选其中一个继续。',
    ].join('\n\n');

    return {
      libraries: supply.libraries,
      content,
      output: { type: 'answer', content },
      intent: 'general',
      mode: 'openclaw',
      debug: {
        supplyDocuments: supply.effectiveRetrieval.documents.length,
        supplyEvidence: supply.effectiveRetrieval.evidenceMatches.length,
      },
      conversationState: null,
      routeKind: 'template_confirmation',
      evidenceMode: 'supply_only',
      guard: {
        requiresConfirmation: true,
        reason: 'template_output_confirmation',
        confirmation,
      },
    };
  }

  const cloud = await runCloudChatWithSearchFallback({
    prompt: requestText,
    sessionUser: input.sessionUser,
    chatHistory: input.chatHistory,
    systemContextBlocks: fullContextBlocks,
  });

  return {
    libraries: supply.libraries,
    content: cloud.content,
    output: { type: 'answer', content: cloud.content },
    intent: 'general',
    mode: 'openclaw',
    debug: {
      supplyDocuments: supply.effectiveRetrieval.documents.length,
      supplyEvidence: supply.effectiveRetrieval.evidenceMatches.length,
      searchEnabledByDefault: true,
      nativeSearchPreferred: true,
    },
    conversationState: null,
    routeKind: 'general',
    evidenceMode: 'supply_only',
    guard: {
      requiresConfirmation: false,
      reason: '',
      confirmation: null,
    },
  };
}
