import type { ChatHistoryItem, KnowledgeLibraryRef, KnowledgeScopeState } from './knowledge-supply-types.js';
import { buildKnowledgeChatHistory } from './knowledge-supply-scope-history.js';
import { normalizePreferredLibraries } from './knowledge-supply-scope-libraries.js';
import { resolveKnowledgeScope, type PrepareKnowledgeScopeInput } from './knowledge-supply-scope-resolution.js';

export { buildKnowledgeChatHistory } from './knowledge-supply-scope-history.js';
export { normalizePreferredLibraries } from './knowledge-supply-scope-libraries.js';
export type { PrepareKnowledgeScopeInput } from './knowledge-supply-scope-resolution.js';

export async function prepareKnowledgeScope(input: PrepareKnowledgeScopeInput): Promise<KnowledgeScopeState> {
  const knowledgeChatHistory = buildKnowledgeChatHistory(input.chatHistory, input.requestText);
  const preferredLibraries = normalizePreferredLibraries(input.preferredLibraries);
  const { libraries, scopedItems } = await resolveKnowledgeScope(
    input.requestText,
    knowledgeChatHistory,
    preferredLibraries,
    input.timeRange,
    input.contentFocus,
    input.preferredDocumentIds,
    input.botDefinition,
    input.effectiveVisibleLibraryKeys,
  );

  return {
    knowledgeChatHistory,
    libraries,
    scopedItems,
  };
}
