import { retrieveKnowledgeMatches } from './document-retrieval.js';
import { buildDocumentId } from './document-store.js';
import type { BotDefinition } from './bot-definitions.js';
import {
  buildKnowledgeRetrievalQuery,
  buildLibraryFallbackRetrieval,
} from './knowledge-evidence.js';
import type { KnowledgeTemplateTaskHint } from './knowledge-template.js';
import { buildConceptPageSupplyBlock } from './knowledge-supply-concept.js';
import { prepareKnowledgeScope } from './knowledge-supply-scope.js';
import type {
  ChatHistoryItem,
  KnowledgeLibraryRef,
  KnowledgeScopeState,
  KnowledgeSupply,
} from './knowledge-supply-types.js';

export type { ChatHistoryItem, KnowledgeLibraryRef, KnowledgeScopeState, KnowledgeSupply } from './knowledge-supply-types.js';
export { buildConceptPageSupplyBlock } from './knowledge-supply-concept.js';
export { buildKnowledgeChatHistory, normalizePreferredLibraries, prepareKnowledgeScope } from './knowledge-supply-scope.js';

export async function prepareKnowledgeRetrieval(input: KnowledgeScopeState & {
  requestText: string;
  timeRange?: string;
  contentFocus?: string;
  docLimit: number;
  evidenceLimit: number;
  templateTaskHint?: KnowledgeTemplateTaskHint | null;
  templateSearchHints?: string[];
  preferredDocumentIds?: string[];
}): Promise<KnowledgeSupply> {
  const preferredDocumentIds = Array.isArray(input.preferredDocumentIds)
    ? input.preferredDocumentIds.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const preferredDocumentSet = new Set(preferredDocumentIds);
  const memoryScopedItems = preferredDocumentSet.size
    ? input.scopedItems.filter((item) => preferredDocumentSet.has(buildDocumentId(item.path)))
    : [];
  const retrievalScopedItems = memoryScopedItems.length ? memoryScopedItems : input.scopedItems;

  const retrieval = await retrieveKnowledgeMatches(
    retrievalScopedItems,
    buildKnowledgeRetrievalQuery(input.requestText, input.libraries, {
      timeRange: input.timeRange,
      contentFocus: input.contentFocus,
    }),
    {
      docLimit: input.docLimit,
      evidenceLimit: input.evidenceLimit,
      templateTaskHint: input.templateTaskHint || undefined,
      templateSearchHints: input.templateSearchHints,
    },
  );

  const effectiveRetrieval =
    retrieval.documents.length || retrieval.evidenceMatches.length
      ? retrieval
      : {
          ...(() => {
            const fallback = buildLibraryFallbackRetrieval(retrievalScopedItems);
            return {
              ...fallback,
              evidenceMatches: fallback.evidenceMatches.map((entry, index) => ({
                ...entry,
                chunkId: `fallback-${index + 1}`,
              })),
            };
          })(),
          meta: {
            ...retrieval.meta,
            candidateCount: retrievalScopedItems.length,
            rerankedCount: Math.min(retrievalScopedItems.length, 6),
          },
        };

  return {
    knowledgeChatHistory: input.knowledgeChatHistory,
    libraries: input.libraries,
    effectiveRetrieval,
  };
}

export async function prepareKnowledgeSupply(input: {
  requestText: string;
  chatHistory: ChatHistoryItem[];
  preferredLibraries?: KnowledgeLibraryRef[];
  timeRange?: string;
  contentFocus?: string;
  docLimit: number;
  evidenceLimit: number;
  templateTaskHint?: KnowledgeTemplateTaskHint | null;
  templateSearchHints?: string[];
  preferredDocumentIds?: string[];
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
}): Promise<KnowledgeSupply> {
  const scopeState = await prepareKnowledgeScope(input);
  return prepareKnowledgeRetrieval({
    requestText: input.requestText,
    timeRange: input.timeRange,
    contentFocus: input.contentFocus,
    docLimit: input.docLimit,
    evidenceLimit: input.evidenceLimit,
    templateTaskHint: input.templateTaskHint,
    templateSearchHints: input.templateSearchHints,
    preferredDocumentIds: input.preferredDocumentIds,
    ...scopeState,
  });
}
