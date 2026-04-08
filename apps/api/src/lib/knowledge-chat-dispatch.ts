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
  buildOpenClawMemorySelectionContextBlock,
  loadOpenClawMemorySelectionState,
  selectOpenClawMemoryDocumentCandidatesFromState,
} from './openclaw-memory-selection.js';
import { runOpenClawChat, tryRunOpenClawNativeWebSearchChat } from './openclaw-adapter.js';
import { buildWebSearchContextBlock, shouldUseWebSearchForPrompt } from './web-search.js';
import type { ChatOutput } from './knowledge-output.js';
import type { ResolvedChannelAccess } from './channel-access-resolver.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type GeneralKnowledgeDispatchResult = {
  libraries: KnowledgeLibraryRef[];
  content: string;
  output: ChatOutput;
  references: Array<{ id: string; name: string; path: string }>;
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

function extractDocumentTimestamp(item: Pick<ParsedDocument, 'path' | 'detailParsedAt' | 'cloudStructuredAt' | 'retainedAt'>) {
  const candidates = [
    Date.parse(String(item.detailParsedAt || '')),
    Date.parse(String(item.cloudStructuredAt || '')),
    Date.parse(String(item.retainedAt || '')),
  ].filter((value) => Number.isFinite(value) && value > 0);

  const match = String(item.path || '').match(/(?:^|[\\/])(\d{13})(?:[-_.]|$)/);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      candidates.push(value);
    }
  }

  return candidates.length ? Math.max(...candidates) : 0;
}

function isDetailedFullTextDocument(item: ParsedDocument) {
  return item.parseStatus === 'parsed'
    && Boolean(String(item.fullText || '').trim())
    && (
      item.parseStage === 'detailed'
      || item.detailParseStatus === 'succeeded'
      || Boolean(item.detailParsedAt)
    );
}

export function selectLatestDetailedFullTextDocument(documents: ParsedDocument[]) {
  return [...(documents || [])]
    .filter(isDetailedFullTextDocument)
    .sort((left, right) => {
      const leftDetailed = left.parseStage === 'detailed' || left.detailParseStatus === 'succeeded' ? 1 : 0;
      const rightDetailed = right.parseStage === 'detailed' || right.detailParseStatus === 'succeeded' ? 1 : 0;
      if (rightDetailed !== leftDetailed) return rightDetailed - leftDetailed;
      return extractDocumentTimestamp(right) - extractDocumentTimestamp(left);
    })[0] || null;
}

export function buildLatestParsedDocumentFullTextContextBlock(document?: Pick<
  ParsedDocument,
  'title' | 'name' | 'path' | 'schemaType' | 'parseStage' | 'detailParseStatus' | 'fullText'
> | null) {
  const fullText = String(document?.fullText || '').trim();
  if (!fullText) return '';

  return [
    'Latest parsed document full text:',
    `Title: ${String(document?.title || document?.name || 'Untitled document').trim()}`,
    `Path: ${String(document?.path || '').trim()}`,
    `Type: ${String(document?.schemaType || '').trim() || 'generic'}`,
    `Parse stage: ${String(document?.parseStage || '').trim() || '-'}`,
    `Detail parse status: ${String(document?.detailParseStatus || '').trim() || '-'}`,
    `Full text:\n${fullText}`,
  ].join('\n\n');
}

async function loadLatestVisibleDetailedDocument(input: {
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
}) {
  const [documentLibraries, documentState] = await Promise.all([
    loadDocumentLibraries(),
    loadParsedDocuments(240, false),
  ]);

  const baseVisibleItems = input.botDefinition
    ? filterDocumentsForBot(input.botDefinition, documentState.items, documentLibraries)
    : documentState.items;
  const effectiveVisibleLibrarySet = Array.isArray(input.effectiveVisibleLibraryKeys)
    ? new Set(input.effectiveVisibleLibraryKeys.map((item) => String(item || '').trim()).filter(Boolean))
    : null;
  const visibleItems = effectiveVisibleLibrarySet
    ? baseVisibleItems.filter((item) => documentLibraries.some((library) => (
      effectiveVisibleLibrarySet.has(library.key) && documentMatchesLibrary(item, library)
    )))
    : baseVisibleItems;

  return selectLatestDetailedFullTextDocument(visibleItems);
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
}): Promise<GeneralKnowledgeDispatchResult> {
  const requestText = String(input.prompt || '').trim();
  const systemContextBlocks = [...(input.systemContextBlocks || [])];
  const useExternalScopedMemory = input.accessContext?.source === 'external-directory';
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
  const supply = await prepareKnowledgeRetrieval({
    requestText,
    docLimit: 5,
    evidenceLimit: 6,
    preferredDocumentIds: memorySelection.documentIds,
    ...scopeState,
  });
  const latestDetailedDocument = await loadLatestVisibleDetailedDocument({
    botDefinition: input.botDefinition,
    effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
  });

  const knowledgeContext = supply.effectiveRetrieval.documents.length || supply.effectiveRetrieval.evidenceMatches.length
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
    buildOpenClawMemorySelectionContextBlock(memorySelection),
    libraryKnowledgePagesContext,
    knowledgeContext,
  ].filter(Boolean);
  const latestDocumentFullTextBlock = buildLatestParsedDocumentFullTextContextBlock(latestDetailedDocument);
  const fullContextBlocks = [...templateContextBlocks, latestDocumentFullTextBlock].filter(Boolean);
  const references = buildAnswerReferences(supply.effectiveRetrieval.documents);

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
      supplyDocuments: supply.effectiveRetrieval.documents.length,
      supplyEvidence: supply.effectiveRetrieval.evidenceMatches.length,
      latestDetailedDocument: latestDetailedDocument?.path || '',
      botId: input.botDefinition?.id || '',
      botName: input.botDefinition?.name || '',
      visibleLibraries: Array.isArray(input.effectiveVisibleLibraryKeys)
        ? input.effectiveVisibleLibraryKeys
        : (input.botDefinition?.visibleLibraryKeys || []),
      accessContext: input.accessContext || null,
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
    references,
    intent: 'general',
    mode: 'openclaw',
    debug: {
      memorySelectedDocuments: memorySelection.documentIds.length,
      supplyDocuments: supply.effectiveRetrieval.documents.length,
      supplyEvidence: supply.effectiveRetrieval.evidenceMatches.length,
      searchEnabledByDefault: true,
      nativeSearchPreferred: true,
      latestDetailedDocument: latestDetailedDocument?.path || '',
      botId: input.botDefinition?.id || '',
      botName: input.botDefinition?.name || '',
      visibleLibraries: Array.isArray(input.effectiveVisibleLibraryKeys)
        ? input.effectiveVisibleLibraryKeys
        : (input.botDefinition?.visibleLibraryKeys || []),
      accessContext: input.accessContext || null,
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
