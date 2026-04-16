import type { OpenClawMemoryCatalogSnapshot } from './openclaw-memory-catalog.js';
import {
  filterOpenClawMemoryCatalogSnapshot,
  formatTimestamp,
  shouldIncludeDocumentDirectorySection,
  shouldIncludeReportDirectorySection,
  trimText,
  type KnowledgeLibraryRef,
} from './openclaw-memory-directory-support.js';
import {
  buildDocumentDirectoryAnswerLines,
  buildDocumentSection,
  buildLibrarySection,
  buildOutputDirectoryAnswerLines,
  buildOutputSection,
} from './openclaw-memory-directory-sections.js';

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
