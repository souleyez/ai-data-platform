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
  shouldAnswerFromOpenClawLongTermMemoryDirectory,
} from './openclaw-memory-directory.js';
import { getParsedDocumentCanonicalText } from './document-canonical-text.js';
import { runOpenClawChat, tryRunOpenClawNativeWebSearchChat } from './openclaw-adapter.js';
import { buildWebSearchContextBlock, shouldUseWebSearchForPrompt } from './web-search.js';
import type { ChatOutput } from './knowledge-output.js';
import type { ResolvedChannelAccess } from './channel-access-resolver.js';
import {
  parseGeneralKnowledgeConversationState,
} from './knowledge-request-state.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

const UPLOADED_DOCUMENT_CHAT_CONTEXT_CHAR_LIMIT = 5000;
const MATCHED_DOCUMENT_SUPPLY_CHAR_LIMIT = 5000;
const MATCHED_DOCUMENT_SUPPLY_DOC_LIMIT = 3;
const UPLOADED_DOCUMENT_FULL_TEXT_HINT_PATTERNS = [
  /这份(?:文档|文件|材料)?/,
  /这个(?:文档|文件|材料)?/,
  /该(?:文档|文件|材料)?/,
  /刚上传(?:的)?(?:文档|文件|材料)?/,
  /上传(?:的)?(?:文档|文件|材料)?/,
  /基于(?:这份|这个|该|刚上传的|上传的)/,
  /根据(?:这份|这个|该|刚上传的|上传的)/,
  /围绕(?:这份|这个|该|刚上传的|上传的)/,
  /uploaded (?:document|file)/i,
  /just uploaded/i,
  /this (?:document|file)/i,
  /based on (?:the )?(?:uploaded|this) (?:document|file)/i,
];

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

function trimUploadedDocumentContextText(text: string, maxChars = UPLOADED_DOCUMENT_CHAT_CONTEXT_CHAR_LIMIT) {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

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
    && Boolean(getParsedDocumentCanonicalText(item))
    && (
      item.parseStage === 'detailed'
      || item.detailParseStatus === 'succeeded'
      || Boolean(item.detailParsedAt)
    );
}

function isGeneratedReportLibraryDocument(item: Pick<ParsedDocument, 'path'>) {
  return /[\\/]generated-report-library[\\/]/i.test(String(item.path || ''));
}

export function selectLatestDetailedFullTextDocument(documents: ParsedDocument[], preferredPath?: string) {
  const detailedDocuments = [...(documents || [])].filter(isDetailedFullTextDocument);
  const normalizedPreferredPath = String(preferredPath || '').trim().toLowerCase();
  if (normalizedPreferredPath) {
    const preferredDocument = detailedDocuments.find((item) => String(item.path || '').trim().toLowerCase() === normalizedPreferredPath);
    if (preferredDocument) return preferredDocument;
  }
  const preferredDocuments = detailedDocuments.filter((item) => !isGeneratedReportLibraryDocument(item));
  const candidates = preferredDocuments.length ? preferredDocuments : detailedDocuments;

  return candidates
    .sort((left, right) => {
      const leftDetailed = left.parseStage === 'detailed' || left.detailParseStatus === 'succeeded' ? 1 : 0;
      const rightDetailed = right.parseStage === 'detailed' || right.detailParseStatus === 'succeeded' ? 1 : 0;
      if (rightDetailed !== leftDetailed) return rightDetailed - leftDetailed;
      return extractDocumentTimestamp(right) - extractDocumentTimestamp(left);
    })[0] || null;
}

