import path from 'node:path';
import { buildDocumentId } from './document-store.js';
import { runOpenClawChat, tryRunOpenClawNativeWebSearchChat } from './openclaw-adapter.js';
import { buildWebSearchContextBlock, shouldUseWebSearchForPrompt } from './web-search.js';
import type { ChatHistoryItem, GeneralKnowledgeDebugPayloadInput } from './knowledge-chat-dispatch-types.js';

export async function runCloudChatWithSearchFallback(input: {
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

export function buildAnswerReferences(documents: Array<{ path?: string; title?: string; name?: string }>) {
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

export function appendReference(
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

export function buildGeneralKnowledgeDebugPayload(input: GeneralKnowledgeDebugPayloadInput) {
  return {
    memorySelectedDocuments: input.memorySelectedDocuments,
    catalogMemoryLibraries: input.catalogMemoryLibraries,
    catalogMemoryDocuments: input.catalogMemoryDocuments,
    catalogMemoryOutputs: input.catalogMemoryOutputs,
    matchedSupplyDocuments: input.matchedSupplyDocuments,
    matchedSupplyEvidence: input.matchedSupplyEvidence,
    matchedFullTextDocuments: input.matchedFullTextDocuments,
    latestDetailedDocument: input.latestDetailedDocumentPath || '',
    preferredDocumentPath: input.preferredDocumentPath,
    latestDocumentFullTextIncluded: input.latestDocumentFullTextIncluded,
    preferredDocumentStatus: input.preferredDocumentStatus,
    botId: input.botId || '',
    botName: input.botName || '',
    visibleLibraries: Array.isArray(input.visibleLibraries) ? input.visibleLibraries : [],
    accessContext: input.accessContext || null,
    ...(input.longTermDirectoryAnswerUsed ? { longTermDirectoryAnswerUsed: true } : {}),
    ...(input.searchEnabledByDefault ? { searchEnabledByDefault: true } : {}),
    ...(input.nativeSearchPreferred ? { nativeSearchPreferred: true } : {}),
  };
}
