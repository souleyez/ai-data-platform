import path from 'node:path';
import { buildKnowledgeContext } from './knowledge-evidence.js';
import { buildLibraryKnowledgePagesContextBlock } from './library-knowledge-pages.js';
import { buildTemplateConfirmationPayload, type TemplateConfirmationPayload } from './chat-template-confirmation.js';
import {
  prepareKnowledgeRetrieval,
  prepareKnowledgeScope,
  type KnowledgeLibraryRef,
} from './knowledge-supply.js';
import type { BotDefinition } from './bot-definitions.js';
import { filterDocumentsForBot } from './bot-visibility.js';
import type { ParsedDocument } from './document-parser.js';
import { documentMatchesLibrary, loadDocumentLibraries } from './document-libraries.js';
import { buildDocumentId, loadParsedDocuments } from './document-store.js';
import {
  loadOpenClawMemorySelectionState,
  selectOpenClawMemoryDocumentCandidatesFromState,
} from './openclaw-memory-selection.js';
import { loadOpenClawMemoryCatalogSnapshot } from './openclaw-memory-catalog.js';
import {
  buildOpenClawLongTermMemoryContextBlock,
  buildOpenClawLongTermMemoryDirectAnswer,
  resolveOpenClawLongTermMemoryRequestedLibraries,
  shouldAnswerFromOpenClawLongTermMemoryDirectory,
} from './openclaw-memory-directory.js';
import { runOpenClawChat, tryRunOpenClawNativeWebSearchChat } from './openclaw-adapter.js';
import { buildWebSearchContextBlock, shouldUseWebSearchForPrompt } from './web-search.js';
import type { ChatOutput } from './knowledge-output.js';
import type { ResolvedChannelAccess } from './channel-access-resolver.js';
import {
  buildLatestParsedDocumentFullTextContextBlock,
  buildMatchedDocumentFullTextContextBlocks,
  loadLatestVisibleDetailedDocumentContext,
  selectLatestDetailedFullTextDocument,
  shouldIncludeUploadedDocumentFullText,
} from './knowledge-chat-dispatch-doc-context.js';
import {
  parseGeneralKnowledgeConversationState,
} from './knowledge-request-state.js';

export {
  buildLatestParsedDocumentFullTextContextBlock,
  loadLatestVisibleDetailedDocumentContext,
  selectLatestDetailedFullTextDocument,
  shouldIncludeUploadedDocumentFullText,
} from './knowledge-chat-dispatch-doc-context.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type GeneralKnowledgeDispatchResult = {
  libraries: KnowledgeLibraryRef[];
  content: string;
  output: ChatOutput;
  references: Array<{ id: string; name: string; path: string }>;
  intent: 'general';
  mode: 'openclaw';
  debug?: Record<string, unknown> | null;
  conversationState: ReturnType<typeof parseGeneralKnowledgeConversationState>;
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
  cloudTimeoutMs?: number;
}) {
  const { prompt, chatHistory, sessionUser, systemContextBlocks, cloudTimeoutMs } = input;
  const needsWebSearch = shouldUseWebSearchForPrompt(prompt);
  const contextBlocks = [...(systemContextBlocks || [])];

  if (needsWebSearch) {
    const native = await tryRunOpenClawNativeWebSearchChat({
      prompt,
      sessionUser,
      chatHistory,
      contextBlocks,
      timeoutMs: cloudTimeoutMs,
    });
    if (native) return native;
  }

  const fallbackContext = needsWebSearch ? await buildWebSearchContextBlock(prompt) : '';
  return runOpenClawChat({
    prompt,
    sessionUser,
    chatHistory,
    contextBlocks: fallbackContext ? [...contextBlocks, fallbackContext] : contextBlocks,
    timeoutMs: cloudTimeoutMs,
    preferResponses: true,
  });
}

