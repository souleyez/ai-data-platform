import { loadDocumentCategoryConfig } from './document-config.js';
import { buildDocumentId, DEFAULT_SCAN_DIR, loadParsedDocuments } from './document-store.js';

type DocumentRouteLoaderOptions = {
  skipBackgroundTasks?: boolean;
};

function resolveSkipBackgroundTasks(options?: DocumentRouteLoaderOptions) {
  return options?.skipBackgroundTasks !== false;
}

export async function loadDocumentStateSnapshot(options?: DocumentRouteLoaderOptions) {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const parsed = await loadParsedDocuments(200, false, config.scanRoots, {
    skipBackgroundTasks: resolveSkipBackgroundTasks(options),
  });
  return { config, ...parsed };
}

export async function loadIndexedDocumentById(id: string, options?: DocumentRouteLoaderOptions) {
  const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const { items } = await loadParsedDocuments(200, false, documentConfig.scanRoots, {
    skipBackgroundTasks: resolveSkipBackgroundTasks(options),
  });
  const found = items.find((item) => buildDocumentId(item.path) === id);
  return { documentConfig, found };
}

export async function loadIndexedDocumentMap(options?: DocumentRouteLoaderOptions) {
  const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const { items } = await loadParsedDocuments(200, false, documentConfig.scanRoots, {
    skipBackgroundTasks: resolveSkipBackgroundTasks(options),
  });
  return {
    documentConfig,
    items,
    byId: new Map(items.map((item) => [buildDocumentId(item.path), item])),
  };
}
