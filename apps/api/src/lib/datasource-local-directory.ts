import path from 'node:path';
import { promises as fs } from 'node:fs';
import { loadDocumentCategoryConfig } from './document-config.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { loadDocumentOverrides } from './document-overrides.js';
import { DEFAULT_SCAN_DIR, listCachedDocumentPaths } from './document-store.js';
import { ingestExistingLocalFiles } from './document-upload-ingest.js';

const LOCAL_DIRECTORY_ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.docx',
  '.csv',
  '.html',
  '.htm',
  '.xml',
  '.xlsx',
  '.xls',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
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

function isAllowedExtension(fileName: string) {
  return LOCAL_DIRECTORY_ALLOWED_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

async function listLocalFilesRecursive(root: string) {
  const results: string[] = [];
  const stack = [root];

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
      if (!isAllowedExtension(entry.name)) continue;
      results.push(fullPath);
    }
  }

  return results;
}

export async function runLocalDirectoryDatasource(input: {
  directory: string;
  targetLibraryKeys: string[];
  maxItems?: number;
}) {
  const directory = path.resolve(String(input.directory || '').trim());
  if (!directory) {
    throw new Error('local directory path is required');
  }

  let directoryStat: Awaited<ReturnType<typeof fs.stat>> | null = null;
  try {
    directoryStat = await fs.stat(directory);
  } catch {
    directoryStat = null;
  }

  if (!directoryStat?.isDirectory()) {
    throw new Error('local directory path is not a readable folder');
  }

  const [documentConfig, libraries, cachedPaths, overrides] = await Promise.all([
    loadDocumentCategoryConfig(DEFAULT_SCAN_DIR),
    loadDocumentLibraries(),
    listCachedDocumentPaths(),
    loadDocumentOverrides(),
  ]);
  const targetKeySet = new Set(input.targetLibraryKeys.filter((key) => libraries.some((library) => library.key === key)));
  const knownPaths = new Set<string>([
    ...cachedPaths,
    ...Object.keys(overrides || {}),
  ]);
  const maxItems = Math.max(1, Number(input.maxItems || 20));

  const discoveredFiles = await listLocalFilesRecursive(directory);
  const candidates = discoveredFiles.filter((filePath) => !knownPaths.has(filePath));
  const planned = candidates.slice(0, maxItems);
  const ingestResult = await ingestExistingLocalFiles({
    filePaths: planned,
    documentConfig,
    libraries,
    preferredLibraryKeys: [...targetKeySet],
  });
  const failedPaths = ingestResult.ingestItems
    .filter((item) => item.status === 'failed')
    .map((item) => String(item.sourceName || ''))
    .filter(Boolean);
  const ingestedPaths = ingestResult.parsedItems.map((item) => item.path);

  return {
    directory,
    discoveredCount: discoveredFiles.length,
    candidateCount: candidates.length,
    plannedCount: planned.length,
    ingestedCount: ingestResult.summary.successCount,
    failedCount: ingestResult.summary.failedCount,
    ingestedPaths,
    failedPaths,
    confirmedLibraryKeys: ingestResult.confirmedLibraryKeys,
  };
}
