import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseDocument, type ParsedDocument } from './document-parser.js';

export const DEFAULT_SCAN_DIR = process.env.DOCUMENT_SCAN_DIR || path.resolve(process.cwd(), '../../storage/files');
const CACHE_DIR = path.resolve(process.cwd(), '../../storage/cache');
const CACHE_FILE = path.join(CACHE_DIR, 'documents-cache.json');

type CachePayload = {
  generatedAt: string;
  scanRoot: string;
  totalFiles: number;
  items: ParsedDocument[];
};

export async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFilesRecursive(fullPath);
      return [fullPath];
    }),
  );
  return nested.flat();
}

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function readCache(): Promise<CachePayload | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(raw) as CachePayload;
  } catch {
    return null;
  }
}

async function writeCache(payload: CachePayload) {
  await ensureCacheDir();
  await fs.writeFile(CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

export async function loadParsedDocuments(limit = 200, forceRefresh = false): Promise<{ exists: boolean; files: string[]; items: ParsedDocument[]; cacheHit: boolean }> {
  let files: string[] = [];
  let exists = true;

  try {
    files = await listFilesRecursive(DEFAULT_SCAN_DIR);
  } catch {
    exists = false;
  }

  if (!exists) {
    return { exists, files, items: [], cacheHit: false };
  }

  if (!forceRefresh) {
    const cache = await readCache();
    if (cache && cache.scanRoot === DEFAULT_SCAN_DIR && cache.totalFiles === files.length) {
      return { exists, files, items: cache.items.slice(0, limit), cacheHit: true };
    }
  }

  const items = await Promise.all(files.slice(0, limit).map((filePath) => parseDocument(filePath)));
  await writeCache({
    generatedAt: new Date().toISOString(),
    scanRoot: DEFAULT_SCAN_DIR,
    totalFiles: files.length,
    items,
  });

  return { exists, files, items, cacheHit: false };
}

export function buildDocumentId(filePath: string) {
  return Buffer.from(filePath).toString('base64url');
}

export function matchDocumentsByPrompt(items: ParsedDocument[], prompt: string) {
  const text = prompt.toLowerCase();
  const keywords = text.split(/\s+/).filter(Boolean);
  return items
    .map((item) => {
      const haystack = `${item.name} ${item.category} ${item.summary}`.toLowerCase();
      const score = keywords.reduce((acc, keyword) => (haystack.includes(keyword) ? acc + 1 : acc), 0);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.item);
}
