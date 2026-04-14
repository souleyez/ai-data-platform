import { documentMatchesLibrary, loadDocumentLibraries, UNGROUPED_LIBRARY_KEY, UNGROUPED_LIBRARY_LABEL } from './document-libraries.js';
import { buildDocumentId, loadParsedDocuments } from './document-store.js';
import type { BotDefinition } from './bot-definitions.js';
import { filterDocumentsForBot, filterLibrariesForBot } from './bot-visibility.js';
import { filterDocumentsByContentFocus, filterDocumentsByTimeRange } from './knowledge-evidence.js';
import { buildPromptForScoring, collectLibraryMatches } from './knowledge-plan.js';
import type { ChatHistoryItem, KnowledgeLibraryRef, KnowledgeScopeState } from './knowledge-supply-types.js';

const IMAGE_DOCUMENT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const RECENT_UPLOAD_SCOPE_PATTERNS = /最近上传|刚上传|新上传|这批文档|这批材料|latest upload|recent upload/i;
const RECENT_ACTIVITY_SCOPE_PATTERNS = /最近解析|最新解析|刚解析|最近扫描|最新扫描|刚扫描|最近更新|最新更新|刚更新|recent parse|recently parsed|latest parsed|recent scan|latest scan|recent update|latest update/i;
const FAILED_PARSE_SCOPE_PATTERNS = /解析失败|扫描失败|OCR失败|ocr失败|重解析|重新解析|重试|failed parse|parse failed|scan failed|ocr failed|reparse|retry/i;
const IMAGE_DETAIL_SCOPE_PATTERNS = /图片|图像|照片|截图|image|photo|picture|screenshot|png|jpg|jpeg|webp|gif|bmp/i;

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

function isRecentUploadScopedQuery(text: string) {
  return RECENT_UPLOAD_SCOPE_PATTERNS.test(String(text || ''));
}

function isRecentActivityScopedQuery(text: string) {
  return RECENT_ACTIVITY_SCOPE_PATTERNS.test(String(text || ''));
}

function isFailedParseScopedQuery(text: string) {
  return FAILED_PARSE_SCOPE_PATTERNS.test(String(text || ''));
}

function isImageScopedQuery(text: string) {
  return IMAGE_DETAIL_SCOPE_PATTERNS.test(String(text || ''));
}

function isImageDocumentItem(item: Awaited<ReturnType<typeof loadParsedDocuments>>['items'][number]) {
  return IMAGE_DOCUMENT_EXTENSIONS.has(String(item.ext || '').toLowerCase());
}

function buildFallbackScopedItems(input: {
  requestText: string;
  items: Awaited<ReturnType<typeof loadParsedDocuments>>['items'];
  timeRange?: string;
  contentFocus?: string;
}) {
  const recentUploadQuery = isRecentUploadScopedQuery(input.requestText);
  const recentActivityQuery = isRecentActivityScopedQuery(input.requestText);
  const failedParseQuery = isFailedParseScopedQuery(input.requestText);
  const imageQuery = isImageScopedQuery(input.requestText);
  if (!recentUploadQuery && !recentActivityQuery && !failedParseQuery && !imageQuery) return [];

  let fallbackItems = input.items;

  if (failedParseQuery) {
    const failedItems = input.items.filter((item) => item.parseStatus === 'error' || item.detailParseStatus === 'failed');
    fallbackItems = failedItems.length ? failedItems : input.items;
  } else if (recentUploadQuery) {
    fallbackItems = filterDocumentsByTimeRange(input.items, input.timeRange || 'recent-upload');
  } else if (recentActivityQuery) {
    const recentlyDetailedItems = input.items.filter((item) => (
      item.parseStage === 'detailed'
      || item.detailParseStatus === 'succeeded'
      || Boolean(item.detailParsedAt)
    ));
    const recentlyParsedItems = recentlyDetailedItems.length
      ? recentlyDetailedItems
      : input.items.filter((item) => item.parseStatus === 'parsed');
    fallbackItems = filterDocumentsByTimeRange(recentlyParsedItems.length ? recentlyParsedItems : input.items, input.timeRange);
  } else {
    fallbackItems = filterDocumentsByTimeRange(input.items, input.timeRange);
  }

  if (imageQuery) {
    const imageItems = fallbackItems.filter(isImageDocumentItem);
    fallbackItems = imageItems.length ? imageItems : input.items.filter(isImageDocumentItem);
  }

  fallbackItems = filterDocumentsByContentFocus(fallbackItems, input.contentFocus);
  return prioritizeScopedItems(fallbackItems);
}

