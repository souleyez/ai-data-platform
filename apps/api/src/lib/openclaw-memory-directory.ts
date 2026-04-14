import type {
  OpenClawMemoryCatalogSnapshot,
  OpenClawMemoryDocumentCard,
  OpenClawMemoryLibrarySnapshot,
  OpenClawMemoryReportOutputSnapshot,
} from './openclaw-memory-catalog.js';

type KnowledgeLibraryRef = { key: string; label: string };

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

function trimText(value: unknown, maxLength = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatTimestamp(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '-';
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return text;
  return new Date(parsed).toISOString();
}

function normalizeRequestText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function buildLibrarySection(input: {
  libraries: OpenClawMemoryLibrarySnapshot[];
  outputs: OpenClawMemoryReportOutputSnapshot[];
}) {
  if (!input.libraries.length) return '';
  const lines = ['Libraries in long-term memory:'];
  for (const library of input.libraries) {
    const relatedOutputCount = input.outputs.filter((output) => (
      output.libraryKeys.includes(library.key) || output.libraryLabels.includes(library.label)
    )).length;
    lines.push(
      `- ${library.label} | key=${library.key} | documents=${library.documentCount} | usable=${library.availableCount} | outputs=${relatedOutputCount}`,
    );
  }
  return lines.join('\n');
}

function buildDocumentSection(input: {
  documents: OpenClawMemoryDocumentCard[];
  libraries: OpenClawMemoryLibrarySnapshot[];
}) {
  if (!input.documents.length) return '';
  const labelMap = new Map(input.libraries.map((library) => [library.key, library.label]));
  const lines = ['Document directory summaries (long-term memory):'];
  for (const document of input.documents) {
    const libraries = document.libraryKeys
      .map((key) => labelMap.get(key) || key)
      .filter(Boolean)
      .join('、');
    lines.push(
      `- ${trimText(document.title, 72)} | libraries=${libraries || '-'} | status=${document.availability} | updated=${formatTimestamp(document.updatedAt)} | summary=${trimText(document.summary, 160) || '-'}`,
    );
  }
  return lines.join('\n');
}

function buildOutputSection(outputs: OpenClawMemoryReportOutputSnapshot[]) {
  if (!outputs.length) return '';
  const lines = ['Generated report summaries (long-term memory):'];
  for (const output of outputs) {
    lines.push(
      `- ${trimText(output.title, 72)} | libraries=${output.libraryLabels.join('、') || '-'} | template=${trimText(output.templateLabel, 48) || '-'} | updated=${formatTimestamp(output.updatedAt || output.createdAt)} | summary=${trimText(output.summary, 160) || '-'}`,
    );
  }
  return lines.join('\n');
}

export function buildOpenClawLongTermMemoryContextBlock(input: {
  snapshot: OpenClawMemoryCatalogSnapshot | null;
  libraries?: KnowledgeLibraryRef[];
  effectiveVisibleLibraryKeys?: string[];
}) {
  const scoped = filterOpenClawMemoryCatalogSnapshot(input);
  if (!scoped.libraries.length && !scoped.documents.length && !scoped.outputs.length) return '';

  return [
    'Platform long-term memory directory:',
    `Generated at: ${formatTimestamp(input.snapshot?.generatedAt || '')}`,
    buildLibrarySection(scoped),
    buildDocumentSection(scoped),
    buildOutputSection(scoped.outputs),
  ].filter(Boolean).join('\n\n');
}

export function summarizeOpenClawLongTermMemory(input: {
  snapshot: OpenClawMemoryCatalogSnapshot | null;
  libraries?: KnowledgeLibraryRef[];
  effectiveVisibleLibraryKeys?: string[];
}) {
  const scoped = filterOpenClawMemoryCatalogSnapshot(input);
  if (!scoped.libraries.length && !scoped.documents.length && !scoped.outputs.length) {
    return '当前长期记忆目录中没有可用的文档或报表摘要。';
  }

  const librarySummary = scoped.libraries.length
    ? scoped.libraries
        .map((library) => `${library.label} ${library.documentCount} 份文档`)
        .join('；')
    : '';
  const reportSummary = scoped.outputs.length
    ? `已出报表 ${scoped.outputs.length} 份`
    : '当前没有已出报表摘要';
  const documentTitles = scoped.documents
    .slice(0, 5)
    .map((document) => trimText(document.title, 32))
    .filter(Boolean)
    .join('、');

  return [
    librarySummary ? `当前长期记忆覆盖：${librarySummary}。` : '',
    `${reportSummary}。`,
    documentTitles ? `优先可查看的文档包括：${documentTitles}。` : '',
  ].filter(Boolean).join('');
}

export function shouldAnswerFromOpenClawLongTermMemoryDirectory(requestText: string) {
  const source = normalizeRequestText(requestText);
  if (!source) return false;
  if (LONG_TERM_MEMORY_DETAIL_REQUEST_PATTERNS.some((pattern) => pattern.test(source))) return false;
  return LONG_TERM_MEMORY_DIRECTORY_HINT_PATTERNS.some((pattern) => pattern.test(source));
}

function shouldIncludeReportDirectorySection(requestText: string) {
  const source = normalizeRequestText(requestText).toLowerCase();
  if (!source) return true;
  return /(报表|输出|页面|静态页|report|page|output)/i.test(source);
}

function shouldIncludeDocumentDirectorySection(requestText: string) {
  const source = normalizeRequestText(requestText).toLowerCase();
  if (!source) return true;
  if (shouldIncludeReportDirectorySection(source) && !/(文档|文件|资料|摘要|目录|document|file|summary)/i.test(source)) {
    return false;
  }
  return true;
}

function buildDocumentDirectoryAnswerLines(input: {
  documents: OpenClawMemoryDocumentCard[];
  libraries: OpenClawMemoryLibrarySnapshot[];
}) {
  const labelMap = new Map(input.libraries.map((library) => [library.key, library.label]));
  return input.documents.map((document, index) => {
    const libraries = document.libraryKeys
      .map((key) => labelMap.get(key) || key)
      .filter(Boolean)
      .join('、');
    return `${index + 1}. ${trimText(document.title, 72)}｜分组：${libraries || '-'}｜更新时间：${formatTimestamp(document.updatedAt)}｜摘要：${trimText(document.summary, 120) || '暂无摘要'}`;
  });
}

function buildOutputDirectoryAnswerLines(outputs: OpenClawMemoryReportOutputSnapshot[]) {
  return outputs.map((output, index) => (
    `${index + 1}. ${trimText(output.title, 72)}｜关联分组：${output.libraryLabels.join('、') || '-'}｜模板：${trimText(output.templateLabel, 40) || '-'}｜更新时间：${formatTimestamp(output.updatedAt || output.createdAt)}｜摘要：${trimText(output.summary, 120) || '暂无摘要'}`
  ));
}

export function buildOpenClawLongTermMemoryDirectAnswer(input: {
  snapshot: OpenClawMemoryCatalogSnapshot | null;
  requestText: string;
  libraries?: KnowledgeLibraryRef[];
  effectiveVisibleLibraryKeys?: string[];
}) {
  const scoped = filterOpenClawMemoryCatalogSnapshot(input);
  if (!scoped.libraries.length && !scoped.documents.length && !scoped.outputs.length) {
    return '当前长期记忆目录里没有可用的文档或已出报表。';
  }

  const lines = [
    `当前长期记忆目录覆盖 ${scoped.libraries.length} 个分组、${scoped.documents.length} 份文档、${scoped.outputs.length} 份已出报表。`,
  ];

  if (shouldIncludeDocumentDirectorySection(input.requestText)) {
    if (scoped.documents.length) {
      lines.push('', '文档清单：', ...buildDocumentDirectoryAnswerLines(scoped));
    } else {
      lines.push('', '文档清单：当前范围内没有文档。');
    }
  }

  if (shouldIncludeReportDirectorySection(input.requestText)) {
    if (scoped.outputs.length) {
      lines.push('', '已出报表：', ...buildOutputDirectoryAnswerLines(scoped.outputs));
    } else {
      lines.push('', '已出报表：当前范围内没有报表摘要。');
    }
  }

  return lines.join('\n');
}
