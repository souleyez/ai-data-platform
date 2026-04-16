import type { BotDefinition } from './bot-definitions.js';
import type { ResolvedChannelAccess } from './channel-access-resolver.js';
import { loadOpenClawMemoryCatalogSnapshot } from './openclaw-memory-catalog.js';
import {
  loadOpenClawMemorySelectionState,
  selectOpenClawMemoryDocumentCandidatesFromState,
} from './openclaw-memory-selection.js';
import { resolveOpenClawLongTermMemoryRequestedLibraries } from './openclaw-memory-directory.js';

export async function prepareGeneralKnowledgeMemoryContext(input: {
  requestText: string;
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
}) {
  const useExternalScopedMemory = input.accessContext?.source === 'external-directory';
  const catalogSnapshot = await loadOpenClawMemoryCatalogSnapshot();
  const requestedLongTermMemoryLibraries = resolveOpenClawLongTermMemoryRequestedLibraries({
    snapshot: catalogSnapshot,
    requestText: input.requestText,
    effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
  });
  const memoryState = await loadOpenClawMemorySelectionState({
    botId: input.botDefinition?.id,
    forceGlobalState: useExternalScopedMemory,
  });
  const memorySelection = selectOpenClawMemoryDocumentCandidatesFromState({
    state: memoryState,
    requestText: input.requestText,
    limit: 5,
    effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
  });

  return {
    useExternalScopedMemory,
    catalogSnapshot,
    requestedLongTermMemoryLibraries,
    memorySelection,
  };
}
