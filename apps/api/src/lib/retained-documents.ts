import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { STORAGE_CONFIG_DIR, STORAGE_ROOT } from './paths.js';

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

async function ensureConfigDir() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

async function writePayload(payload: RetainedDocumentPayload) {
  await ensureConfigDir();
  await fs.writeFile(RETAINED_DOCUMENTS_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

export async function loadRetainedDocuments() {
  try {
    const raw = await fs.readFile(RETAINED_DOCUMENTS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as RetainedDocumentPayload;
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
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
