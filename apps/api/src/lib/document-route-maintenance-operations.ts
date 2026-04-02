import { loadDocumentCategoryConfig } from './document-config.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { DEFAULT_SCAN_DIR, loadParsedDocuments } from './document-store.js';
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

export async function runDocumentVectorRebuildAction() {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const { items } = await loadParsedDocuments(200, false, config.scanRoots);
  return rebuildDocumentVectorIndex(items);
}
