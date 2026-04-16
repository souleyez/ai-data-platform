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
  buildOpenClawLongTermMemoryContextBlock,
  buildOpenClawLongTermMemoryDirectAnswer,
  shouldAnswerFromOpenClawLongTermMemoryDirectory,
} from './openclaw-memory-directory.js';
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
import {
  appendReference,
  buildAnswerReferences,
  runCloudChatWithSearchFallback,
} from './knowledge-chat-dispatch-support.js';
import { prepareGeneralKnowledgeMemoryContext } from './knowledge-chat-dispatch-memory.js';
import {
  buildCloudDispatchResult,
  buildDirectDirectoryAnswerResult,
  buildDocumentNotReadyResult,
  buildTemplateConfirmationResult,
} from './knowledge-chat-dispatch-results.js';
import type {
  ChatHistoryItem,
  GeneralKnowledgeDispatchResult,
} from './knowledge-chat-dispatch-types.js';

export {
  buildLatestParsedDocumentFullTextContextBlock,
  loadLatestVisibleDetailedDocumentContext,
  selectLatestDetailedFullTextDocument,
  shouldIncludeUploadedDocumentFullText,
} from './knowledge-chat-dispatch-doc-context.js';

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
  const {
    useExternalScopedMemory,
    catalogSnapshot,
    requestedLongTermMemoryLibraries,
    memorySelection,
  } = await prepareGeneralKnowledgeMemoryContext({
    requestText,
    botDefinition: input.botDefinition,
    effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
    accessContext: input.accessContext || null,
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
    return buildDirectDirectoryAnswerResult({
      libraries: scopeState.libraries,
      content: directDirectoryAnswer,
      memorySelectedDocuments: memorySelection.documentIds.length,
      catalogSnapshot,
      requestedLongTermMemoryLibraries,
      preferredDocumentPath,
      botDefinition: input.botDefinition,
      effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
      accessContext: input.accessContext || null,
      conversationState: generalState,
    });
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
    return buildDocumentNotReadyResult({
      libraries: supply.libraries,
      references: buildAnswerReferences(supply.effectiveRetrieval.documents),
      memorySelectedDocuments: memorySelection.documentIds.length,
      catalogSnapshot,
      matchedSupplyDocuments: supply.effectiveRetrieval.documents.length,
      matchedSupplyEvidence: supply.effectiveRetrieval.evidenceMatches.length,
      matchedFullTextDocuments: matchedDocumentFullTextBlocks.length,
      preferredDocumentPath,
      preferredDocumentStatus,
      botDefinition: input.botDefinition,
      effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
      accessContext: input.accessContext || null,
      conversationState,
    });
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
    return buildTemplateConfirmationResult({
      libraries: supply.libraries,
      references,
      memorySelectedDocuments: memorySelection.documentIds.length,
      catalogSnapshot,
      matchedSupplyDocuments: supply.effectiveRetrieval.documents.length,
      matchedSupplyEvidence: supply.effectiveRetrieval.evidenceMatches.length,
      matchedFullTextDocuments: matchedDocumentFullTextBlocks.length,
      latestDetailedDocumentPath: latestDetailedDocument?.path || '',
      preferredDocumentPath,
      latestDocumentFullTextIncluded,
      preferredDocumentStatus,
      botDefinition: input.botDefinition,
      effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
      accessContext: input.accessContext || null,
      conversationState,
      confirmation,
    });
  }

  const cloud = await runCloudChatWithSearchFallback({
    prompt: requestText,
    sessionUser: input.sessionUser,
    chatHistory: input.chatHistory,
    systemContextBlocks: chatContextBlocks,
    cloudTimeoutMs: input.cloudTimeoutMs,
  });

  return buildCloudDispatchResult({
    libraries: supply.libraries,
    content: cloud.content,
    references,
    memorySelectedDocuments: memorySelection.documentIds.length,
    catalogSnapshot,
    matchedSupplyDocuments: supply.effectiveRetrieval.documents.length,
    matchedSupplyEvidence: supply.effectiveRetrieval.evidenceMatches.length,
    matchedFullTextDocuments: matchedDocumentFullTextBlocks.length,
    latestDetailedDocumentPath: latestDetailedDocument?.path || '',
    preferredDocumentPath,
    latestDocumentFullTextIncluded,
    preferredDocumentStatus,
    botDefinition: input.botDefinition,
    effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
    accessContext: input.accessContext || null,
    conversationState,
  });
}
