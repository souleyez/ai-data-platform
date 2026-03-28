import { loadDocumentLibraries } from './document-libraries.js';
import {
  buildKnowledgeDocumentContext,
  buildRecentUploadedContext,
  inferKnowledgeLibraries,
  looksLikeDocumentDetailFollowup,
} from './knowledge-context.js';
import { executeKnowledgeAnswer, executeKnowledgeOutput } from './knowledge-execution.js';
import {
  explicitlyRejectsKnowledgeMode,
  isKnowledgeCancelPhrase,
  looksLikeKnowledgeAnswerIntent,
  looksLikeKnowledgeOutputIntent,
} from './knowledge-intent.js';
import {
  extractExplicitKnowledgeFocus,
  extractNormalizedContentFocus,
  extractNormalizedTimeRange,
  type KnowledgeConversationState,
} from './knowledge-request-state.js';
import { runOpenClawChat } from './openclaw-adapter.js';
import type { ChatOutput } from './knowledge-output.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type GeneralKnowledgeDispatchResult = {
  libraries: Array<{ key: string; label: string }>;
  content: string;
  output: ChatOutput;
  intent: 'general' | 'report';
  mode: 'openclaw';
  conversationState: KnowledgeConversationState | null;
};

function resolveContentFocus(prompt: string) {
  return extractExplicitKnowledgeFocus(prompt) || extractNormalizedContentFocus(prompt);
}

function dedupeContextBlocks(blocks: string[]) {
  return [...new Set(blocks.map((item) => String(item || '').trim()).filter(Boolean))];
}

function buildDocumentLibraryRefs(documents: Array<{
  groups?: string[];
  confirmedGroups?: string[];
  bizCategory?: string;
  schemaType?: string;
}>) {
  const refs = new Map<string, { key: string; label: string }>();

  for (const item of documents) {
    const groups = [...(item.confirmedGroups || []), ...(item.groups || [])].filter(Boolean);
    if (groups.length) {
      for (const group of groups) {
        if (!refs.has(group)) refs.set(group, { key: group, label: group });
      }
      continue;
    }

    const fallback = item.bizCategory || item.schemaType || 'document';
    if (!refs.has(fallback)) refs.set(fallback, { key: fallback, label: fallback });
  }

  return Array.from(refs.values()).slice(0, 4);
}

export async function runGeneralKnowledgeAwareChat(input: {
  prompt: string;
  chatHistory: ChatHistoryItem[];
  existingState: KnowledgeConversationState | null;
  sessionUser?: string;
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
      conversationState: null,
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
      conversationState: null,
    };
  }

  const documentLibraries = await loadDocumentLibraries();
  const inferredLibraries = await inferKnowledgeLibraries(prompt, chatHistory, documentLibraries);
  const hasDocumentDetailFollowup = looksLikeDocumentDetailFollowup(prompt, chatHistory);
  const timeRange = extractNormalizedTimeRange(prompt);
  const contentFocus = resolveContentFocus(prompt);

  if (looksLikeKnowledgeOutputIntent({
    prompt,
    libraries: inferredLibraries,
    hasDocumentDetailFollowup,
  })) {
    const result = await executeKnowledgeOutput({
      prompt,
      confirmedRequest: prompt,
      preferredLibraries: inferredLibraries,
      timeRange,
      contentFocus,
      sessionUser,
      chatHistory,
    });

    return {
      libraries: result.libraries,
      content: result.content,
      output: result.output,
      intent: result.intent,
      mode: result.mode,
      conversationState: null,
    };
  }

  if (looksLikeKnowledgeAnswerIntent({
    prompt,
    libraries: inferredLibraries,
    hasDocumentDetailFollowup,
  })) {
    const result = await executeKnowledgeAnswer({
      prompt,
      preferredLibraries: inferredLibraries,
      timeRange,
      contentFocus,
      sessionUser,
      chatHistory,
    });

    return {
      libraries: result.libraries,
      content: result.content,
      output: result.output,
      intent: result.intent,
      mode: result.mode,
      conversationState: null,
    };
  }

  const [documentFollowup, recentUploadedContext] = await Promise.all([
    buildKnowledgeDocumentContext(prompt, chatHistory),
    buildRecentUploadedContext(),
  ]);
  const followupPaths = new Set(documentFollowup.documents.map((item) => item.path));
  const recentLibraryRefs = buildDocumentLibraryRefs(
    recentUploadedContext.documents.filter((item) => !followupPaths.has(item.path)),
  );
  const cloud = await runOpenClawChat({
    prompt,
    sessionUser,
    chatHistory,
    contextBlocks: dedupeContextBlocks([
      ...documentFollowup.contextBlocks,
      ...recentUploadedContext.contextBlocks,
    ]),
  });

  return {
    libraries: [...buildDocumentLibraryRefs(documentFollowup.documents), ...recentLibraryRefs].slice(0, 4),
    content: cloud.content,
    output: { type: 'answer', content: cloud.content },
    intent: 'general',
    mode: 'openclaw',
    conversationState: null,
  };
}
