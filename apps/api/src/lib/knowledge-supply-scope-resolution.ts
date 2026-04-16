import type { BotDefinition } from './bot-definitions.js';
import { filterDocumentsForBot, filterLibrariesForBot } from './bot-visibility.js';
import { documentMatchesLibrary, loadDocumentLibraries, UNGROUPED_LIBRARY_KEY, UNGROUPED_LIBRARY_LABEL } from './document-libraries.js';
import { buildDocumentId, loadParsedDocuments } from './document-store.js';
import { filterDocumentsByContentFocus, filterDocumentsByTimeRange } from './knowledge-evidence.js';
import { buildPromptForScoring, collectLibraryMatches } from './knowledge-plan.js';
import type { ChatHistoryItem, KnowledgeLibraryRef } from './knowledge-supply-types.js';
import { buildFallbackScopedItems, prioritizeScopedItems } from './knowledge-supply-scope-fallback.js';
import { deriveScopedLibrariesFromItems } from './knowledge-supply-scope-libraries.js';

export type PrepareKnowledgeScopeInput = {
  requestText: string;
  chatHistory: ChatHistoryItem[];
  preferredLibraries?: KnowledgeLibraryRef[];
  timeRange?: string;
  contentFocus?: string;
  preferredDocumentIds?: string[];
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
};

export async function resolveKnowledgeScope(
  requestText: string,
  chatHistory: ChatHistoryItem[],
  preferredLibraries: KnowledgeLibraryRef[],
  timeRange?: string,
  contentFocus?: string,
  preferredDocumentIds?: string[],
  botDefinition?: BotDefinition | null,
  effectiveVisibleLibraryKeys?: string[],
) {
  const [documentLibraries, documentState] = await Promise.all([
    loadDocumentLibraries(),
    loadParsedDocuments(240, false),
  ]);
  const preferredDocumentSet = new Set(
    Array.isArray(preferredDocumentIds)
      ? preferredDocumentIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  );
  const baseVisibleLibraries = botDefinition
    ? filterLibrariesForBot(botDefinition, documentLibraries)
    : documentLibraries;
  const baseVisibleItems = botDefinition
    ? filterDocumentsForBot(botDefinition, documentState.items, documentLibraries)
    : documentState.items;
  const effectiveVisibleLibrarySet = Array.isArray(effectiveVisibleLibraryKeys)
    ? new Set(effectiveVisibleLibraryKeys.map((item) => String(item || '').trim()).filter(Boolean))
    : null;
  const visibleLibraries = effectiveVisibleLibrarySet
    ? baseVisibleLibraries.filter((library) => effectiveVisibleLibrarySet.has(library.key))
    : baseVisibleLibraries;
  const visibleItems = effectiveVisibleLibrarySet
    ? baseVisibleItems.filter((item) => visibleLibraries.some((library) => documentMatchesLibrary(item, library)))
    : baseVisibleItems;

  if (effectiveVisibleLibrarySet && !visibleLibraries.length) {
    return { libraries: [], scopedItems: [] };
  }

  const preferredKeys = new Set(preferredLibraries.map((item) => item.key));
  const preferredLabels = new Set(preferredLibraries.map((item) => item.label));
  const scoringPrompt = buildPromptForScoring(requestText, chatHistory);
  const preferredCandidates = preferredKeys.size || preferredLabels.size
    ? documentLibraries
        .filter((library) => preferredKeys.has(library.key) || preferredLabels.has(library.label))
        .map((library, index) => ({ library, score: 100 - index }))
    : [];
  const requestedCandidates = preferredCandidates.length
    ? preferredCandidates
    : collectLibraryMatches(scoringPrompt, documentLibraries);
  const visibleLibraryKeySet = new Set(visibleLibraries.map((library) => library.key));
  const visibleRequestedCandidates = requestedCandidates.filter((item) => visibleLibraryKeySet.has(item.library.key));
  const requestTargetsInvisibleLibraries = requestedCandidates.length > 0 && !visibleRequestedCandidates.length;

  if (requestTargetsInvisibleLibraries) {
    return { libraries: [], scopedItems: [] };
  }

  const scoredCandidates = preferredCandidates.length ? [] : collectLibraryMatches(scoringPrompt, visibleLibraries);
  const candidates = visibleRequestedCandidates.length ? visibleRequestedCandidates : scoredCandidates;
  let libraries = candidates.map((item) => ({ key: item.library.key, label: item.library.label }));
  const preferredScopedItems = preferredDocumentSet.size
    ? visibleItems.filter((item) => preferredDocumentSet.has(buildDocumentId(item.path)))
    : [];

  const libraryScopedItems = candidates.length
    ? visibleItems.filter((item) => candidates.some((candidate) => documentMatchesLibrary(item, candidate.library)))
    : [];
  const preferredItemsByFilters = preferredScopedItems.length
    ? prioritizeScopedItems(
        filterDocumentsByContentFocus(
          filterDocumentsByTimeRange(preferredScopedItems, timeRange),
          contentFocus,
        ),
      )
    : [];
  const scopedItems = preferredItemsByFilters.length
    ? preferredItemsByFilters
    : preferredScopedItems.length
      ? prioritizeScopedItems(preferredScopedItems)
      : candidates.length
        ? prioritizeScopedItems(
            filterDocumentsByContentFocus(
              filterDocumentsByTimeRange(libraryScopedItems, timeRange),
              contentFocus,
            ),
          )
        : buildFallbackScopedItems({
            requestText,
            items: visibleItems,
            timeRange,
            contentFocus,
          });

  if (!libraries.length && scopedItems.length) {
    const derivedLibraries = await deriveScopedLibrariesFromItems(scopedItems, documentLibraries, visibleLibraries);
    if (derivedLibraries.length) {
      libraries = derivedLibraries;
    }
  }
  if (!libraries.length && scopedItems.length) {
    const ungroupedLibrary = visibleLibraries.find((item) => item.key === UNGROUPED_LIBRARY_KEY);
    if (ungroupedLibrary && scopedItems.some((item) => documentMatchesLibrary(item, ungroupedLibrary))) {
      libraries = [{ key: UNGROUPED_LIBRARY_KEY, label: ungroupedLibrary.label || UNGROUPED_LIBRARY_LABEL }];
    }
  }

  return { libraries, scopedItems };
}
