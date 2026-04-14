import { readDocumentCache } from './document-cache-repository.js';
import { documentMatchesLibrary, loadDocumentLibraries } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import {
  buildLibraryKnowledgeCompilation,
  isLibraryKnowledgePagesEnabled,
  sortDocumentsByRecency,
} from './library-knowledge-pages-builders.js';
import { buildLibraryKnowledgePagesContextBlock } from './library-knowledge-pages-context.js';
import {
  loadLibraryKnowledgeCompilationsForKeys,
  removeLibraryKnowledgeFiles,
  writeLibraryKnowledgeFiles,
} from './library-knowledge-pages-storage.js';

export type {
  LibraryKnowledgeCompilation,
  LibraryKnowledgeFieldConflict,
  LibraryKnowledgeFocusedFieldCoverage,
  LibraryKnowledgePagesMode,
  LibraryKnowledgeRepresentativeDocument,
  LibraryKnowledgeUpdateEntry,
} from './library-knowledge-pages-types.js';
export { buildLibraryKnowledgePagesContextBlock } from './library-knowledge-pages-context.js';
export { loadLibraryKnowledgeCompilationsForKeys } from './library-knowledge-pages-storage.js';

export async function syncLibraryKnowledgePagesForLibraryKeys(libraryKeys: string[], reason: string) {
  const normalizedKeys = [...new Set((libraryKeys || []).map((item) => String(item || '').trim()).filter(Boolean))];
  if (!normalizedKeys.length) {
    return { updatedLibraryCount: 0, removedLibraryCount: 0 };
  }

  const [libraries, cache] = await Promise.all([loadDocumentLibraries(), readDocumentCache()]);
  const items = cache?.items || [];
  let updatedLibraryCount = 0;
  let removedLibraryCount = 0;

  for (const libraryKey of normalizedKeys) {
    const library = libraries.find((item) => item.key === libraryKey);
    if (!library) continue;
    if (!isLibraryKnowledgePagesEnabled(library)) {
      await removeLibraryKnowledgeFiles(library.key);
      removedLibraryCount += 1;
      continue;
    }

    const matchedItems = sortDocumentsByRecency(
      items.filter((item) => item.parseStatus === 'parsed' && documentMatchesLibrary(item, library)),
    );
    if (!matchedItems.length) {
      await removeLibraryKnowledgeFiles(library.key);
      removedLibraryCount += 1;
      continue;
    }

    await writeLibraryKnowledgeFiles(
      buildLibraryKnowledgeCompilation(library, matchedItems, matchedItems.slice(0, 4), reason),
    );
    updatedLibraryCount += 1;
  }

  return { updatedLibraryCount, removedLibraryCount };
}

export async function syncLibraryKnowledgePagesForDocuments(items: ParsedDocument[], reason: string) {
  const normalizedItems = (items || []).filter((item) => item && item.parseStatus === 'parsed');
  if (!normalizedItems.length) {
    return { updatedLibraryCount: 0, removedLibraryCount: 0 };
  }

  const [libraries, cache] = await Promise.all([loadDocumentLibraries(), readDocumentCache()]);
  const allItems = cache?.items || [];
  const affectedKeys = new Set<string>();

  for (const item of normalizedItems) {
    for (const library of libraries) {
      if (documentMatchesLibrary(item, library)) affectedKeys.add(library.key);
    }
  }

  let updatedLibraryCount = 0;
  let removedLibraryCount = 0;

  for (const libraryKey of affectedKeys) {
    const library = libraries.find((entry) => entry.key === libraryKey);
    if (!library) continue;
    if (!isLibraryKnowledgePagesEnabled(library)) continue;

    const matchedItems = sortDocumentsByRecency(
      allItems.filter((item) => item.parseStatus === 'parsed' && documentMatchesLibrary(item, library)),
    );
    const changedItems = normalizedItems.filter((item) => documentMatchesLibrary(item, library));

    if (!matchedItems.length) {
      await removeLibraryKnowledgeFiles(library.key);
      removedLibraryCount += 1;
      continue;
    }

    await writeLibraryKnowledgeFiles(
      buildLibraryKnowledgeCompilation(library, matchedItems, changedItems, reason),
    );
    updatedLibraryCount += 1;
  }

  return { updatedLibraryCount, removedLibraryCount };
}
