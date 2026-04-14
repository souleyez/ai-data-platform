import type { loadParsedDocuments } from './document-store.js';
import type { RetrievalResult } from './document-retrieval.js';

export type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type KnowledgeLibraryRef = { key: string; label: string };

export type KnowledgeScopeState = {
  knowledgeChatHistory: ChatHistoryItem[];
  libraries: KnowledgeLibraryRef[];
  scopedItems: Awaited<ReturnType<typeof loadParsedDocuments>>['items'];
};

export type KnowledgeSupply = {
  knowledgeChatHistory: ChatHistoryItem[];
  libraries: KnowledgeLibraryRef[];
  effectiveRetrieval: RetrievalResult;
};
