import type {
  OpenClawMemoryDocumentCard,
  OpenClawMemoryLibrarySnapshot,
  OpenClawMemoryReportOutputSnapshot,
} from './openclaw-memory-catalog.js';
import { formatTimestamp, trimText } from './openclaw-memory-directory-support.js';

export function buildLibrarySection(input: {
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

export function buildDocumentSection(input: {
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

export function buildOutputSection(outputs: OpenClawMemoryReportOutputSnapshot[]) {
  if (!outputs.length) return '';
  const lines = ['Generated report summaries (long-term memory):'];
  for (const output of outputs) {
    lines.push(
      `- ${trimText(output.title, 72)} | libraries=${output.libraryLabels.join('、') || '-'} | template=${trimText(output.templateLabel, 48) || '-'} | updated=${formatTimestamp(output.updatedAt || output.createdAt)} | summary=${trimText(output.summary, 160) || '-'}`,
    );
  }
  return lines.join('\n');
}

export function buildDocumentDirectoryAnswerLines(input: {
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

export function buildOutputDirectoryAnswerLines(outputs: OpenClawMemoryReportOutputSnapshot[]) {
  return outputs.map((output, index) => (
    `${index + 1}. ${trimText(output.title, 72)}｜关联分组：${output.libraryLabels.join('、') || '-'}｜模板：${trimText(output.templateLabel, 40) || '-'}｜更新时间：${formatTimestamp(output.updatedAt || output.createdAt)}｜摘要：${trimText(output.summary, 120) || '暂无摘要'}`
  ));
}
