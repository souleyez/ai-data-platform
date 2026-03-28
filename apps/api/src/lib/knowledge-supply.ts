import { retrieveKnowledgeMatches, type RetrievalResult } from './document-retrieval.js';
import { documentMatchesLibrary, loadDocumentLibraries } from './document-libraries.js';
import { loadParsedDocuments } from './document-store.js';
import {
  buildKnowledgeRetrievalQuery,
  buildLibraryFallbackRetrieval,
  filterDocumentsByContentFocus,
  filterDocumentsByTimeRange,
} from './knowledge-evidence.js';
import { buildPromptForScoring, collectLibraryMatches } from './knowledge-plan.js';
import type { KnowledgeTemplateTaskHint } from './knowledge-template.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type KnowledgeLibraryRef = { key: string; label: string };

export type KnowledgeScopeState = {
  knowledgeChatHistory: ChatHistoryItem[];
  libraries: KnowledgeLibraryRef[];
  scopedItems: Awaited<ReturnType<typeof loadParsedDocuments>>['items'];
};

export type KnowledgeSupply = {
  knowledgeChatHistory: ChatHistoryItem[];
  libraries: KnowledgeLibraryRef[];
  effectiveRetrieval: RetrievalResult;
};

function tokenizeKnowledgeText(text: string) {
  return String(text || '').toLowerCase().match(/[a-z0-9-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
}

function extractDocumentTimestamp(item: Awaited<ReturnType<typeof loadParsedDocuments>>['items'][number]) {
  const candidates = [
    Date.parse(String(item.detailParsedAt || '')),
    Date.parse(String(item.cloudStructuredAt || '')),
    Date.parse(String(item.retainedAt || '')),
  ].filter((value) => Number.isFinite(value) && value > 0);

  const match = String(item.path || '').match(/(?:^|[\\/])(\d{13})(?:[-_.]|$)/);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      candidates.push(value);
    }
  }

  return candidates.length ? Math.max(...candidates) : 0;
}

function prioritizeScopedItems(items: Awaited<ReturnType<typeof loadParsedDocuments>>['items']) {
  return [...items].sort((left, right) => {
    const leftDetailed = left.parseStage === 'detailed' || left.detailParseStatus === 'succeeded' ? 1 : 0;
    const rightDetailed = right.parseStage === 'detailed' || right.detailParseStatus === 'succeeded' ? 1 : 0;
    if (rightDetailed !== leftDetailed) return rightDetailed - leftDetailed;
    return extractDocumentTimestamp(right) - extractDocumentTimestamp(left);
  });
}

function looksLikeOperationalFeedback(text: string) {
  const source = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!source) return true;

  const noisyTokens = [
    '上传',
    '采集',
    '入库',
    '分组',
    '保存',
    '删除',
    '凭据',
    '数据源',
    '运行记录',
    '云端模型暂时不可用',
    '云端回复暂不可用',
    '知识库分组更新失败',
    '已确认分组',
    '已保存',
    '已删除',
    '已取消',
    'upload',
    'uploaded successfully',
    'ingest',
    'saved',
    'deleted',
    'credential',
    'datasource',
    'run record',
    'cloud model unavailable',
    'cloud reply unavailable',
    'group update failed',
  ];

  return noisyTokens.some((token) => source.includes(token)) && source.length <= 120;
}

export function buildKnowledgeChatHistory(chatHistory: ChatHistoryItem[], requestText: string) {
  const cleaned = chatHistory
    .map((item) => ({
      role: item.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(item.content || '').trim(),
    }))
    .filter((item) => item.content)
    .filter((item) => !looksLikeOperationalFeedback(item.content));

  if (!cleaned.length) {
    return [];
  }

  const requestTerms = new Set(tokenizeKnowledgeText(requestText));
  const selectedIndexes = new Set(cleaned.map((_, index) => index).slice(-4));
  const relevantIndexes = cleaned
    .map((item, index) => {
      const overlap = tokenizeKnowledgeText(item.content).filter((token) => requestTerms.has(token)).length;
      return { index, overlap, role: item.role };
    })
    .filter((item) => item.overlap > 0)
    .sort((left, right) => {
      if (right.overlap !== left.overlap) return right.overlap - left.overlap;
      if (left.role !== right.role) return left.role === 'user' ? -1 : 1;
      return right.index - left.index;
    })
    .slice(0, 3)
    .map((item) => item.index);

  for (const index of relevantIndexes) {
    selectedIndexes.add(index);
  }

  return Array.from(selectedIndexes)
    .sort((left, right) => left - right)
    .slice(-6)
    .map((index) => cleaned[index]);
}

export function normalizePreferredLibraries(preferredLibraries?: KnowledgeLibraryRef[]) {
  return Array.isArray(preferredLibraries)
    ? preferredLibraries
        .map((item) => ({ key: String(item?.key || '').trim(), label: String(item?.label || '').trim() }))
        .filter((item) => item.key || item.label)
    : [];
}

