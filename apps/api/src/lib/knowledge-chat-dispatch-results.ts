import type { BotDefinition } from './bot-definitions.js';
import type { ResolvedChannelAccess } from './channel-access-resolver.js';
import { buildGeneralKnowledgeDebugPayload } from './knowledge-chat-dispatch-support.js';
import type { GeneralKnowledgeDispatchResult } from './knowledge-chat-dispatch-types.js';
import type { GeneralKnowledgeConversationState } from './knowledge-request-state.js';
import type { OpenClawMemoryCatalogSnapshot } from './openclaw-memory-catalog-types.js';
import type { KnowledgeLibraryRef } from './knowledge-supply.js';

type DispatchDebugInput = {
  memorySelectedDocuments: number;
  catalogSnapshot: OpenClawMemoryCatalogSnapshot | null;
  catalogMemoryLibraries: number;
  matchedSupplyDocuments: number;
  matchedSupplyEvidence: number;
  matchedFullTextDocuments: number;
  latestDetailedDocumentPath?: string;
  preferredDocumentPath: string;
  latestDocumentFullTextIncluded: boolean;
  preferredDocumentStatus: string;
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
  longTermDirectoryAnswerUsed?: boolean;
  searchEnabledByDefault?: boolean;
  nativeSearchPreferred?: boolean;
};

function resolveVisibleLibraries(input: {
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
}) {
  return Array.isArray(input.effectiveVisibleLibraryKeys)
    ? input.effectiveVisibleLibraryKeys
    : (input.botDefinition?.visibleLibraryKeys || []);
}

function buildDispatchDebug(input: DispatchDebugInput) {
  return buildGeneralKnowledgeDebugPayload({
    memorySelectedDocuments: input.memorySelectedDocuments,
    catalogMemoryLibraries: input.catalogMemoryLibraries,
    catalogMemoryDocuments: input.catalogSnapshot?.documentCount || 0,
    catalogMemoryOutputs: input.catalogSnapshot?.outputCount || 0,
    matchedSupplyDocuments: input.matchedSupplyDocuments,
    matchedSupplyEvidence: input.matchedSupplyEvidence,
    matchedFullTextDocuments: input.matchedFullTextDocuments,
    latestDetailedDocumentPath: input.latestDetailedDocumentPath || '',
    preferredDocumentPath: input.preferredDocumentPath,
    latestDocumentFullTextIncluded: input.latestDocumentFullTextIncluded,
    preferredDocumentStatus: input.preferredDocumentStatus,
    botId: input.botDefinition?.id,
    botName: input.botDefinition?.name,
    visibleLibraries: resolveVisibleLibraries(input),
    accessContext: input.accessContext || null,
    longTermDirectoryAnswerUsed: input.longTermDirectoryAnswerUsed,
    searchEnabledByDefault: input.searchEnabledByDefault,
    nativeSearchPreferred: input.nativeSearchPreferred,
  });
}

export function buildDirectDirectoryAnswerResult(input: {
  libraries: KnowledgeLibraryRef[];
  content: string;
  memorySelectedDocuments: number;
  catalogSnapshot: OpenClawMemoryCatalogSnapshot | null;
  requestedLongTermMemoryLibraries: KnowledgeLibraryRef[];
  preferredDocumentPath: string;
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
  conversationState: GeneralKnowledgeConversationState | null;
}): GeneralKnowledgeDispatchResult {
  return {
    libraries: input.libraries,
    content: input.content,
    output: { type: 'answer', content: input.content },
    references: [],
    intent: 'general',
    mode: 'openclaw',
    debug: buildDispatchDebug({
      memorySelectedDocuments: input.memorySelectedDocuments,
      catalogSnapshot: input.catalogSnapshot,
      catalogMemoryLibraries: input.requestedLongTermMemoryLibraries.length || input.catalogSnapshot?.libraryCount || 0,
      matchedSupplyDocuments: 0,
      matchedSupplyEvidence: 0,
      matchedFullTextDocuments: 0,
      preferredDocumentPath: input.preferredDocumentPath,
      latestDocumentFullTextIncluded: false,
      preferredDocumentStatus: input.preferredDocumentPath ? 'skipped' : 'none',
      botDefinition: input.botDefinition,
      effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
      accessContext: input.accessContext,
      longTermDirectoryAnswerUsed: true,
    }),
    conversationState: input.conversationState,
    routeKind: 'general',
    evidenceMode: 'supply_only',
    guard: {
      requiresConfirmation: false,
      reason: '',
      confirmation: null,
    },
  };
}