function buildAnswerReferences(documents: Array<{ path?: string; title?: string; name?: string }>) {
  const references: Array<{ id: string; name: string; path: string }> = [];
  const seen = new Set<string>();

  for (const item of documents || []) {
    const filePath = String(item?.path || '').trim();
    if (!filePath) continue;
    const id = buildDocumentId(filePath);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    references.push({
      id,
      name: String(item?.title || item?.name || path.basename(filePath)).trim() || id,
      path: filePath,
    });
  }

  return references.slice(0, 6);
}

function appendReference(
  references: Array<{ id: string; name: string; path: string }>,
  item?: { path?: string; title?: string; name?: string } | null,
) {
  const filePath = String(item?.path || '').trim();
  if (!filePath) return references;
  const id = buildDocumentId(filePath);
  if (!id || references.some((entry) => entry.id === id)) return references;
  return [
    ...references,
    {
      id,
      name: String(item?.title || item?.name || path.basename(filePath)).trim() || id,
      path: filePath,
    },
  ].slice(0, 6);
}

export async function runGeneralKnowledgeAwareChat(input: {
  prompt: string;
  chatHistory: ChatHistoryItem[];
  existingState: unknown;
  sessionUser?: string;
  debugResumePage?: boolean;
  systemContextBlocks?: string[];
  skipTemplateConfirmation?: boolean;
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
  cloudTimeoutMs?: number;
  preferredDocumentPath?: string;
}): Promise<GeneralKnowledgeDispatchResult> {
  const requestText = String(input.prompt || '').trim();
  const systemContextBlocks = [...(input.systemContextBlocks || [])];
  const generalState = parseGeneralKnowledgeConversationState(input.existingState);
  const preferredDocumentPath = String(input.preferredDocumentPath || generalState?.preferredDocumentPath || '').trim();
  const useExternalScopedMemory = input.accessContext?.source === 'external-directory';
  const catalogSnapshot = await loadOpenClawMemoryCatalogSnapshot();
  const requestedLongTermMemoryLibraries = resolveOpenClawLongTermMemoryRequestedLibraries({
    snapshot: catalogSnapshot,
    requestText,
    effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
  });
  const memoryState = await loadOpenClawMemorySelectionState({
    botId: input.botDefinition?.id,
    forceGlobalState: useExternalScopedMemory,
  });
  const memorySelection = selectOpenClawMemoryDocumentCandidatesFromState({
    state: memoryState,
    requestText,
    limit: 5,
    effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
  });
  const scopeState = await prepareKnowledgeScope({
    requestText,
    chatHistory: input.chatHistory,
    preferredDocumentIds: memorySelection.documentIds,
    botDefinition: input.botDefinition,
    effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
  });
  const directDirectoryAnswer = shouldAnswerFromOpenClawLongTermMemoryDirectory(requestText)
    ? buildOpenClawLongTermMemoryDirectAnswer({
      snapshot: catalogSnapshot,
      requestText,
      libraries: requestedLongTermMemoryLibraries.length ? requestedLongTermMemoryLibraries : undefined,
      effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
    })
    : '';

  if (directDirectoryAnswer) {
    return {
      libraries: scopeState.libraries,
      content: directDirectoryAnswer,
      output: { type: 'answer', content: directDirectoryAnswer },
      references: [],
      intent: 'general',
      mode: 'openclaw',
      debug: {
        memorySelectedDocuments: memorySelection.documentIds.length,
        catalogMemoryLibraries: requestedLongTermMemoryLibraries.length || catalogSnapshot?.libraryCount || 0,
        catalogMemoryDocuments: catalogSnapshot?.documentCount || 0,
        catalogMemoryOutputs: catalogSnapshot?.outputCount || 0,
        matchedSupplyDocuments: 0,
        matchedSupplyEvidence: 0,
        matchedFullTextDocuments: 0,
        latestDetailedDocument: '',
        preferredDocumentPath,
        latestDocumentFullTextIncluded: false,
        preferredDocumentStatus: preferredDocumentPath ? 'skipped' : 'none',
        botId: input.botDefinition?.id || '',
        botName: input.botDefinition?.name || '',
        visibleLibraries: Array.isArray(input.effectiveVisibleLibraryKeys)
          ? input.effectiveVisibleLibraryKeys
          : (input.botDefinition?.visibleLibraryKeys || []),
        accessContext: input.accessContext || null,
        longTermDirectoryAnswerUsed: true,
      },
      conversationState: generalState,
      routeKind: 'general',
      evidenceMode: 'supply_only',
      guard: {
        requiresConfirmation: false,
        reason: '',
        confirmation: null,
      },
    };
  }

  const supply = await prepareKnowledgeRetrieval({
    requestText,
    docLimit: 5,
    evidenceLimit: 6,
    preferredDocumentIds: memorySelection.documentIds,
    ...scopeState,
  });
  const shouldIncludeLatestDocumentFullText = shouldIncludeUploadedDocumentFullText(
    requestText,
    preferredDocumentPath,
  );
  const latestDetailedDocumentContext = shouldIncludeLatestDocumentFullText
    ? await loadLatestVisibleDetailedDocumentContext({
      botDefinition: input.botDefinition,
      effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
      preferredDocumentPath,
    })
    : { document: null, libraries: [], preferredDocument: null, preferredDocumentReady: false };
  const latestDetailedDocument = latestDetailedDocumentContext.document;
  const conversationState = generalState;
  const latestDocumentFullTextIncluded = Boolean(latestDetailedDocument && shouldIncludeLatestDocumentFullText);
  const matchedDocumentFullTextBlocks = buildMatchedDocumentFullTextContextBlocks({
    documents: supply.effectiveRetrieval.documents,
    preferredDocumentPath,
  });
  const preferredDocumentStatus = !preferredDocumentPath
    ? 'none'
    : latestDetailedDocumentContext.preferredDocumentReady
      ? 'ready'
      : (latestDetailedDocumentContext.preferredDocument ? 'not_ready' : 'missing');
  const longTermMemoryContextBlock = buildOpenClawLongTermMemoryContextBlock({
    snapshot: catalogSnapshot,
    libraries: requestedLongTermMemoryLibraries.length ? requestedLongTermMemoryLibraries : undefined,
    effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
  });

  const templateKnowledgeContext = supply.effectiveRetrieval.documents.length || supply.effectiveRetrieval.evidenceMatches.length
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
  const libraryKnowledgePagesContext = await buildLibraryKnowledgePagesContextBlock(supply.libraries);
  const templateContextBlocks = [
    ...systemContextBlocks,
    longTermMemoryContextBlock,
    libraryKnowledgePagesContext,
    templateKnowledgeContext,
  ].filter(Boolean);
  const latestDocumentFullTextBlock = shouldIncludeLatestDocumentFullText
    ? buildLatestParsedDocumentFullTextContextBlock(latestDetailedDocument)
    : '';
  const chatContextBlocks = [
    ...systemContextBlocks,
    longTermMemoryContextBlock,
    ...matchedDocumentFullTextBlocks,
    latestDocumentFullTextBlock,
  ].filter(Boolean);
  const references = appendReference(buildAnswerReferences(supply.effectiveRetrieval.documents), latestDetailedDocument);

  if (shouldIncludeLatestDocumentFullText && !latestDetailedDocument) {
    const content = '该文档还在解析，详细正文尚未就绪，请稍后再试。';
    return {
      libraries: supply.libraries,
      content,
      output: { type: 'answer', content },
      references: buildAnswerReferences(supply.effectiveRetrieval.documents),
      intent: 'general',
      mode: 'openclaw',
      debug: {
        memorySelectedDocuments: memorySelection.documentIds.length,
        catalogMemoryLibraries: supply.libraries.length,
        catalogMemoryDocuments: catalogSnapshot?.documentCount || 0,
        catalogMemoryOutputs: catalogSnapshot?.outputCount || 0,
        matchedSupplyDocuments: supply.effectiveRetrieval.documents.length,
        matchedSupplyEvidence: supply.effectiveRetrieval.evidenceMatches.length,
        matchedFullTextDocuments: matchedDocumentFullTextBlocks.length,
        latestDetailedDocument: '',
        preferredDocumentPath,
        latestDocumentFullTextIncluded: false,
        preferredDocumentStatus,
        botId: input.botDefinition?.id || '',
        botName: input.botDefinition?.name || '',
        visibleLibraries: Array.isArray(input.effectiveVisibleLibraryKeys)
          ? input.effectiveVisibleLibraryKeys
          : (input.botDefinition?.visibleLibraryKeys || []),
        accessContext: input.accessContext || null,
      },
      conversationState,
      routeKind: 'general',
      evidenceMode: 'supply_only',
      guard: {
        requiresConfirmation: false,
        reason: '',
        confirmation: null,
      },
    };
  }

  const confirmation = input.skipTemplateConfirmation
    ? null
    : await buildTemplateConfirmationPayload({
      prompt: requestText,
      chatHistory: input.chatHistory,
      sessionUser: input.sessionUser,
      supply,
      systemContextBlocks: templateContextBlocks,
    });

  if (confirmation) {
    const content = [
      '这次命中了库内资料模板输出。',
      '我不直接推进，先给你两个确认选项：一个按智能助手自己的理解执行，一个按命中资料和模板输出。',
      '请直接点选其中一个继续。',
    ].join('\n\n');

    return {
      libraries: supply.libraries,
      content,
      output: { type: 'answer', content },
      references,
      intent: 'general',
      mode: 'openclaw',
      debug: {
      memorySelectedDocuments: memorySelection.documentIds.length,
      catalogMemoryLibraries: supply.libraries.length,
      catalogMemoryDocuments: catalogSnapshot?.documentCount || 0,
      catalogMemoryOutputs: catalogSnapshot?.outputCount || 0,
      matchedSupplyDocuments: supply.effectiveRetrieval.documents.length,
      matchedSupplyEvidence: supply.effectiveRetrieval.evidenceMatches.length,
      matchedFullTextDocuments: matchedDocumentFullTextBlocks.length,
      latestDetailedDocument: latestDetailedDocument?.path || '',
      preferredDocumentPath,
      latestDocumentFullTextIncluded,
      preferredDocumentStatus,
      botId: input.botDefinition?.id || '',
      botName: input.botDefinition?.name || '',
      visibleLibraries: Array.isArray(input.effectiveVisibleLibraryKeys)
        ? input.effectiveVisibleLibraryKeys
        : (input.botDefinition?.visibleLibraryKeys || []),
      accessContext: input.accessContext || null,
    },
      conversationState,
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
    systemContextBlocks: chatContextBlocks,
    cloudTimeoutMs: input.cloudTimeoutMs,
  });

  return {
    libraries: supply.libraries,
    content: cloud.content,
    output: { type: 'answer', content: cloud.content },
    references,
    intent: 'general',
    mode: 'openclaw',
    debug: {
      memorySelectedDocuments: memorySelection.documentIds.length,
      catalogMemoryLibraries: supply.libraries.length,
      catalogMemoryDocuments: catalogSnapshot?.documentCount || 0,
      catalogMemoryOutputs: catalogSnapshot?.outputCount || 0,
      matchedSupplyDocuments: supply.effectiveRetrieval.documents.length,
      matchedSupplyEvidence: supply.effectiveRetrieval.evidenceMatches.length,
      matchedFullTextDocuments: matchedDocumentFullTextBlocks.length,
      searchEnabledByDefault: true,
      nativeSearchPreferred: true,
      latestDetailedDocument: latestDetailedDocument?.path || '',
      preferredDocumentPath,
      latestDocumentFullTextIncluded,
      preferredDocumentStatus,
      botId: input.botDefinition?.id || '',
      botName: input.botDefinition?.name || '',
      visibleLibraries: Array.isArray(input.effectiveVisibleLibraryKeys)
        ? input.effectiveVisibleLibraryKeys
        : (input.botDefinition?.visibleLibraryKeys || []),
      accessContext: input.accessContext || null,
    },
    conversationState,
    routeKind: 'general',
    evidenceMode: 'supply_only',
    guard: {
      requiresConfirmation: false,
      reason: '',
      confirmation: null,
    },
  };
}
