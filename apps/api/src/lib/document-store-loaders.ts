import { refreshDerivedSchemaProfile, type ParsedDocument } from './document-parser.js';
import { applyDetailedParseQueueMetadata, enqueueDetailedParse } from './document-deep-parse-queue.js';
import { readDocumentCache, writeDocumentCache } from './document-cache-repository.js';
import { applyDocumentOverrides, loadDocumentOverrides } from './document-overrides.js';
import {
  DEFAULT_SCAN_DIR,
  buildScanSignature,
  dedupeDocuments,
  getCurrentFiles,
  sameScanRoots,
  sortDocumentsByRecency,
} from './document-scan-runtime.js';
import { mergeWithRetainedDocuments, sanitizeParsedDocument } from './document-store-normalization.js';
import { parseDocumentFiles } from './document-store-parse-runtime.js';
import { scheduleDocumentVectorIndexSync } from './document-store-vector-sync.js';

export type LoadParsedDocumentsResult = {
  exists: boolean;
  files: string[];
  totalFiles?: number;
  items: ParsedDocument[];
  cacheHit: boolean;
};

export async function loadParsedDocuments(
  limit = 200,
  forceRefresh = false,
  scanRoot?: string | string[],
  options?: { skipBackgroundTasks?: boolean },
): Promise<LoadParsedDocumentsResult> {
  const currentFiles = await getCurrentFiles(scanRoot);
  const activeScanRoots = currentFiles.scanRoots;
  const cache = !forceRefresh ? await readDocumentCache() : null;
  const skipBackgroundTasks = options?.skipBackgroundTasks === true;

  if (cache) {
    if (!skipBackgroundTasks) {
      await enqueueDetailedParse(
        cache.items
          .filter((item) => item.parseStatus === 'parsed' && item.parseStage !== 'detailed')
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
      cacheHit: sameScanRoots(cache.scanRoots || [cache.scanRoot], activeScanRoots),
    };
  }

  const { exists, files, scanRoot: activeScanRoot, scanRoots: resolvedScanRoots } = currentFiles;
  if (!exists) {
    return { exists, files, totalFiles: 0, items: [], cacheHit: false };
  }

  const scanSignature = await buildScanSignature(files);
  const items = await parseDocumentFiles(files.slice(0, limit), resolvedScanRoots, {
    parseStage: 'quick',
    cloudEnhancement: false,
  });
  await enqueueDetailedParse(items.filter((item) => item.parseStatus === 'parsed').map((item) => item.path));
  await writeDocumentCache({
    generatedAt: new Date().toISOString(),
    scanRoot: activeScanRoot,
    scanRoots: resolvedScanRoots,
    totalFiles: files.length,
    scanSignature,
    indexedPaths: files,
    items,
  });

  const mergedItems = dedupeDocuments(sortDocumentsByRecency(await mergeWithRetainedDocuments(items)));
  scheduleDocumentVectorIndexSync(mergedItems);
  return { exists, files, totalFiles: files.length, items: mergedItems, cacheHit: false };
}

export async function mergeParsedDocumentsForPaths(
  filePaths: string[],
  limit = 200,
  scanRoot?: string | string[],
  options?: { parseStage?: 'quick' | 'detailed'; cloudEnhancement?: boolean },
): Promise<LoadParsedDocumentsResult> {
  const { exists, files, scanRoot: activeScanRoot, scanRoots: activeScanRoots } = await getCurrentFiles(scanRoot);

  if (!exists) {
    return { exists, files, totalFiles: 0, items: [], cacheHit: false };
  }

  const normalizedPaths = [...new Set(filePaths)];
  const cache = await readDocumentCache();

  if (!cache || !sameScanRoots(cache.scanRoots || [cache.scanRoot], activeScanRoots)) {
    return loadParsedDocuments(limit, true, activeScanRoots);
  }

  const reparsedItems = await parseDocumentFiles(
    normalizedPaths.filter((filePath) => files.includes(filePath)),
    activeScanRoots,
    {
      cloudEnhancement: options?.cloudEnhancement ?? false,
      parseStage: options?.parseStage || 'detailed',
    },
  );

  const mergedByPath = new Map(cache.items.map((item) => [item.path, refreshDerivedSchemaProfile(item)]));
  for (const item of reparsedItems) {
    mergedByPath.set(item.path, item);
  }

  const items = dedupeDocuments(
    sortDocumentsByRecency(
      [...mergedByPath.values()].filter((item) => files.includes(item.path)),
    ),
  );

  const scanSignature = await buildScanSignature(files);
  await writeDocumentCache({
    generatedAt: new Date().toISOString(),
    scanRoot: activeScanRoot,
    scanRoots: activeScanRoots,
    totalFiles: files.length,
    scanSignature,
    indexedPaths: files,
    items,
  });

  const mergedItems = dedupeDocuments(sortDocumentsByRecency(await mergeWithRetainedDocuments(items)));
  scheduleDocumentVectorIndexSync(mergedItems);
  return { exists, files, totalFiles: files.length, items: mergedItems, cacheHit: false };
}
