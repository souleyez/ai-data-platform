import type { ResolvedChannelAccess } from './channel-access-resolver.js';
import type { ChatOutput } from './knowledge-output.js';
import type { GeneralKnowledgeConversationState } from './knowledge-request-state.js';
import type { KnowledgeLibraryRef } from './knowledge-supply.js';

export type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type GeneralKnowledgeDispatchResult = {
  libraries: KnowledgeLibraryRef[];
  content: string;
  output: ChatOutput;
  references: Array<{ id: string; name: string; path: string }>;
  intent: 'general';
  mode: 'openclaw';
  debug?: Record<string, unknown> | null;
  conversationState: GeneralKnowledgeConversationState | null;
  routeKind?: 'general' | 'template_confirmation';
  evidenceMode?: 'supply_only' | null;
  guard?: {
    requiresConfirmation: boolean;
    reason: string;
    confirmation: Record<string, unknown> | null;
  } | null;
};

export type GeneralKnowledgeDebugPayloadInput = {
  memorySelectedDocuments: number;
  catalogMemoryLibraries: number;
  catalogMemoryDocuments: number;
  catalogMemoryOutputs: number;
  matchedSupplyDocuments: number;
  matchedSupplyEvidence: number;
  matchedFullTextDocuments: number;
  latestDetailedDocumentPath?: string;
  preferredDocumentPath: string;
  latestDocumentFullTextIncluded: boolean;
  preferredDocumentStatus: string;
  botId?: string;
  botName?: string;
  visibleLibraries?: string[];
  accessContext?: ResolvedChannelAccess | null;
  longTermDirectoryAnswerUsed?: boolean;
  searchEnabledByDefault?: boolean;
  nativeSearchPreferred?: boolean;
};
