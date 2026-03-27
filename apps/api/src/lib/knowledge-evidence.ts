import type { RetrievalResult } from './document-retrieval.js';

export function buildKnowledgeRetrievalQuery(requestText: string, libraries: Array<{ key: string; label: string }>) {
  const cleaned = String(requestText || '')
    .replace(/请按|按照|基于|根据|围绕|针对/g, ' ')
    .replace(/知识库|资料库|文档库|库内内容/g, ' ')
    .replace(/输出|生成|做一份|给我一份/g, ' ')
    .replace(/表格报表|表格|报表|静态页|可视化页|分析页|报告|pdf|ppt/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const libraryHint = libraries.map((item) => item.label).join(' ');
  return [cleaned, libraryHint].filter(Boolean).join(' ').trim();
}

export function buildKnowledgeContext(
  requestText: string,
  libraries: Array<{ key: string; label: string }>,
  retrieval: RetrievalResult | { documents: any[]; evidenceMatches: any[] },
) {
  const documents = retrieval.documents.slice(0, 6);
  const evidence = retrieval.evidenceMatches.slice(0, 8);

  return [
    `用户需求：${requestText}`,
    `优先知识库：${libraries.map((item) => item.label).join('、') || '未明确'}`,
    '',
    '文档摘要：',
    ...documents.map(
      (item: any, index: number) =>
        `${index + 1}. ${item.title || item.name}\n摘要：${item.summary || item.excerpt || '无摘要'}\n主题：${
          (item.topicTags || []).join('、') || '未识别'
        }`,
    ),
    '',
    '高相关证据：',
    ...evidence.map((item: any, index: number) => `${index + 1}. ${item.item.title || item.item.name}\n证据：${item.chunkText}`),
  ].join('\n\n');
}

export function buildLibraryFallbackRetrieval(scopedItems: any[]) {
  const documents = scopedItems.slice(0, 6).map((item) => ({
    ...item,
    title: item.title || item.name || '未命名文档',
  }));

  const evidenceMatches = scopedItems
    .flatMap((item) =>
      (item.evidenceChunks || [])
        .slice(0, 2)
        .map((chunk: string) => ({
          item,
          chunkText: String(chunk || '').trim(),
          score: 1,
        })),
    )
    .filter((entry) => entry.chunkText)
    .slice(0, 8);

  return { documents, evidenceMatches };
}
