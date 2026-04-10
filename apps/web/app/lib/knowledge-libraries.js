function extractTimestamp(text) {
  const valueText = String(text || '').split(/[\\/]/).pop() || '';
  const match = valueText.match(/^(\d{13})(?:[-_.]|$)/);
  if (!match) return 0;
  const value = Number(match[1]);
  return value >= 1500000000000 && value <= 4102444800000 ? value : 0;
}

export function extractDocumentTimestamp(item) {
  return extractTimestamp(`${item?.name || ''} ${item?.path || ''}`);
}

export function getDocumentLibraryKeys(item, libraries = []) {
  const explicitGroups = item?.confirmedGroups?.length ? item.confirmedGroups : (item?.groups || []);
  return [...new Set(explicitGroups)];
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

    if (String(a?.key || '') === 'ungrouped' || String(b?.key || '') === 'ungrouped') {
      return String(a?.key || '') === 'ungrouped' ? 1 : -1;
    }

    return String(a?.label || '').localeCompare(String(b?.label || ''), 'zh-CN');
  });
}

export function resolveLibraryScenarioKey(library, items = [], libraries = []) {
  if (!library) return 'default';

  if (['paper', 'contract', 'daily', 'invoice', 'order', 'service', 'inventory'].includes(String(library.key || ''))) {
    return library.key === 'paper' ? 'paper' : library.key;
  }
  return 'default';
}
