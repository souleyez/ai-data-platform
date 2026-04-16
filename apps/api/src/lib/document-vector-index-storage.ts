import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DocumentVectorRecord } from './document-vector-records.js';
import { STORAGE_CACHE_DIR } from './paths.js';
import { normalizeVectorDocumentPath } from './document-vector-index-eligibility.js';
import type { DocumentVectorIndexEntry, DocumentVectorIndexMeta } from './document-vector-index-types.js';

const VECTOR_INDEX_FILE = path.join(STORAGE_CACHE_DIR, 'document-vector-index.jsonl');
const VECTOR_META_FILE = path.join(STORAGE_CACHE_DIR, 'document-vector-meta.json');

async function ensureVectorIndexDir() {
  await fs.mkdir(STORAGE_CACHE_DIR, { recursive: true });
}

export async function readDocumentVectorIndexMeta(): Promise<DocumentVectorIndexMeta> {
  try {
    const raw = await fs.readFile(VECTOR_META_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DocumentVectorIndexMeta;
    return {
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      documentCount: Number(parsed.documentCount || 0),
      recordCount: Number(parsed.recordCount || 0),
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return {
      updatedAt: new Date().toISOString(),
      documentCount: 0,
      recordCount: 0,
      entries: [],
    };
  }
}

export async function loadStoredDocumentVectorRecords() {
  const raw = await fs.readFile(VECTOR_INDEX_FILE, 'utf8').catch(() => '');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as DocumentVectorRecord];
      } catch {
        return [];
      }
    });
}

export function groupDocumentVectorRecordsByPath(records: DocumentVectorRecord[]) {
  const byPath = new Map<string, DocumentVectorRecord[]>();
  for (const record of records) {
    const key = normalizeVectorDocumentPath(record.documentPath);
    const group = byPath.get(key) || [];
    group.push(record);
    byPath.set(key, group);
  }
  return byPath;
}

export async function persistDocumentVectorIndex(records: DocumentVectorRecord[], entries: DocumentVectorIndexEntry[]) {
  await ensureVectorIndexDir();
  const normalizedRecords = records
    .sort((left, right) =>
      left.documentPath.localeCompare(right.documentPath)
      || left.kind.localeCompare(right.kind)
      || left.id.localeCompare(right.id));
  const jsonl = normalizedRecords.map((record) => JSON.stringify(record)).join('\n');
  await fs.writeFile(VECTOR_INDEX_FILE, jsonl ? `${jsonl}\n` : '', 'utf8');
  await fs.writeFile(VECTOR_META_FILE, JSON.stringify({
    updatedAt: new Date().toISOString(),
    documentCount: entries.length,
    recordCount: normalizedRecords.length,
    entries: entries.sort((left, right) => right.priority - left.priority || left.path.localeCompare(right.path)),
  }, null, 2), 'utf8');
}
