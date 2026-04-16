export function sumLibraryDocuments(libraries = []) {
  return (Array.isArray(libraries) ? libraries : []).reduce(
    (sum, item) => sum + Number(item?.documentCount || 0),
    0,
  );
}

export function buildMobileDatasetSummary({
  selectedLibraries = [],
  totalLibraries = 0,
  totalDocuments = 0,
}) {
  const libraries = Array.isArray(selectedLibraries) ? selectedLibraries : [];
  const effectiveDocumentTotal = libraries.length ? sumLibraryDocuments(libraries) : Number(totalDocuments || 0);
  const effectiveLibraryTotal = Math.max(0, Number(totalLibraries || 0));

  if (!libraries.length || (effectiveLibraryTotal > 0 && libraries.length >= effectiveLibraryTotal)) {
    return {
      title: '全部数据集',
      meta: `${effectiveLibraryTotal || libraries.length || 0} 个数据集 · ${effectiveDocumentTotal} 份文档`,
    };
  }

  if (libraries.length === 1) {
    const label = String(libraries[0]?.label || libraries[0]?.name || libraries[0]?.key || '当前数据集').trim();
    return {
      title: label || '当前数据集',
      meta: `${effectiveDocumentTotal} 份文档`,
    };
  }

  const joinedLabels = libraries
    .map((item) => String(item?.label || item?.name || item?.key || '').trim())
    .filter(Boolean)
    .join('、');

  if (joinedLabels && joinedLabels.length <= 18) {
    return {
      title: joinedLabels,
      meta: `${effectiveDocumentTotal} 份文档`,
    };
  }

  return {
    title: `${libraries.length} 个数据集`,
    meta: `${effectiveDocumentTotal} 份文档`,
  };
}
