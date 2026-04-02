import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { loadDocumentCategoryConfig } from './document-config.js';
import { readDocumentCache, writeDocumentCache, type DocumentCachePayload } from './document-cache-repository.js';
import { STORAGE_FILES_DIR } from './paths.js';

export const DEFAULT_SCAN_DIR = process.env.DOCUMENT_SCAN_DIR || STORAGE_FILES_DIR;

const SCANNABLE_DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.txt', '.md', '.docx', '.csv', '.json', '.html', '.htm', '.xml', '.xlsx', '.xls',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp',
]);

const SKIPPED_DIRECTORY_NAMES = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'bin',
  'obj',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  'cache',
  'Cache',
  'Temp',
  'tmp',
]);

type CachePayload = DocumentCachePayload;

export async function listFilesRecursive(dir: string): Promise<string[]> {
  const results: string[] = [];
  const stack = [dir];

  while (stack.length) {
    const current = stack.pop() as string;
    let entries: Awaited<ReturnType<typeof fs.readdir>> = [];

    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) continue;
      if (!SCANNABLE_DOCUMENT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      results.push(fullPath);
    }
  }

  return results;
}

async function readCache(): Promise<CachePayload | null> {
  return readDocumentCache();
}

export function getIndexedCachePaths(cache?: CachePayload | null) {
  if (!cache) return [] as string[];
  const indexedPaths = Array.isArray(cache.indexedPaths) ? cache.indexedPaths : [];
  if (indexedPaths.length) {
    return [...new Set(indexedPaths.map((item) => String(item || '').trim()).filter(Boolean))];
  }
  return [...new Set((cache.items || []).map((item) => item.path).filter(Boolean))];
}

export async function listCachedDocumentPaths() {
  const cache = await readCache();
  return new Set(getIndexedCachePaths(cache));
}

export function sameScanRoots(left?: string[], right?: string[]) {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}

async function writeCache(payload: CachePayload) {
  await writeDocumentCache(payload);
}

export async function removeDocumentsFromCache(filePaths: string[]) {
  const targets = new Set(filePaths.filter(Boolean));
  if (!targets.size) return;

  const cache = await readCache();
  if (!cache) return;

  const currentIndexedPaths = getIndexedCachePaths(cache);
  const nextItems = cache.items.filter((item) => !targets.has(item.path));
  const nextIndexedPaths = currentIndexedPaths.filter((item) => !targets.has(item));
  const removedCount = currentIndexedPaths.length - nextIndexedPaths.length;
  if (removedCount <= 0) return;

  await writeCache({
    ...cache,
    totalFiles: nextIndexedPaths.length,
    indexedPaths: nextIndexedPaths,
    items: nextItems,
  });
}

export async function upsertDocumentsInCache(items: ParsedDocument[], scanRoot?: string | string[]) {
  if (!items.length) return;

  const cache = await readCache();
  if (!cache) {
    const scanRoots = await resolveScanRoots(scanRoot);
    const activeScanRoot = scanRoots[0] || await resolveScanRoot();
    const nextItems = dedupeDocuments(sortDocumentsByRecency(items));
    const indexedPaths = nextItems.map((item) => item.path).filter(Boolean);
    await writeCache({
      generatedAt: new Date().toISOString(),
      scanRoot: activeScanRoot,
      scanRoots,
      totalFiles: indexedPaths.length,
      scanSignature: '',
      indexedPaths,
      items: nextItems,
    });
    return;
  }

  const indexedPathSet = new Set(getIndexedCachePaths(cache));
  const byPath = new Map(cache.items.map((item) => [item.path, item]));
  for (const item of items) {
    byPath.set(item.path, item);
    indexedPathSet.add(item.path);
  }

  const nextItems = dedupeDocuments(sortDocumentsByRecency([...byPath.values()]));
  const nextIndexedPaths = [...indexedPathSet];
  await writeCache({
    ...cache,
    indexedPaths: nextIndexedPaths,
    items: nextItems,
    totalFiles: Math.max(cache.totalFiles || getIndexedCachePaths(cache).length, nextIndexedPaths.length),
  });
}

export async function buildScanSignature(files: string[]) {
  const stats = await Promise.all(
    files.map(async (filePath) => {
      try {
        const stat = await fs.stat(filePath);
        return `${filePath}:${stat.size}:${Math.floor(stat.mtimeMs)}`;
      } catch {
        return null;
      }
    }),
  );
  return stats.filter(Boolean).sort().join('|');
}

function extractPathTimestamp(filePath: string) {
  const baseName = path.basename(String(filePath || ''));
  const match = baseName.match(/^(\d{13})(?:[-_.]|$)/);
  if (!match) return 0;
  const value = Number(match[1]);
  return value >= 1500000000000 && value <= 4102444800000 ? value : 0;
}

async function sortFilesByRecency(filePaths: string[]) {
  const ranked = await Promise.all(
    filePaths.map(async (filePath) => {
      const pathTimestamp = extractPathTimestamp(filePath);
      if (pathTimestamp > 0) {
        return { filePath, score: pathTimestamp };
      }

      try {
        const stat = await fs.stat(filePath);
        return { filePath, score: Math.floor(stat.mtimeMs) || 0 };
      } catch {
        return { filePath, score: 0 };
      }
    }),
  );

  return ranked
    .sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))
    .map((item) => item.filePath);
}

export function sortDocumentsByRecency<T extends { path?: string; name?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const left = Math.max(extractPathTimestamp(a.path || ''), extractPathTimestamp(a.name || ''));
    const right = Math.max(extractPathTimestamp(b.path || ''), extractPathTimestamp(b.name || ''));
    return right - left || String(a.path || a.name || '').localeCompare(String(b.path || b.name || ''));
  });
}

function buildDeduplicationKey(item: ParsedDocument) {
  const normalizedName = path.basename(String(item.name || item.path || ''))
    .replace(/^~\$/, '')
    .replace(/^\d{13}[-_.]/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const normalizedTitle = String(item.title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const normalizedSummary = String(item.summary || '')
    .slice(0, 120)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${item.category || 'general'}|${normalizedName}|${normalizedTitle || normalizedSummary}`;
}

export function dedupeDocuments(items: ParsedDocument[]) {
  const deduped: ParsedDocument[] = [];
  const seen = new Set<string>();

  for (const item of sortDocumentsByRecency(items)) {
    const key = buildDeduplicationKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

async function resolveScanRoot(scanRoot?: string) {
  if (scanRoot) return scanRoot;
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  return config.scanRoot || DEFAULT_SCAN_DIR;
}

export async function resolveScanRoots(scanRoot?: string | string[]) {
  if (Array.isArray(scanRoot) && scanRoot.length) return [...new Set(scanRoot)];
  if (typeof scanRoot === 'string' && scanRoot) return [scanRoot];
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  return (config.scanRoots?.length ? config.scanRoots : [config.scanRoot || DEFAULT_SCAN_DIR]).filter(Boolean);
}

export async function getCurrentFiles(scanRoot?: string | string[]) {
  const activeScanRoots = await resolveScanRoots(scanRoot);
  const fileGroups = await Promise.all(
    activeScanRoots.map(async (root) => {
      try {
        return await listFilesRecursive(root);
      } catch {
        return [];
      }
    }),
  );
  const files = await sortFilesByRecency(Array.from(new Set(fileGroups.flat())));
  return {
    exists: files.length > 0,
    files,
    scanRoot: activeScanRoots[0] || await resolveScanRoot(),
    scanRoots: activeScanRoots,
  };
}
