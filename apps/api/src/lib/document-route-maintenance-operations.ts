import { loadDocumentCategoryConfig } from './document-config.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { loadIndexedDocumentMap } from './document-route-loaders.js';
import { DEFAULT_SCAN_DIR, loadParsedDocuments } from './document-store.js';
import { mergeParsedDocumentsForPaths } from './document-store.js';
import { runDetailedParseBatch } from './document-deep-parse-queue.js';
import { rebuildDocumentVectorIndex } from './document-vector-index.js';
import {
  autoAssignSuggestedLibraries,
  reclusterUngroupedDocuments,
} from './document-route-services.js';

export async function runDocumentOrganizeAction() {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const { items } = await loadParsedDocuments(200, false, config.scanRoots);
  const libraries = await loadDocumentLibraries();
  const { updatedCount: organizedCount, ungroupedCount } = await autoAssignSuggestedLibraries(items, libraries);

  return {
    organizedCount,
    ungroupedCount,
    scanRoot: config.scanRoot,
    scanRoots: config.scanRoots,
  };
}

export async function runReclusterUngroupedAction() {
  return reclusterUngroupedDocuments();
}

export async function runDocumentDeepParseAction(limit: unknown) {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  return runDetailedParseBatch(Math.max(1, Math.min(24, Number(limit || 8))), config.scanRoots);
}

export async function runDocumentReparseAction(idsInput: unknown) {
  const ids = Array.isArray(idsInput)
    ? idsInput.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  if (!ids.length) {
    return {
      matchedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      missingIds: [] as string[],
    };
  }

  const { documentConfig, byId } = await loadIndexedDocumentMap();
  const matchedItems = ids
    .map((id) => byId.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const missingIds = ids.filter((id) => !byId.has(id));

  if (!matchedItems.length) {
    return {
      matchedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      missingIds,
    };
  }

  const parsed = await mergeParsedDocumentsForPaths(
    matchedItems.map((item) => item.path),
    200,
    documentConfig.scanRoots,
    { parseStage: 'detailed', cloudEnhancement: true },
  );

  const reparsedByPath = new Map(parsed.items.map((item) => [item.path, item]));
  const succeededCount = matchedItems.filter((item) => reparsedByPath.get(item.path)?.parseStatus === 'parsed').length;
  const failedCount = matchedItems.length - succeededCount;

  return {
    matchedCount: matchedItems.length,
    succeededCount,
    failedCount,
    missingIds,
  };
}

export async function runDocumentVectorRebuildAction() {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const { items } = await loadParsedDocuments(200, false, config.scanRoots);
  return rebuildDocumentVectorIndex(items);
}
