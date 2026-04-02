import { loadDocumentCategoryConfig } from './document-config.js';
import { buildDocumentId, DEFAULT_SCAN_DIR, loadParsedDocuments } from './document-store.js';

export async function loadDocumentStateSnapshot() {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const parsed = await loadParsedDocuments(200, false, config.scanRoots);
  return { config, ...parsed };
}

export async function loadIndexedDocumentById(id: string) {
  const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const { items } = await loadParsedDocuments(200, false, documentConfig.scanRoots);
  const found = items.find((item) => buildDocumentId(item.path) === id);
  return { documentConfig, found };
}

export async function loadIndexedDocumentMap() {
  const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const { items } = await loadParsedDocuments(200, false, documentConfig.scanRoots);
  return {
    documentConfig,
    items,
    byId: new Map(items.map((item) => [buildDocumentId(item.path), item])),
  };
}
