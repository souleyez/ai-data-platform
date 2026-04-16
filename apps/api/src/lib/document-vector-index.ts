import type { ParsedDocument } from './document-parser.js';
import { buildVectorRecordsForDocument } from './document-vector-records.js';
import {
  buildDocumentVectorIndexEntry,
  normalizeVectorDocumentPath,
  scoreVectorizationPriority,
  shouldVectorizeDocument,
} from './document-vector-index-eligibility.js';
import { searchDocumentVectorRecords } from './document-vector-index-ranking.js';
import {
  groupDocumentVectorRecordsByPath,
  loadStoredDocumentVectorRecords,
  persistDocumentVectorIndex,
  readDocumentVectorIndexMeta,
} from './document-vector-index-storage.js';
import type {
  DocumentVectorIndexEntry,
  DocumentVectorIndexMeta,
  DocumentVectorRecallHit,
  DocumentVectorSearchOptions,
} from './document-vector-index-types.js';

export type {
  DocumentVectorIndexEntry,
  DocumentVectorIndexMeta,
  DocumentVectorRecallHit,
  DocumentVectorSearchOptions,
} from './document-vector-index-types.js';
export { scoreVectorizationPriority, shouldVectorizeDocument } from './document-vector-index-eligibility.js';

export async function rebuildDocumentVectorIndex(items: ParsedDocument[]) {
  const candidates = items.filter(shouldVectorizeDocument);
  const records = candidates.flatMap((item) => buildVectorRecordsForDocument(item));
  const recordsByPath = groupDocumentVectorRecordsByPath(records);
  const entries = candidates
    .map((item) => buildDocumentVectorIndexEntry(item, recordsByPath.get(normalizeVectorDocumentPath(item.path)) || []))
    .filter((entry) => entry.recordCount > 0 && entry.priority > 0);

  await persistDocumentVectorIndex(records, entries);
  return {
    documentCount: entries.length,
    recordCount: records.length,
    topEntries: entries.slice(0, 10),
  };
}

export async function upsertDocumentVectorIndex(items: ParsedDocument[]) {
  const meta = await readDocumentVectorIndexMeta();
  const existingRecords = await loadStoredDocumentVectorRecords();

  const targetPaths = new Set(items.map((item) => normalizeVectorDocumentPath(item.path)));
  const nextRecords = existingRecords.filter((record) => !targetPaths.has(normalizeVectorDocumentPath(record.documentPath)));
  const nextEntries = meta.entries.filter((entry) => !targetPaths.has(normalizeVectorDocumentPath(entry.path)));

  for (const item of items.filter(shouldVectorizeDocument)) {
    const records = buildVectorRecordsForDocument(item);
    if (!records.length) continue;
    nextRecords.push(...records);
    nextEntries.push(buildDocumentVectorIndexEntry(item, records));
  }

  await persistDocumentVectorIndex(
    nextRecords.filter((record) => record.text.trim()),
    nextEntries.filter((entry) => entry.recordCount > 0 && entry.priority > 0),
  );
  return {
    documentCount: nextEntries.length,
    recordCount: nextRecords.length,
    updatedPaths: [...targetPaths],
  };
}

export async function loadDocumentVectorIndexMeta(): Promise<DocumentVectorIndexMeta> {
  return readDocumentVectorIndexMeta();
}

export async function searchDocumentVectorIndex(
  prompt: string,
  limit = 18,
  options?: DocumentVectorSearchOptions,
): Promise<DocumentVectorRecallHit[]> {
  const records = await loadStoredDocumentVectorRecords();
  return searchDocumentVectorRecords(records, prompt, limit, options);
}
