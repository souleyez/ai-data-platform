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

export function buildDirectoryOptions({ candidateSources, scanSources, scanRoot }) {
  const byPath = new Map();

  for (const source of scanSources) {
    byPath.set(source, {
      key: `source-${source}`,
      label: source === scanRoot ? '当前主扫描目录' : '已加入扫描源',
      reason: '当前已经纳入文档中心扫描范围。',
      path: source,
      exists: true,
      fileCount: 0,
      latestModifiedAt: 0,
      truncated: false,
      pendingScan: true,
      sampleExtensions: [],
      hotspots: [],
      alreadyAdded: true,
    });
  }

  for (const candidate of candidateSources) {
    byPath.set(candidate.path, {
      ...candidate,
      sampleExtensions: Array.isArray(candidate.sampleExtensions) ? candidate.sampleExtensions : [],
      hotspots: Array.isArray(candidate.hotspots) ? candidate.hotspots : [],
      alreadyAdded: byPath.has(candidate.path),
    });

    for (const hotspot of candidate.hotspots || []) {
      byPath.set(hotspot.path, {
        ...hotspot,
        label: hotspot.label ? `${candidate.label} / ${hotspot.label}` : `${candidate.label} / 热点子目录`,
        reason: hotspot.reason || `${candidate.label} 下文档更集中的子目录`,
        sampleExtensions: Array.isArray(hotspot.sampleExtensions) ? hotspot.sampleExtensions : [],
        hotspots: [],
        alreadyAdded: byPath.has(hotspot.path),
        hotspot: true,
      });
    }
  }

  return Array.from(byPath.values()).sort((a, b) => {
    const addedDiff = Number(Boolean(b.alreadyAdded)) - Number(Boolean(a.alreadyAdded));
    if (addedDiff !== 0) return addedDiff;

    const hotspotDiff = Number(Boolean(a.hotspot)) - Number(Boolean(b.hotspot));
    if (hotspotDiff !== 0) return hotspotDiff;

    return (b.fileCount || 0) - (a.fileCount || 0) || (b.latestModifiedAt || 0) - (a.latestModifiedAt || 0);
  });
}

export function paginateItems(items, currentPage, pageSize) {
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
