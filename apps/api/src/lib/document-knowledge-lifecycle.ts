import type { DocumentCachePayload } from './document-cache-repository.js';
import { writeDocumentCache } from './document-cache-repository.js';
import { enqueueDetailedParse } from './document-deep-parse-queue.js';
import type { ParsedDocument } from './document-parser.js';
import { upsertDocumentsInCache } from './document-scan-runtime.js';
import { refreshOpenClawMemoryCatalogNow } from './openclaw-memory-sync.js';
import { scheduleDocumentVectorIndexSync } from './document-store-vector-sync.js';

export type DocumentKnowledgeMemorySyncMode = 'scheduled' | 'immediate' | 'skip';

function uniqPaths(paths: string[]) {
  return [...new Set((paths || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

export function collectDetailedParseCandidatePaths(items: ParsedDocument[]) {
  return uniqPaths(
    items
      .filter((item) => item.parseStatus === 'parsed' || item.parseStatus === 'error')
      .map((item) => item.path),
  );
}

async function syncDocumentKnowledgeMemory(mode: DocumentKnowledgeMemorySyncMode, reason: string) {
  if (mode !== 'immediate') return null;
  return refreshOpenClawMemoryCatalogNow(reason);
}

export async function upsertDocumentsIntoKnowledgeBase(input: {
  items: ParsedDocument[];
  scanRoot?: string | string[];
  queueDetailedParse?: boolean;
  memorySyncMode?: DocumentKnowledgeMemorySyncMode;
  memorySyncReason?: string;
}) {
  if (!input.items.length) {
    return {
      queuedPaths: [] as string[],
      queuedCount: 0,
    };
  }

  await upsertDocumentsInCache(input.items, input.scanRoot);

  const queuedPaths = input.queueDetailedParse === false
    ? []
    : collectDetailedParseCandidatePaths(input.items);
  if (queuedPaths.length) {
    await enqueueDetailedParse(queuedPaths);
  }

  await syncDocumentKnowledgeMemory(
    input.memorySyncMode || 'scheduled',
    input.memorySyncReason || 'document-knowledge-upsert',
  );

  return {
    queuedPaths,
    queuedCount: queuedPaths.length,
  };
}

export async function replaceDocumentKnowledgeSnapshot(input: {
  cachePayload: DocumentCachePayload;
  queuePaths?: string[];
  vectorItems?: ParsedDocument[];
  memorySyncMode?: DocumentKnowledgeMemorySyncMode;
  memorySyncReason?: string;
}) {
  await writeDocumentCache(input.cachePayload);

  const queuedPaths = uniqPaths(input.queuePaths || []);
  if (queuedPaths.length) {
    await enqueueDetailedParse(queuedPaths);
  }

  if (input.vectorItems?.length) {
    scheduleDocumentVectorIndexSync(input.vectorItems);
  }

  await syncDocumentKnowledgeMemory(
    input.memorySyncMode || 'scheduled',
    input.memorySyncReason || 'document-knowledge-replace',
  );

  return {
    queuedPaths,
    queuedCount: queuedPaths.length,
  };
}
