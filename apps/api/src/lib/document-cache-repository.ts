import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { scheduleOpenClawMemoryCatalogSync } from './openclaw-memory-sync.js';
import { STORAGE_CACHE_DIR } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

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
  const { data } = await readRuntimeStateJson<DocumentCachePayload | null>({
    filePath: CACHE_FILE,
    fallback: null,
    normalize: (parsed) => {
      if (!parsed || typeof parsed !== 'object') return null;
      const payload = parsed as Partial<DocumentCachePayload>;
      if (!Array.isArray(payload.items)) return null;
      return {
        generatedAt: String(payload.generatedAt || '').trim() || new Date().toISOString(),
        scanRoot: String(payload.scanRoot || '').trim(),
        scanRoots: Array.isArray(payload.scanRoots) ? payload.scanRoots.map((item) => String(item || '').trim()).filter(Boolean) : undefined,
        totalFiles: Number(payload.totalFiles || payload.items.length || 0),
        scanSignature: String(payload.scanSignature || '').trim(),
        indexedPaths: Array.isArray(payload.indexedPaths) ? payload.indexedPaths.map((item) => String(item || '').trim()).filter(Boolean) : undefined,
        items: payload.items as ParsedDocument[],
      };
    },
  });
  return data;
}

export async function writeDocumentCache(payload: DocumentCachePayload) {
  await ensureCacheDir();
  await writeRuntimeStateJson({
    filePath: CACHE_FILE,
    payload,
  });
  scheduleOpenClawMemoryCatalogSync('document-cache-write');
}