async function resolveKnowledgeScope(
  requestText: string,
  chatHistory: ChatHistoryItem[],
  preferredLibraries: KnowledgeLibraryRef[],
  timeRange?: string,
  contentFocus?: string,
) {
  const [documentLibraries, documentState] = await Promise.all([
    loadDocumentLibraries(),
    loadParsedDocuments(240, false),
  ]);

  const preferredKeys = new Set(preferredLibraries.map((item) => item.key));
  const preferredLabels = new Set(preferredLibraries.map((item) => item.label));
  const explicitCandidates = preferredKeys.size || preferredLabels.size
    ? documentLibraries
        .filter((library) => preferredKeys.has(library.key) || preferredLabels.has(library.label))
        .map((library, index) => ({ library, score: 100 - index }))
    : [];
  const scoredCandidates = collectLibraryMatches(buildPromptForScoring(requestText, chatHistory), documentLibraries);
  const candidates = explicitCandidates.length ? explicitCandidates : scoredCandidates;
  const libraries = candidates.map((item) => ({ key: item.library.key, label: item.library.label }));

  const libraryScopedItems = candidates.length
    ? documentState.items.filter((item) => candidates.some((candidate) => documentMatchesLibrary(item, candidate.library)))
    : [];
  const timeScopedItems = filterDocumentsByTimeRange(libraryScopedItems, timeRange);
  const scopedItems = prioritizeScopedItems(filterDocumentsByContentFocus(timeScopedItems, contentFocus));

  return { libraries, scopedItems };
}

export async function prepareKnowledgeScope(input: {
  requestText: string;
  chatHistory: ChatHistoryItem[];
  preferredLibraries?: KnowledgeLibraryRef[];
  timeRange?: string;
  contentFocus?: string;
}): Promise<KnowledgeScopeState> {
  const knowledgeChatHistory = buildKnowledgeChatHistory(input.chatHistory, input.requestText);
  const preferredLibraries = normalizePreferredLibraries(input.preferredLibraries);
  const { libraries, scopedItems } = await resolveKnowledgeScope(
    input.requestText,
    knowledgeChatHistory,
    preferredLibraries,
    input.timeRange,
    input.contentFocus,
  );

  return {
    knowledgeChatHistory,
    libraries,
    scopedItems,
  };
}

export async function prepareKnowledgeRetrieval(input: KnowledgeScopeState & {
  requestText: string;
  timeRange?: string;
  contentFocus?: string;
  docLimit: number;
  evidenceLimit: number;
  templateTaskHint?: KnowledgeTemplateTaskHint | null;
  templateSearchHints?: string[];
}): Promise<KnowledgeSupply> {
  const retrieval = await retrieveKnowledgeMatches(
    input.scopedItems,
    buildKnowledgeRetrievalQuery(input.requestText, input.libraries, {
      timeRange: input.timeRange,
      contentFocus: input.contentFocus,
    }),
    {
      docLimit: input.docLimit,
      evidenceLimit: input.evidenceLimit,
      templateTaskHint: input.templateTaskHint || undefined,
      templateSearchHints: input.templateSearchHints,
    },
  );

  const effectiveRetrieval =
    retrieval.documents.length || retrieval.evidenceMatches.length
      ? retrieval
      : {
          ...(() => {
            const fallback = buildLibraryFallbackRetrieval(input.scopedItems);
            return {
              ...fallback,
              evidenceMatches: fallback.evidenceMatches.map((entry, index) => ({
                ...entry,
                chunkId: `fallback-${index + 1}`,
              })),
            };
          })(),
          meta: {
            ...retrieval.meta,
            candidateCount: input.scopedItems.length,
            rerankedCount: Math.min(input.scopedItems.length, 6),
          },
        };

  return {
    knowledgeChatHistory: input.knowledgeChatHistory,
    libraries: input.libraries,
    effectiveRetrieval,
  };
}

export async function prepareKnowledgeSupply(input: {
  requestText: string;
  chatHistory: ChatHistoryItem[];
  preferredLibraries?: KnowledgeLibraryRef[];
  timeRange?: string;
  contentFocus?: string;
  docLimit: number;
  evidenceLimit: number;
  templateTaskHint?: KnowledgeTemplateTaskHint | null;
  templateSearchHints?: string[];
}): Promise<KnowledgeSupply> {
  const scopeState = await prepareKnowledgeScope(input);
  return prepareKnowledgeRetrieval({
    requestText: input.requestText,
    timeRange: input.timeRange,
    contentFocus: input.contentFocus,
    docLimit: input.docLimit,
    evidenceLimit: input.evidenceLimit,
    templateTaskHint: input.templateTaskHint,
    templateSearchHints: input.templateSearchHints,
    ...scopeState,
  });
}
