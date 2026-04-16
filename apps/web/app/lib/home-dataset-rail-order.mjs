export function orderLibrariesWithSelectedFirst(libraries = [], selectedKeys = []) {
  if (!Array.isArray(libraries) || libraries.length <= 1) {
    return Array.isArray(libraries) ? [...libraries] : [];
  }

  const selectedSet = new Set(
    Array.isArray(selectedKeys)
      ? selectedKeys.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  );

  if (!selectedSet.size) return [...libraries];

  const selected = [];
  const unselected = [];

  for (const library of libraries) {
    if (selectedSet.has(String(library?.key || '').trim())) {
      selected.push(library);
    } else {
      unselected.push(library);
    }
  }

  return [...selected, ...unselected];
}