function looksLikeOperationalFeedback(text: string) {
  const source = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!source) return true;

  const noisyTokens = [
    '上传', '采集', '入库', '分组', '保存', '删除', '凭据', '数据源', '运行记录',
    '云端模型暂时不可用', '云端回复暂不可用', '知识库分组更新失败', '已确认分组', '已保存', '已删除', '已取消',
    'upload', 'uploaded successfully', 'ingest', 'saved', 'deleted', 'credential', 'datasource', 'run record',
    'cloud model unavailable', 'cloud reply unavailable', 'group update failed',
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

  if (!cleaned.length) return [];

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
  preferredDocumentIds?: string[],
  botDefinition?: BotDefinition | null,
  effectiveVisibleLibraryKeys?: string[],
) {
  const [documentLibraries, documentState] = await Promise.all([
    loadDocumentLibraries(),
    loadParsedDocuments(240, false),
  ]);
  const preferredDocumentSet = new Set(
    Array.isArray(preferredDocumentIds)
      ? preferredDocumentIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  );
  const baseVisibleLibraries = botDefinition
    ? filterLibrariesForBot(botDefinition, documentLibraries)
    : documentLibraries;
  const baseVisibleItems = botDefinition
    ? filterDocumentsForBot(botDefinition, documentState.items, documentLibraries)
    : documentState.items;
  const effectiveVisibleLibrarySet = Array.isArray(effectiveVisibleLibraryKeys)
    ? new Set(effectiveVisibleLibraryKeys.map((item) => String(item || '').trim()).filter(Boolean))
    : null;
  const visibleLibraries = effectiveVisibleLibrarySet
    ? baseVisibleLibraries.filter((library) => effectiveVisibleLibrarySet.has(library.key))
    : baseVisibleLibraries;
  const visibleItems = effectiveVisibleLibrarySet
    ? baseVisibleItems.filter((item) => visibleLibraries.some((library) => documentMatchesLibrary(item, library)))
    : baseVisibleItems;

  if (effectiveVisibleLibrarySet && !visibleLibraries.length) {
    return { libraries: [], scopedItems: [] };
  }

  const preferredKeys = new Set(preferredLibraries.map((item) => item.key));
  const preferredLabels = new Set(preferredLibraries.map((item) => item.label));
  const scoringPrompt = buildPromptForScoring(requestText, chatHistory);
  const preferredCandidates = preferredKeys.size || preferredLabels.size
    ? documentLibraries
        .filter((library) => preferredKeys.has(library.key) || preferredLabels.has(library.label))
        .map((library, index) => ({ library, score: 100 - index }))
    : [];
  const requestedCandidates = preferredCandidates.length
    ? preferredCandidates
    : collectLibraryMatches(scoringPrompt, documentLibraries);
  const visibleLibraryKeySet = new Set(visibleLibraries.map((library) => library.key));
  const visibleRequestedCandidates = requestedCandidates.filter((item) => visibleLibraryKeySet.has(item.library.key));
  const requestTargetsInvisibleLibraries = requestedCandidates.length > 0 && !visibleRequestedCandidates.length;

  if (requestTargetsInvisibleLibraries) {
    return { libraries: [], scopedItems: [] };
  }

  const scoredCandidates = preferredCandidates.length ? [] : collectLibraryMatches(scoringPrompt, visibleLibraries);
  const candidates = visibleRequestedCandidates.length ? visibleRequestedCandidates : scoredCandidates;
  let libraries = candidates.map((item) => ({ key: item.library.key, label: item.library.label }));
  const preferredScopedItems = preferredDocumentSet.size
    ? visibleItems.filter((item) => preferredDocumentSet.has(buildDocumentId(item.path)))
    : [];

  const libraryScopedItems = candidates.length
    ? visibleItems.filter((item) => candidates.some((candidate) => documentMatchesLibrary(item, candidate.library)))
    : [];
  const preferredItemsByFilters = preferredScopedItems.length
    ? prioritizeScopedItems(
        filterDocumentsByContentFocus(
          filterDocumentsByTimeRange(preferredScopedItems, timeRange),
          contentFocus,
        ),
      )
    : [];
  const baseScopedItems = preferredItemsByFilters.length
    ? preferredItemsByFilters
    : preferredScopedItems.length
      ? prioritizeScopedItems(preferredScopedItems)
      : candidates.length
        ? prioritizeScopedItems(
            filterDocumentsByContentFocus(
              filterDocumentsByTimeRange(libraryScopedItems, timeRange),
              contentFocus,
            ),
          )
        : buildFallbackScopedItems({
            requestText,
            items: visibleItems,
            timeRange,
            contentFocus,
          });

  const scopedItems = baseScopedItems;
  if (!libraries.length && scopedItems.length) {
    const derivedLibraries = documentLibraries
      .filter((library) => visibleLibraries.some((visible) => visible.key === library.key))
      .filter((library) => scopedItems.some((item) => documentMatchesLibrary(item, library)))
      .map((library) => ({ key: library.key, label: library.label }));
    if (derivedLibraries.length) {
      libraries = derivedLibraries;
    }
  }
  if (!libraries.length && scopedItems.length) {
    const ungroupedLibrary = visibleLibraries.find((item) => item.key === UNGROUPED_LIBRARY_KEY);
    if (ungroupedLibrary && scopedItems.some((item) => documentMatchesLibrary(item, ungroupedLibrary))) {
      libraries = [{ key: UNGROUPED_LIBRARY_KEY, label: ungroupedLibrary.label || UNGROUPED_LIBRARY_LABEL }];
    }
  }

  return { libraries, scopedItems };
}

export async function prepareKnowledgeScope(input: {
  requestText: string;
  chatHistory: ChatHistoryItem[];
  preferredLibraries?: KnowledgeLibraryRef[];
  timeRange?: string;
  contentFocus?: string;
  preferredDocumentIds?: string[];
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
}): Promise<KnowledgeScopeState> {
  const knowledgeChatHistory = buildKnowledgeChatHistory(input.chatHistory, input.requestText);
  const preferredLibraries = normalizePreferredLibraries(input.preferredLibraries);
  const { libraries, scopedItems } = await resolveKnowledgeScope(
    input.requestText,
    knowledgeChatHistory,
    preferredLibraries,
    input.timeRange,
    input.contentFocus,
    input.preferredDocumentIds,
    input.botDefinition,
    input.effectiveVisibleLibraryKeys,
  );

  return {
    knowledgeChatHistory,
    libraries,
    scopedItems,
  };
}