export function buildLatestParsedDocumentFullTextContextBlock(document?: Pick<
  ParsedDocument,
  'title' | 'name' | 'path' | 'schemaType' | 'parseStage' | 'detailParseStatus' | 'fullText' | 'markdownText'
> | null) {
  const fullText = trimUploadedDocumentContextText(getParsedDocumentCanonicalText(document));
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

function buildMatchedDocumentFullTextContextBlocks(input: {
  documents: ParsedDocument[];
  preferredDocumentPath?: string;
}) {
  const normalizedPreferredPath = String(input.preferredDocumentPath || '').trim().toLowerCase();
  const matchedDocuments = [...(input.documents || [])]
    .filter((item) => Boolean(getParsedDocumentCanonicalText(item)))
    .sort((left, right) => {
      const leftPreferred = normalizedPreferredPath && String(left.path || '').trim().toLowerCase() === normalizedPreferredPath ? 1 : 0;
      const rightPreferred = normalizedPreferredPath && String(right.path || '').trim().toLowerCase() === normalizedPreferredPath ? 1 : 0;
      if (rightPreferred !== leftPreferred) return rightPreferred - leftPreferred;
      return extractDocumentTimestamp(right) - extractDocumentTimestamp(left);
    })
    .slice(0, MATCHED_DOCUMENT_SUPPLY_DOC_LIMIT);

  return matchedDocuments.map((document, index) => [
    `Matched document full text ${index + 1}:`,
    `Title: ${String(document.title || document.name || 'Untitled document').trim()}`,
    `Path: ${String(document.path || '').trim()}`,
    `Type: ${String(document.schemaType || '').trim() || 'generic'}`,
    `Parse stage: ${String(document.parseStage || '').trim() || '-'}`,
    `Detail parse status: ${String(document.detailParseStatus || '').trim() || '-'}`,
    `Full text:\n${trimUploadedDocumentContextText(getParsedDocumentCanonicalText(document), MATCHED_DOCUMENT_SUPPLY_CHAR_LIMIT)}`,
  ].join('\n\n'));
}

function requestExplicitlyTargetsUploadedDocument(requestText?: string | null) {
  const source = String(requestText || '').trim();
  if (!source) return false;
  return UPLOADED_DOCUMENT_FULL_TEXT_HINT_PATTERNS.some((pattern) => pattern.test(source));
}

export function shouldIncludeUploadedDocumentFullText(
  requestText?: string | null,
  preferredDocumentPath?: string | null,
) {
  if (!String(preferredDocumentPath || '').trim()) return false;
  return requestExplicitlyTargetsUploadedDocument(requestText);
}

export async function loadLatestVisibleDetailedDocumentContext(input: {
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  preferredDocumentPath?: string;
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

  const normalizedPreferredPath = String(input.preferredDocumentPath || '').trim().toLowerCase();
  const preferredDocument = normalizedPreferredPath
    ? visibleItems.find((item) => String(item.path || '').trim().toLowerCase() === normalizedPreferredPath) || null
    : null;
  const preferredLibraries = preferredDocument
    ? documentLibraries
      .filter((library) => (
        (!effectiveVisibleLibrarySet || effectiveVisibleLibrarySet.has(library.key))
        && documentMatchesLibrary(preferredDocument, library)
      ))
      .map((library): KnowledgeLibraryRef => ({
        key: library.key,
        label: library.label,
      }))
    : [];

  let document = preferredDocument;
  let libraries = preferredLibraries;
  if (normalizedPreferredPath && preferredDocument && !isDetailedFullTextDocument(preferredDocument)) {
    document = null;
  } else if (normalizedPreferredPath && !preferredDocument) {
    document = null;
    libraries = [];
  } else if (!normalizedPreferredPath) {
    document = selectLatestDetailedFullTextDocument(visibleItems, input.preferredDocumentPath);
    const latestVisibleDocument = document;
    libraries = latestVisibleDocument
      ? documentLibraries
        .filter((library) => (
          (!effectiveVisibleLibrarySet || effectiveVisibleLibrarySet.has(library.key))
          && documentMatchesLibrary(latestVisibleDocument, library)
        ))
        .map((library): KnowledgeLibraryRef => ({
          key: library.key,
          label: library.label,
        }))
      : [];
  }

  return {
    document,
    libraries,
    preferredDocument,
    preferredDocumentReady: Boolean(preferredDocument && isDetailedFullTextDocument(preferredDocument)),
  };
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
      libraries: scopeState.libraries,
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
        catalogMemoryLibraries: scopeState.libraries.length || catalogSnapshot?.libraryCount || 0,
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
    libraries: supply.libraries,
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
