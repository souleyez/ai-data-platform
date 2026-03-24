function extractTimestamp(text) {
  const match = String(text || '').match(/(\d{13})/);
  return match ? Number(match[1]) : 0;
}

export function extractDocumentTimestamp(item) {
  return extractTimestamp(`${item?.name || ''} ${item?.path || ''}`);
}

export function getDocumentLibraryKeys(item, libraries = []) {
  const explicitGroups = item?.confirmedGroups?.length ? item.confirmedGroups : (item?.groups || []);
  const keys = new Set(explicitGroups);
  const effectiveCategory = item?.confirmedBizCategory || item?.bizCategory;

  for (const library of libraries) {
    if (library?.isDefault && library?.sourceCategoryKey === effectiveCategory) {
      keys.add(library.key);
    }
  }

  return [...keys];
}

export function getLibraryDocumentCount(library, items = [], libraries = []) {
  return items.filter((item) => getDocumentLibraryKeys(item, libraries).includes(library.key)).length;
}

export function getLibraryLastUpdatedAt(library, items = [], libraries = []) {
  return items.reduce((latest, item) => {
    if (!getDocumentLibraryKeys(item, libraries).includes(library.key)) return latest;
    return Math.max(latest, extractDocumentTimestamp(item));
  }, 0);
}

export function sortLibrariesForDisplay(libraries = [], items = []) {
  return [...libraries].sort((a, b) => {
    const countDiff = getLibraryDocumentCount(b, items, libraries) - getLibraryDocumentCount(a, items, libraries);
    if (countDiff !== 0) return countDiff;

    const updatedDiff = getLibraryLastUpdatedAt(b, items, libraries) - getLibraryLastUpdatedAt(a, items, libraries);
    if (updatedDiff !== 0) return updatedDiff;

    if (Boolean(b?.isDefault) !== Boolean(a?.isDefault)) {
      return a?.isDefault ? 1 : -1;
    }

    return String(a?.label || '').localeCompare(String(b?.label || ''), 'zh-CN');
  });
}

export function resolveLibraryScenarioKey(library, items = [], libraries = []) {
  if (!library) return 'default';

  if (library.isDefault && library.sourceCategoryKey) {
    if (library.sourceCategoryKey === 'paper') return 'paper';
    return library.sourceCategoryKey;
  }

  const matchingItems = items.filter((item) => getDocumentLibraryKeys(item, libraries).includes(library.key));
  if (!matchingItems.length) return 'default';

  const counts = matchingItems.reduce((acc, item) => {
    const key = item?.confirmedBizCategory || item?.bizCategory || 'default';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'default';
  if (dominant === 'paper') return 'paper';
  return dominant;
}
