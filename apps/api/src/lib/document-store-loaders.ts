import path from 'node:path';
import { refreshDerivedSchemaProfile, type ParsedDocument } from './document-parser.js';
import {
  applyDetailedParseQueueMetadata,
  clearDetailedParseQueueEntries,
  enqueueDetailedParse,
} from './document-deep-parse-queue.js';
import { readDocumentCache } from './document-cache-repository.js';
import { replaceDocumentKnowledgeSnapshot } from './document-knowledge-lifecycle.js';
import { syncLibraryKnowledgePagesForDocuments } from './library-knowledge-pages.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { supportsMarkItDownExtension } from './document-markdown-provider.js';
import { buildDocumentLibraryContext, type DocumentLibraryContext } from './document-extraction-governance.js';
import { applyDocumentOverrides, loadDocumentOverrides } from './document-overrides.js';
import {
  DEFAULT_SCAN_DIR,
  buildScanSignature,
  dedupeDocuments,
  getCurrentFiles,
  resolveScanRoots,
  sameScanRoots,
  sortDocumentsByRecency,
} from './document-scan-runtime.js';
import { mergeWithRetainedDocuments, sanitizeParsedDocument } from './document-store-normalization.js';
import { parseDocumentFiles } from './document-store-parse-runtime.js';
import { scheduleDocumentVectorIndexSync } from './document-store-vector-sync.js';

function shouldQueueForDetailedParse(item: ParsedDocument) {
  return item.parseStage !== 'detailed'
    && (
      item.parseStatus === 'parsed'
      || item.parseStatus === 'error'
      || supportsMarkItDownExtension(item.ext)
    );
}

function normalizeDocumentPathKey(filePath: string) {
  return path.resolve(String(filePath || '')).toLowerCase();
}

export type LoadParsedDocumentsResult = {
  exists: boolean;
  files: string[];
  totalFiles?: number;
  items: ParsedDocument[];
  cacheHit: boolean;
  generatedAt?: string;
  loadedFrom?: 'cache' | 'scan';
};

export async function loadParsedDocuments(
  limit = 200,
  forceRefresh = false,
  scanRoot?: string | string[],
  options?: { skipBackgroundTasks?: boolean },
): Promise<LoadParsedDocumentsResult> {
  const cache = !forceRefresh ? await readDocumentCache() : null;
  const skipBackgroundTasks = options?.skipBackgroundTasks === true;
  const configuredScanRoots = await resolveScanRoots(scanRoot);

  if (cache && sameScanRoots(cache.scanRoots || [cache.scanRoot], configuredScanRoots)) {
    if (!skipBackgroundTasks) {
      await enqueueDetailedParse(
        cache.items
          .filter((item) => shouldQueueForDetailedParse(item))
          .map((item) => item.path),
      );
    }
    const overrides = await loadDocumentOverrides();
    const mergedItems = dedupeDocuments(sortDocumentsByRecency(
      await mergeWithRetainedDocuments(
        await applyDetailedParseQueueMetadata(
          applyDocumentOverrides(cache.items, overrides)
            .map((item) => refreshDerivedSchemaProfile(item))
            .map(sanitizeParsedDocument),
        ),
      ),
    ));
    if (!skipBackgroundTasks) {
      scheduleDocumentVectorIndexSync(mergedItems);
    }
    return {
      exists: true,
      files: [],
      totalFiles: cache.totalFiles || cache.items.length,
      items: mergedItems.slice(0, limit),
      cacheHit: true,
      generatedAt: cache.generatedAt || new Date().toISOString(),
      loadedFrom: 'cache',
    };
  }

  const { exists, files, scanRoot: activeScanRoot, scanRoots: resolvedScanRoots } = await getCurrentFiles(configuredScanRoots);
  if (!exists) {
    return { exists, files, totalFiles: 0, items: [], cacheHit: false };
  }

  const generatedAt = new Date().toISOString();
  const scanSignature = await buildScanSignature(files);
  const items = await parseDocumentFiles(files.slice(0, limit), resolvedScanRoots, {
    parseStage: 'quick',
    cloudEnhancement: false,
  });
  const mergedItems = dedupeDocuments(sortDocumentsByRecency(await mergeWithRetainedDocuments(items)));
  await replaceDocumentKnowledgeSnapshot({
    cachePayload: {
      generatedAt,
      scanRoot: activeScanRoot,
      scanRoots: resolvedScanRoots,
      totalFiles: files.length,
      scanSignature,
      indexedPaths: files,
      items,
    },
    queuePaths: items
      .filter((item) => shouldQueueForDetailedParse(item))
      .map((item) => item.path),
    vectorItems: mergedItems,
    memorySyncMode: 'scheduled',
    memorySyncReason: 'document-scan-refresh',
  });

  return {
    exists,
    files,
    totalFiles: files.length,
    items: mergedItems,
    cacheHit: false,
    generatedAt,
    loadedFrom: 'scan',
  };
}

