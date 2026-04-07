import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { scheduleOpenClawMemoryCatalogSync } from './openclaw-memory-sync.js';
import { STORAGE_CONFIG_DIR } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

const CONFIG_DIR = STORAGE_CONFIG_DIR;
const RETAINED_DOCUMENTS_FILE = path.join(CONFIG_DIR, 'retained-documents.json');

export type RetainedDocument = ParsedDocument & {
  retentionStatus: 'structured-only';
  retainedAt: string;
  originalDeletedAt: string;
};

type RetainedDocumentPayload = {
  items?: RetainedDocument[];
};

async function writePayload(payload: RetainedDocumentPayload) {
  await writeRuntimeStateJson({
    filePath: RETAINED_DOCUMENTS_FILE,
    payload,
  });
  scheduleOpenClawMemoryCatalogSync('retained-documents-write');
}

export async function loadRetainedDocuments() {
  const { data } = await readRuntimeStateJson<RetainedDocument[]>({
    filePath: RETAINED_DOCUMENTS_FILE,
    fallback: [],
    normalize: (parsed) => {
      if (!parsed || typeof parsed !== 'object') return [];
      return Array.isArray((parsed as RetainedDocumentPayload).items)
        ? (parsed as RetainedDocumentPayload).items as RetainedDocument[]
        : [];
    },
  });
  return data;
}

export async function saveRetainedDocuments(items: RetainedDocument[]) {
  await writePayload({ items });
}

export async function retainStructuredDocument(item: ParsedDocument) {
  const current = await loadRetainedDocuments();
  const retainedItem: RetainedDocument = {
    ...item,
    retentionStatus: 'structured-only',
    retainedAt: new Date().toISOString(),
    originalDeletedAt: new Date().toISOString(),
  };

  const next = [retainedItem, ...current.filter((entry) => entry.path !== item.path)];
  await saveRetainedDocuments(next);
  return retainedItem;
}

export async function removeRetainedDocument(documentPath: string) {
  const current = await loadRetainedDocuments();
  const next = current.filter((item) => item.path !== documentPath);
  if (next.length !== current.length) {
    await saveRetainedDocuments(next);
  }
}
