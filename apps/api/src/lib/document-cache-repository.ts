import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { scheduleOpenClawMemoryCatalogSync } from './openclaw-memory-sync.js';
import { STORAGE_CACHE_DIR } from './paths.js';

export type DocumentCachePayload = {
  generatedAt: string;
  scanRoot: string;
  scanRoots?: string[];
  totalFiles: number;
  scanSignature: string;
  indexedPaths?: string[];
  items: ParsedDocument[];
};

const CACHE_FILE = path.join(STORAGE_CACHE_DIR, 'documents-cache.json');

async function ensureCacheDir() {
  await fs.mkdir(STORAGE_CACHE_DIR, { recursive: true });
}

export async function readDocumentCache(): Promise<DocumentCachePayload | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(raw) as DocumentCachePayload;
  } catch {
    return null;
  }
}

export async function writeDocumentCache(payload: DocumentCachePayload) {
  await ensureCacheDir();
  await fs.writeFile(CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  scheduleOpenClawMemoryCatalogSync('document-cache-write');
}
