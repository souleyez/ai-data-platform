import path from 'node:path';
import { loadDocumentLibraries } from './document-libraries.js';
import { buildDocumentLibraryContext } from './document-extraction-governance.js';
import { parseDocument } from './document-parser.js';
import {
  hasReadableDocumentSource,
  resolveReadableDocumentSource,
  sanitizeFileName,
} from './document-route-files.js';
import { buildMatchedFolders } from './document-route-read-models.js';
import { loadIndexedDocumentById } from './document-route-loaders.js';

export async function loadDocumentDetailPayload(id: string, options?: { includeSourceAvailability?: boolean }) {
  const { documentConfig, found } = await loadIndexedDocumentById(id);
  if (!found) return null;
  const libraries = await loadDocumentLibraries();
  const libraryContext = buildDocumentLibraryContext(
    libraries,
    found.confirmedGroups?.length ? found.confirmedGroups : found.groups || [],
  );

  const detailItem = found.fullText && found.parseStage === 'detailed'
    ? found
    : await parseDocument(found.path, documentConfig, { stage: 'detailed', libraryContext });

  return {
    mode: 'read-only' as const,
    item: {
      ...detailItem,
      id,
      ...(options?.includeSourceAvailability
        ? { sourceAvailable: await hasReadableDocumentSource(found.path) }
        : {}),
    },
    meta: {
      category: detailItem.category,
      bizCategory: detailItem.bizCategory,
      parseStatus: detailItem.parseStatus,
      matchedFolders: buildMatchedFolders(documentConfig.categories, found.path),
    },
  };
}

export async function loadReadableDocumentAsset(id: string) {
  const { found } = await loadIndexedDocumentById(id);
  if (!found) return null;

  return {
    item: found,
    readablePath: await resolveReadableDocumentSource(found.path),
    fileName: sanitizeFileName(found.name || path.basename(found.path)),
  };
}
