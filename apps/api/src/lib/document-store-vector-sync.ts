import type { ParsedDocument } from './document-parser.js';
import { upsertDocumentVectorIndex } from './document-vector-index.js';

let vectorSyncPromise: Promise<void> | null = null;
let lastVectorSyncAt = 0;
const VECTOR_SYNC_DEBOUNCE_MS = Math.max(30_000, Number(process.env.DOCUMENT_VECTOR_SYNC_DEBOUNCE_MS || 120_000));

export function scheduleDocumentVectorIndexSync(items: ParsedDocument[]) {
  const now = Date.now();
  if (vectorSyncPromise || now - lastVectorSyncAt < VECTOR_SYNC_DEBOUNCE_MS) {
    return;
  }

  const candidates = items.filter((item) => item.parseStatus === 'parsed' && item.parseStage === 'detailed');
  if (!candidates.length) return;

  lastVectorSyncAt = now;
  vectorSyncPromise = upsertDocumentVectorIndex(candidates)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      vectorSyncPromise = null;
    });
}
