import type {
  OpenClawMemoryCatalogSnapshot,
  OpenClawMemoryDocumentCard,
  OpenClawMemoryLibrarySnapshot,
  OpenClawMemoryReportOutputSnapshot,
} from './openclaw-memory-catalog.js';

export type KnowledgeLibraryRef = { key: string; label: string };

export function trimText(value: unknown, maxLength = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function formatTimestamp(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '-';
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return text;
  return new Date(parsed).toISOString();
}

export function normalizeRequestText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeMatchText(value: unknown) {
  return normalizeRequestText(value).toLowerCase();
}

export function buildLibraryMatchTerms(library: Pick<OpenClawMemoryLibrarySnapshot, 'key' | 'label'>) {
  const rawTerms = [
    String(library.label || '').trim(),
    String(library.key || '').trim(),
  ].filter(Boolean);
  const terms = new Set<string>();
  for (const rawTerm of rawTerms) {
    const normalized = normalizeMatchText(rawTerm);
    if (normalized) terms.add(normalized);
    const compact = normalized.replace(/\s+/g, '');
    if (compact) terms.add(compact);
  }
  return [...terms];
}

function sortDocumentsByLibraryAndTime(documents: OpenClawMemoryDocumentCard[]) {
  return [...documents].sort((left, right) => (
    left.libraryKeys.join(',').localeCompare(right.libraryKeys.join(','), 'zh-CN')
    || Date.parse(String(right.updatedAt || '')) - Date.parse(String(left.updatedAt || ''))
    || left.title.localeCompare(right.title, 'zh-CN')
  ));
}

function sortOutputsByTime(outputs: OpenClawMemoryReportOutputSnapshot[]) {
  return [...outputs].sort((left, right) => (
    Date.parse(String(right.updatedAt || right.createdAt || ''))
    - Date.parse(String(left.updatedAt || left.createdAt || ''))
    || left.title.localeCompare(right.title, 'zh-CN')
  ));
}

export function filterOpenClawMemoryCatalogSnapshot(input: {
  snapshot: OpenClawMemoryCatalogSnapshot | null;
  libraries?: KnowledgeLibraryRef[];
  effectiveVisibleLibraryKeys?: string[];
}) {
  const snapshot = input.snapshot;
  if (!snapshot) {
    return {
      libraries: [] as OpenClawMemoryLibrarySnapshot[],
      documents: [] as OpenClawMemoryDocumentCard[],
      outputs: [] as OpenClawMemoryReportOutputSnapshot[],
    };
  }

  const explicitKeys = new Set(
    (input.libraries || [])
      .map((item) => String(item.key || '').trim())
      .filter(Boolean),
  );
  const visibleKeys = Array.isArray(input.effectiveVisibleLibraryKeys)
    ? new Set(input.effectiveVisibleLibraryKeys.map((item) => String(item || '').trim()).filter(Boolean))
    : null;

  const scopedLibraries = snapshot.libraries.filter((library) => (
    (!visibleKeys || visibleKeys.has(library.key))
    && (!explicitKeys.size || explicitKeys.has(library.key))
  ));
  const libraryKeys = new Set(scopedLibraries.map((library) => library.key));
  const libraryLabels = new Set(scopedLibraries.map((library) => library.label));
  const hasScopedFilter = explicitKeys.size > 0 || Boolean(visibleKeys);

  const documents = sortDocumentsByLibraryAndTime(
    snapshot.documents.filter((document) => (
      !hasScopedFilter || document.libraryKeys.some((key) => libraryKeys.has(key))
    )),
  );
  const outputs = sortOutputsByTime(
    snapshot.outputs.filter((output) => {
      if (!hasScopedFilter) return true;
      return output.libraryKeys.some((key) => libraryKeys.has(key))
        || output.libraryLabels.some((label) => libraryLabels.has(label));
    }),
  );

  return {
    libraries: scopedLibraries,
    documents,
    outputs,
  };
}

export function shouldIncludeReportDirectorySection(requestText: string) {
  const source = normalizeRequestText(requestText).toLowerCase();
  if (!source) return true;
  return /(报表|输出|页面|静态页|report|page|output)/i.test(source);
}

export function shouldIncludeDocumentDirectorySection(requestText: string) {
  const source = normalizeRequestText(requestText).toLowerCase();
  if (!source) return true;
  if (shouldIncludeReportDirectorySection(source) && !/(文档|文件|资料|摘要|目录|document|file|summary)/i.test(source)) {
    return false;
  }
  return true;
}

export function shouldPreferLibraryDirectorySummary(requestText: string) {
  const source = normalizeRequestText(requestText).toLowerCase();
  if (!source) return false;

  const requestsLibraryGrouping = /(只按库|按库分组|按分组|分组下|各库|每个库|哪些集合|有哪些集合|集合和数量|库级|library group|group by library)/i.test(source);
  if (!requestsLibraryGrouping) return false;

  const requestsDetailLists = /(文档清单|文档列表|文件列表|资料列表|报表列表|文档摘要|文件摘要|报表摘要|详情|细节|具体文档|具体报表|document list|document summary|report summary|details?)/i.test(source);
  return !requestsDetailLists;
}
