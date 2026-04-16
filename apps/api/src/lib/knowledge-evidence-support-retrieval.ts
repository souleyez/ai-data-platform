import type { ParsedDocument } from './document-parser.js';
import type { KnowledgeLibrary, KnowledgeScope } from './knowledge-evidence-types.js';
import { toText } from './knowledge-evidence-support-format.js';

export function buildKnowledgeRetrievalQuery(
  requestText: string,
  libraries: KnowledgeLibrary[],
  scope?: KnowledgeScope,
) {
  const cleaned = String(requestText || '')
    .replace(/based on|according to|around|focus on|please/gi, ' ')
    .replace(/\u8bf7\u6309|\u6309\u7167|\u57fa\u4e8e|\u6839\u636e|\u56f4\u7ed5|\u9488\u5bf9/g, ' ')
    .replace(/\u77e5\u8bc6\u5e93|\u8d44\u6599\u5e93|\u6587\u6863\u5e93|\u5e93\u5185\u5185\u5bb9/g, ' ')
    .replace(/\u8f93\u51fa|\u751f\u6210|\u505a\u4e00\u4efd|\u7ed9\u6211\u4e00\u4efd/g, ' ')
    .replace(/\u8868\u683c\u62a5\u8868|\u8868\u683c|\u62a5\u8868|\u9759\u6001\u9875|\u53ef\u89c6\u5316\u9875|\u5206\u6790\u9875|\u62a5\u544a|pdf|ppt/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const libraryHint = libraries.map((item) => item.label).join(' ');
  const scopeParts = [
    toText(scope?.contentFocus),
    toText(scope?.timeRange),
  ].filter(Boolean);

  return [cleaned, ...scopeParts, libraryHint].filter(Boolean).join(' ').trim();
}

export function buildLibraryFallbackRetrieval(scopedItems: ParsedDocument[]) {
  const documents = scopedItems.slice(0, 6).map((item) => ({
    ...item,
    title: item.title || item.name || 'Untitled document',
  }));

  const evidenceMatches = scopedItems
    .flatMap((item) =>
      (item.evidenceChunks || [])
        .slice(0, 2)
        .map((chunk) => ({
          item,
          chunkText: toText(typeof chunk === 'string' ? chunk : chunk?.text),
          score: 1,
        })),
    )
    .filter((entry) => entry.chunkText)
    .slice(0, 8);

  return { documents, evidenceMatches };
}
