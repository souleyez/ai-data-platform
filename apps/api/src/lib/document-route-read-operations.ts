import { loadDocumentCategoryConfig } from './document-config.js';
import { attachDocumentExtractionSettings, loadDocumentExtractionGovernance } from './document-extraction-governance.js';
import { loadDocumentLibraries } from './document-libraries.js';
import {
  buildDocumentLibrariesPayload,
  buildDocumentsIndexPayload,
  buildDocumentsOverviewPayload,
} from './document-route-read-models.js';
import { readOpenClawMemorySyncStatus } from './openclaw-memory-sync.js';
import { DEFAULT_SCAN_DIR, loadParsedDocuments } from './document-store.js';
import { loadDocumentStateSnapshot } from './document-route-loaders.js';

export async function loadDocumentLibrariesPayload() {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const startedAt = Date.now();
  const [{ items, generatedAt, loadedFrom }, libraries, extractionGovernance] = await Promise.all([
    loadParsedDocuments(200, false, config.scanRoots, {
      skipBackgroundTasks: true,
    }),
    loadDocumentLibraries(),
    Promise.resolve(loadDocumentExtractionGovernance()),
  ]);

  return buildDocumentLibrariesPayload({
    items,
    libraries: attachDocumentExtractionSettings(libraries, extractionGovernance),
    generatedAt,
    loadedFrom,
    durationMs: Date.now() - startedAt,
  });
}

export async function loadDocumentsIndexRoutePayload() {
  const startedAt = Date.now();
  const { config, exists, files, totalFiles, items, cacheHit, generatedAt, loadedFrom } = await loadDocumentStateSnapshot();
  const [libraries, memorySync, extractionGovernance] = await Promise.all([
    loadDocumentLibraries(),
    readOpenClawMemorySyncStatus(),
    Promise.resolve(loadDocumentExtractionGovernance()),
  ]);

  return buildDocumentsIndexPayload({
    config,
    exists,
    files,
    totalFiles,
    items,
    cacheHit,
    generatedAt,
    loadedFrom,
    durationMs: Date.now() - startedAt,
    libraries: attachDocumentExtractionSettings(libraries, extractionGovernance),
    memorySync,
  });
}

export async function loadDocumentsOverviewRoutePayload() {
  const startedAt = Date.now();
  const { config, exists, files, totalFiles, items, cacheHit, generatedAt, loadedFrom } = await loadDocumentStateSnapshot();
  const [libraries, memorySync, extractionGovernance] = await Promise.all([
    loadDocumentLibraries(),
    readOpenClawMemorySyncStatus(),
    Promise.resolve(loadDocumentExtractionGovernance()),
  ]);

  return buildDocumentsOverviewPayload({
    config,
    exists,
    files,
    totalFiles,
    items,
    cacheHit,
    generatedAt,
    loadedFrom,
    durationMs: Date.now() - startedAt,
    libraries: attachDocumentExtractionSettings(libraries, extractionGovernance),
    memorySync,
  });
}
