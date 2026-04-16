import type {
  OpenClawMemoryCatalogSnapshot,
  OpenClawMemoryLibrarySnapshot,
} from './openclaw-memory-catalog.js';
import {
  buildLibraryMatchTerms,
  filterOpenClawMemoryCatalogSnapshot,
  normalizeMatchText,
  normalizeRequestText,
  type KnowledgeLibraryRef,
} from './openclaw-memory-directory-support.js';
import {
  buildOpenClawLongTermMemoryContextBlock,
  buildOpenClawLongTermMemoryDirectAnswer,
  summarizeOpenClawLongTermMemory,
} from './openclaw-memory-directory-builders.js';

const LONG_TERM_MEMORY_DIRECTORY_HINT_PATTERNS = [
  /平台.*(文档|文件|资料|摘要|报表)/,
  /(文档|文件|资料).*(数量|多少|几份|有哪些|列表|清单|目录|详情|摘要|简介)/,
  /(数量|多少|几份).*(文档|文件|资料|报表)/,
  /已出报表|报表摘要|报表列表|输出摘要|输出列表/,
  /long[- ]term memory|document (?:count|list|summary|details)|report summaries?/i,
];

const LONG_TERM_MEMORY_DETAIL_REQUEST_PATTERNS = [
  /全文|原文|正文|条款|依据|证据|哪一页|哪一段|字段|金额|日期/,
  /full text|original text|source text|field|date|amount|evidence/i,
];

export {
  buildOpenClawLongTermMemoryContextBlock,
  buildOpenClawLongTermMemoryDirectAnswer,
  summarizeOpenClawLongTermMemory,
} from './openclaw-memory-directory-builders.js';
export { filterOpenClawMemoryCatalogSnapshot } from './openclaw-memory-directory-support.js';

export function shouldAnswerFromOpenClawLongTermMemoryDirectory(requestText: string) {
  const source = normalizeRequestText(requestText);
  if (!source) return false;
  if (LONG_TERM_MEMORY_DETAIL_REQUEST_PATTERNS.some((pattern) => pattern.test(source))) return false;
  return LONG_TERM_MEMORY_DIRECTORY_HINT_PATTERNS.some((pattern) => pattern.test(source));
}

export function resolveOpenClawLongTermMemoryRequestedLibraries(input: {
  snapshot: OpenClawMemoryCatalogSnapshot | null;
  requestText: string;
  effectiveVisibleLibraryKeys?: string[];
}) {
  const requestText = normalizeMatchText(input.requestText);
  if (!requestText || !input.snapshot?.libraries?.length) return [] as KnowledgeLibraryRef[];

  const visibleLibrarySet = Array.isArray(input.effectiveVisibleLibraryKeys)
    ? new Set(input.effectiveVisibleLibraryKeys.map((item) => String(item || '').trim()).filter(Boolean))
    : null;
  const compactRequestText = requestText.replace(/\s+/g, '');

  return input.snapshot.libraries
    .filter((library) => !visibleLibrarySet || visibleLibrarySet.has(library.key))
    .filter((library) => buildLibraryMatchTerms(library).some((term) => (
      requestText.includes(term) || compactRequestText.includes(term)
    )))
    .map((library) => ({
      key: library.key,
      label: library.label,
    }));
}
