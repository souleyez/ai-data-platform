import { loadDocumentCategoryConfig } from './document-config.js';
import { documentMatchesLibrary, loadDocumentLibraries, UNGROUPED_LIBRARY_KEY, UNGROUPED_LIBRARY_LABEL } from './document-libraries.js';
import { DEFAULT_SCAN_DIR } from './document-scan-runtime.js';
import type { KnowledgeLibraryRef } from './knowledge-supply-types.js';
import type { KnowledgeScopedDocumentItem } from './knowledge-supply-scope-fallback.js';

export function normalizePreferredLibraries(preferredLibraries?: KnowledgeLibraryRef[]) {
  return Array.isArray(preferredLibraries)
    ? preferredLibraries
        .map((item) => ({ key: String(item?.key || '').trim(), label: String(item?.label || '').trim() }))
        .filter((item) => item.key || item.label)
    : [];
}

export async function deriveScopedLibrariesFromItems(
  scopedItems: KnowledgeScopedDocumentItem[],
  documentLibraries: Awaited<ReturnType<typeof loadDocumentLibraries>>,
  visibleLibraries: Awaited<ReturnType<typeof loadDocumentLibraries>>,
) {
  const derivedLibraries = documentLibraries
    .filter((library) => visibleLibraries.some((visible) => visible.key === library.key))
    .filter((library) => scopedItems.some((item) => documentMatchesLibrary(item, library)))
    .map((library) => ({ key: library.key, label: library.label }));
  if (derivedLibraries.length) return derivedLibraries;

  const groupKeys = [...new Set(
    scopedItems.flatMap((item) => (
      (item.confirmedGroups?.length ? item.confirmedGroups : item.groups || [])
        .map((group) => String(group || '').trim())
        .filter(Boolean)
    )),
  )];
  if (!groupKeys.length) return [];

  const categoryConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const categoryLabelByKey = new Map(
    Object.entries(categoryConfig.categories || {}).map(([key, value]) => [key, String(value?.label || '').trim() || key]),
  );

  return groupKeys.map((key) => {
    const visibleLibrary = visibleLibraries.find((item) => item.key === key);
    if (visibleLibrary) {
      return { key: visibleLibrary.key, label: visibleLibrary.label };
    }
    if (key === UNGROUPED_LIBRARY_KEY) {
      return { key, label: UNGROUPED_LIBRARY_LABEL };
    }
    return { key, label: categoryLabelByKey.get(key) || key };
  });
}