export async function mergeParsedDocumentsForPaths(
  filePaths: string[],
  limit = 200,
  scanRoot?: string | string[],
  options?: { parseStage?: 'quick' | 'detailed'; cloudEnhancement?: boolean; clearQueueEntries?: boolean },
): Promise<LoadParsedDocumentsResult> {
  const { exists, files, scanRoot: activeScanRoot, scanRoots: activeScanRoots } = await getCurrentFiles(scanRoot);

  if (!exists) {
    return { exists, files, totalFiles: 0, items: [], cacheHit: false };
  }

  const requestedPaths = [...new Set(filePaths)];
  const cache = await readDocumentCache();

  if (!cache || !sameScanRoots(cache.scanRoots || [cache.scanRoot], activeScanRoots)) {
    return loadParsedDocuments(limit, true, activeScanRoots);
  }

  const effectiveParseStage = options?.parseStage || 'detailed';
  const filePathByKey = new Map(files.map((filePath) => [normalizeDocumentPathKey(filePath), filePath]));
  const cacheItemByKey = new Map(cache.items.map((item) => [normalizeDocumentPathKey(item.path), item]));
  const existingFilePaths = requestedPaths
    .map((filePath) => filePathByKey.get(normalizeDocumentPathKey(filePath)))
    .filter((filePath): filePath is string => Boolean(filePath));
  if (effectiveParseStage === 'detailed' && options?.clearQueueEntries) {
    await clearDetailedParseQueueEntries(existingFilePaths);
  }
  const libraries = await loadDocumentLibraries();
  const libraryContextByPath = new Map<string, DocumentLibraryContext>();
  for (const filePath of requestedPaths) {
    const cachedItem = cacheItemByKey.get(normalizeDocumentPathKey(filePath));
    if (!cachedItem) continue;
    const libraryContext = buildDocumentLibraryContext(
      libraries,
      cachedItem.confirmedGroups?.length ? cachedItem.confirmedGroups : cachedItem.groups || [],
    );
    if (libraryContext) {
      libraryContextByPath.set(filePath, libraryContext);
    }
  }
  const reparsedItems = await parseDocumentFiles(
    existingFilePaths,
    activeScanRoots,
    {
      cloudEnhancement: options?.cloudEnhancement ?? false,
      parseStage: effectiveParseStage,
      libraryContextByPath,
    },
  );

  const mergedByPath = new Map(
    cache.items.map((item) => [normalizeDocumentPathKey(item.path), refreshDerivedSchemaProfile(item)]),
  );
  for (const item of reparsedItems) {
    mergedByPath.set(normalizeDocumentPathKey(item.path), item);
  }

  const items = dedupeDocuments(
    sortDocumentsByRecency(
      [...mergedByPath.values()].filter((item) => filePathByKey.has(normalizeDocumentPathKey(item.path))),
    ),
  );

  const scanSignature = await buildScanSignature(files);
  const mergedItems = dedupeDocuments(sortDocumentsByRecency(await mergeWithRetainedDocuments(items)));
  await replaceDocumentKnowledgeSnapshot({
    cachePayload: {
      generatedAt: new Date().toISOString(),
      scanRoot: activeScanRoot,
      scanRoots: activeScanRoots,
      totalFiles: files.length,
      scanSignature,
      indexedPaths: files,
      items,
    },
    vectorItems: mergedItems,
    memorySyncMode: effectiveParseStage === 'detailed' ? 'immediate' : 'scheduled',
    memorySyncReason: effectiveParseStage === 'detailed'
      ? 'document-merge-detailed'
      : 'document-merge-quick',
  });
  if (effectiveParseStage === 'detailed') {
    await syncLibraryKnowledgePagesForDocuments(
      reparsedItems.filter((item) => item.parseStatus === 'parsed'),
      'document-merge-detailed',
    ).catch(() => undefined);
  }
  return { exists, files, totalFiles: files.length, items: mergedItems, cacheHit: false };
}
