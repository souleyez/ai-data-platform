import { extractDocumentTimestamp, getDocumentLibraryKeys } from '../lib/knowledge-libraries';

export function isUngroupedDocument(item) {
  return !(item?.confirmedGroups?.length) && !(item?.suggestedGroups?.length);
}

export function buildVisibleItems(items) {
  return (items || []).filter((item) => !item.ignored && item.parseStatus !== 'error');
}

export function buildFilteredItems({
  visibleItems,
  keyword,
  activeExtension,
  activeLibrary,
  libraries,
  libraryLabelMap,
}) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  return visibleItems
    .filter((item) => {
      const effectiveGroups = getDocumentLibraryKeys(item, libraries);
      const extensionMatch = activeExtension === 'all' || item.ext === activeExtension;
      const libraryMatch = activeLibrary === 'all'
        || (activeLibrary === 'ungrouped'
          ? isUngroupedDocument(item)
          : effectiveGroups.includes(activeLibrary));
      const haystack = [
        String(item?.name || ''),
        String(item?.summary || ''),
        String(item?.excerpt || ''),
        (Array.isArray(item?.topicTags) ? item.topicTags : []).join(' '),
        effectiveGroups.map((group) => libraryLabelMap.get(group) || group).join(' '),
      ].join(' ').toLowerCase();

      return extensionMatch && libraryMatch && (!normalizedKeyword || haystack.includes(normalizedKeyword));
    })
    .sort((a, b) => extractDocumentTimestamp(b) - extractDocumentTimestamp(a) || String(b.path).localeCompare(String(a.path)));
}

export function buildExtensionSummary(byExtension) {
  return byExtension ? Object.entries(byExtension) : [];
}

export function countRecentDocuments(items) {
  return items.filter((item) => extractDocumentTimestamp(item) > 0).slice(0, 10).length;
}

export function paginateItems(items, currentPage, pageSize) {
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
