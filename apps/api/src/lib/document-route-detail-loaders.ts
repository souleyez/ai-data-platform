import path from 'node:path';
import { loadDocumentLibraries } from './document-libraries.js';
import { buildDocumentLibraryContext } from './document-extraction-governance.js';
import { getDocumentParseFeedbackSnapshot } from './document-parse-feedback.js';
import { loadLibraryKnowledgeCompilationsForKeys } from './library-knowledge-pages.js';
import {
  getParsedDocumentCanonicalParseStatus,
  getParsedDocumentCanonicalSource,
  getParsedDocumentCanonicalText,
} from './document-canonical-text.js';
import {
  hasReadableDocumentSource,
  resolveReadableDocumentSource,
  sanitizeFileName,
} from './document-route-files.js';
import { buildMatchedFolders } from './document-route-read-models.js';
import { loadIndexedDocumentById } from './document-route-loaders.js';
import { parseDetailedDocument } from './document-store-parse-runtime.js';

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
    : await parseDetailedDocument(found.path, documentConfig.scanRoots || documentConfig.scanRoot, {
      libraryContext,
      cloudEnhancement: true,
    }) || found;
  const feedbackSnapshot = getDocumentParseFeedbackSnapshot({
    libraryKeys: found.confirmedGroups?.length ? found.confirmedGroups : found.groups || [],
    schemaType: detailItem.schemaType,
    text: getParsedDocumentCanonicalText(detailItem) || `${detailItem.title || ''}\n${detailItem.summary || ''}`,
  });
  const libraryKnowledge = await loadLibraryKnowledgeCompilationsForKeys(
    found.confirmedGroups?.length ? found.confirmedGroups : found.groups || [],
  );

  return {
    mode: 'read-only' as const,
    item: {
      ...detailItem,
      id,
      canonicalSource: getParsedDocumentCanonicalSource(detailItem),
      canonicalParseStatus: getParsedDocumentCanonicalParseStatus(detailItem),
      ...(options?.includeSourceAvailability
        ? { sourceAvailable: await hasReadableDocumentSource(found.path) }
        : {}),
    },
    feedbackSnapshot,
    libraryKnowledge,
    meta: {
      category: detailItem.category,
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