export function buildDocumentNotReadyResult(input: {
  libraries: KnowledgeLibraryRef[];
  references: Array<{ id: string; name: string; path: string }>;
  memorySelectedDocuments: number;
  catalogSnapshot: OpenClawMemoryCatalogSnapshot | null;
  matchedSupplyDocuments: number;
  matchedSupplyEvidence: number;
  matchedFullTextDocuments: number;
  preferredDocumentPath: string;
  preferredDocumentStatus: string;
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
  conversationState: GeneralKnowledgeConversationState | null;
}): GeneralKnowledgeDispatchResult {
  const content = '该文档还在解析，详细正文尚未就绪，请稍后再试。';
  return {
    libraries: input.libraries,
    content,
    output: { type: 'answer', content },
    references: input.references,
    intent: 'general',
    mode: 'openclaw',
    debug: buildDispatchDebug({
      memorySelectedDocuments: input.memorySelectedDocuments,
      catalogSnapshot: input.catalogSnapshot,
      catalogMemoryLibraries: input.libraries.length,
      matchedSupplyDocuments: input.matchedSupplyDocuments,
      matchedSupplyEvidence: input.matchedSupplyEvidence,
      matchedFullTextDocuments: input.matchedFullTextDocuments,
      preferredDocumentPath: input.preferredDocumentPath,
      latestDocumentFullTextIncluded: false,
      preferredDocumentStatus: input.preferredDocumentStatus,
      botDefinition: input.botDefinition,
      effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
      accessContext: input.accessContext,
    }),
    conversationState: input.conversationState,
    routeKind: 'general',
    evidenceMode: 'supply_only',
    guard: {
      requiresConfirmation: false,
      reason: '',
      confirmation: null,
    },
  };
}

export function buildTemplateConfirmationResult(input: {
  libraries: KnowledgeLibraryRef[];
  references: Array<{ id: string; name: string; path: string }>;
  memorySelectedDocuments: number;
  catalogSnapshot: OpenClawMemoryCatalogSnapshot | null;
  matchedSupplyDocuments: number;
  matchedSupplyEvidence: number;
  matchedFullTextDocuments: number;
  latestDetailedDocumentPath?: string;
  preferredDocumentPath: string;
  latestDocumentFullTextIncluded: boolean;
  preferredDocumentStatus: string;
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
  conversationState: GeneralKnowledgeConversationState | null;
  confirmation: Record<string, unknown>;
}): GeneralKnowledgeDispatchResult {
  const content = [
    '这次命中了库内资料模板输出。',
    '我不直接推进，先给你两个确认选项：一个按智能助手自己的理解执行，一个按命中资料和模板输出。',
    '请直接点选其中一个继续。',
  ].join('\n\n');

  return {
    libraries: input.libraries,
    content,
    output: { type: 'answer', content },
    references: input.references,
    intent: 'general',
    mode: 'openclaw',
    debug: buildDispatchDebug({
      memorySelectedDocuments: input.memorySelectedDocuments,
      catalogSnapshot: input.catalogSnapshot,
      catalogMemoryLibraries: input.libraries.length,
      matchedSupplyDocuments: input.matchedSupplyDocuments,
      matchedSupplyEvidence: input.matchedSupplyEvidence,
      matchedFullTextDocuments: input.matchedFullTextDocuments,
      latestDetailedDocumentPath: input.latestDetailedDocumentPath,
      preferredDocumentPath: input.preferredDocumentPath,
      latestDocumentFullTextIncluded: input.latestDocumentFullTextIncluded,
      preferredDocumentStatus: input.preferredDocumentStatus,
      botDefinition: input.botDefinition,
      effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
      accessContext: input.accessContext,
    }),
    conversationState: input.conversationState,
    routeKind: 'template_confirmation',
    evidenceMode: 'supply_only',
    guard: {
      requiresConfirmation: true,
      reason: 'template_output_confirmation',
      confirmation: input.confirmation,
    },
  };
}

export function buildCloudDispatchResult(input: {
  libraries: KnowledgeLibraryRef[];
  content: string;
  references: Array<{ id: string; name: string; path: string }>;
  memorySelectedDocuments: number;
  catalogSnapshot: OpenClawMemoryCatalogSnapshot | null;
  matchedSupplyDocuments: number;
  matchedSupplyEvidence: number;
  matchedFullTextDocuments: number;
  latestDetailedDocumentPath?: string;
  preferredDocumentPath: string;
  latestDocumentFullTextIncluded: boolean;
  preferredDocumentStatus: string;
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
  conversationState: GeneralKnowledgeConversationState | null;
}): GeneralKnowledgeDispatchResult {
  return {
    libraries: input.libraries,
    content: input.content,
    output: { type: 'answer', content: input.content },
    references: input.references,
    intent: 'general',
    mode: 'openclaw',
    debug: buildDispatchDebug({
      memorySelectedDocuments: input.memorySelectedDocuments,
      catalogSnapshot: input.catalogSnapshot,
      catalogMemoryLibraries: input.libraries.length,
      matchedSupplyDocuments: input.matchedSupplyDocuments,
      matchedSupplyEvidence: input.matchedSupplyEvidence,
      matchedFullTextDocuments: input.matchedFullTextDocuments,
      latestDetailedDocumentPath: input.latestDetailedDocumentPath,
      preferredDocumentPath: input.preferredDocumentPath,
      latestDocumentFullTextIncluded: input.latestDocumentFullTextIncluded,
      preferredDocumentStatus: input.preferredDocumentStatus,
      botDefinition: input.botDefinition,
      effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
      accessContext: input.accessContext,
      searchEnabledByDefault: true,
      nativeSearchPreferred: true,
    }),
    conversationState: input.conversationState,
    routeKind: 'general',
    evidenceMode: 'supply_only',
    guard: {
      requiresConfirmation: false,
      reason: '',
      confirmation: null,
    },
  };
}
