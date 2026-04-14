import type { RetrievalResult } from './document-retrieval.js';
import { buildKnowledgeDetailFallbackAnswer } from './knowledge-detail-fetch.js';
import { buildKnowledgeContext } from './knowledge-evidence.js';
import { buildLibraryKnowledgePagesContextBlock } from './library-knowledge-pages.js';
import { buildKnowledgeMissMessage, type ChatOutput } from './knowledge-output.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import { loadOpenClawMemoryCatalogSnapshot } from './openclaw-memory-catalog.js';
import {
  buildOpenClawLongTermMemoryContextBlock,
  buildOpenClawLongTermMemoryDirectAnswer,
  resolveOpenClawLongTermMemoryRequestedLibraries,
  shouldAnswerFromOpenClawLongTermMemoryDirectory,
} from './openclaw-memory-directory.js';
import {
  loadOpenClawMemorySelectionState,
  selectOpenClawMemoryDocumentCandidatesFromState,
} from './openclaw-memory-selection.js';
import { buildKnowledgeAnswerPrompt } from './knowledge-prompts.js';
import { prepareKnowledgeSupply } from './knowledge-supply.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';
import type { KnowledgeAnswerInput, KnowledgeAnswerResult } from './knowledge-execution-types.js';

function buildKnowledgeCatalogAnswerContextBlock(input: {
  requestText: string;
  libraries: Array<{ key: string; label: string }>;
  detailDocuments?: number;
  detailEvidence?: number;
}) {
  const libraryText = input.libraries.length
    ? input.libraries.map((item) => item.label || item.key).join(' | ')
    : 'current knowledge catalog';
  return [
    'Current answer mode: direct knowledge answer',
    `Evidence state: ${input.detailDocuments ? 'catalog_memory + live_detail' : 'catalog_memory'}`,
    `Preferred libraries: ${libraryText}`,
    `Normalized request: ${input.requestText}`,
    input.detailDocuments
      ? `Supplied live detail: documents=${input.detailDocuments} evidence=${input.detailEvidence || 0}`
      : '',
  ].join('\n');
}

function looksLikeCatalogAccessMiss(content: string) {
  const text = String(content || '').replace(/\s+/g, '');
  if (!text) return true;
  return /没有直接连接|无法实时拉取|未连接到文档存储|需要确认.*(路径|位置|api|脚本)|提供访问方式|告诉我.*路径/.test(text);
}

export async function executeKnowledgeAnswer(input: KnowledgeAnswerInput): Promise<KnowledgeAnswerResult> {
  const requestText = String(input.prompt || '').trim();
  const preferLiveDetail = (input.answerMode || 'live_detail') === 'live_detail';
  const useExternalScopedMemory = input.forceGlobalMemorySelection === true;
  const [memoryState, catalogSnapshot] = await Promise.all([
    loadOpenClawMemorySelectionState({
      botId: input.botDefinition?.id,
      forceGlobalState: useExternalScopedMemory,
    }),
    loadOpenClawMemoryCatalogSnapshot(),
  ]);
  const memorySelection = selectOpenClawMemoryDocumentCandidatesFromState({
    state: memoryState,
    requestText,
    libraries: input.preferredLibraries,
    limit: preferLiveDetail ? 4 : 6,
    effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
  });
  const requestedLongTermMemoryLibraries = resolveOpenClawLongTermMemoryRequestedLibraries({
    snapshot: catalogSnapshot,
    requestText,
    effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
  });

  let libraries = input.preferredLibraries || [];
  let knowledgeChatHistory = input.chatHistory;
  let effectiveRetrieval: RetrievalResult | null = null;

  if (preferLiveDetail && (libraries.length || memorySelection.documentIds.length)) {
    const supply = await prepareKnowledgeSupply({
      requestText,
      chatHistory: input.chatHistory,
      preferredLibraries: input.preferredLibraries,
      timeRange: input.timeRange,
      contentFocus: input.contentFocus,
      docLimit: 5,
      evidenceLimit: 6,
      preferredDocumentIds: memorySelection.documentIds,
      botDefinition: input.botDefinition,
      effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
    });
    libraries = supply.libraries;
    knowledgeChatHistory = supply.knowledgeChatHistory;
    effectiveRetrieval = supply.effectiveRetrieval.documents.length
      ? supply.effectiveRetrieval
      : null;
  }

  const fallbackContent = [
    buildOpenClawLongTermMemoryDirectAnswer({
      snapshot: catalogSnapshot,
      requestText,
      libraries: requestedLongTermMemoryLibraries.length ? requestedLongTermMemoryLibraries : undefined,
      effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
    }),
    preferLiveDetail && effectiveRetrieval?.documents.length
      ? buildKnowledgeDetailFallbackAnswer({
        requestText,
        libraries,
        retrieval: effectiveRetrieval,
        timeRange: input.timeRange,
        contentFocus: input.contentFocus,
      })
      : '',
  ].filter(Boolean).join('\n\n') || buildKnowledgeMissMessage(libraries);

  if (!preferLiveDetail || shouldAnswerFromOpenClawLongTermMemoryDirectory(requestText)) {
    return {
      libraries,
      output: { type: 'answer', content: fallbackContent },
      content: fallbackContent,
      intent: 'general',
      mode: 'openclaw',
    };
  }

  if (!isOpenClawGatewayConfigured()) {
    return {
      libraries,
      output: { type: 'answer', content: fallbackContent },
      content: fallbackContent,
      intent: 'general',
      mode: 'openclaw',
    };
  }

  try {
    const skillInstruction = preferLiveDetail && effectiveRetrieval?.documents.length
      ? await loadWorkspaceSkillBundle('knowledge-detail-fetch', [
        'references/output-contract.md',
      ])
      : '';
    const libraryKnowledgePagesContext = await buildLibraryKnowledgePagesContextBlock(libraries);
    const cloud = await runOpenClawChat({
      prompt: requestText,
      sessionUser: input.sessionUser,
      chatHistory: knowledgeChatHistory,
      contextBlocks: [
        buildKnowledgeCatalogAnswerContextBlock({
          requestText,
          libraries,
          detailDocuments: effectiveRetrieval?.documents.length || 0,
          detailEvidence: effectiveRetrieval?.evidenceMatches.length || 0,
        }),
        buildOpenClawLongTermMemoryContextBlock({
          snapshot: catalogSnapshot,
          libraries: requestedLongTermMemoryLibraries.length ? requestedLongTermMemoryLibraries : undefined,
          effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
        }),
        libraryKnowledgePagesContext,
        effectiveRetrieval?.documents.length
          ? buildKnowledgeContext(requestText, libraries, effectiveRetrieval, {
            timeRange: input.timeRange,
            contentFocus: input.contentFocus,
          })
          : '',
      ].filter(Boolean),
      systemPrompt: buildKnowledgeAnswerPrompt(skillInstruction),
    });
    const content = looksLikeCatalogAccessMiss(cloud.content)
      ? fallbackContent
      : cloud.content;

    return {
      libraries,
      output: { type: 'answer', content },
      content,
      intent: 'general',
      mode: 'openclaw',
    };
  } catch {
    return {
      libraries,
      output: { type: 'answer', content: fallbackContent },
      content: fallbackContent,
      intent: 'general',
      mode: 'openclaw',
    };
  }
}
