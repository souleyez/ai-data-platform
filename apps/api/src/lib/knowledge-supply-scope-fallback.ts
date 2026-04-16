import { loadParsedDocuments } from './document-store.js';
import { filterDocumentsByContentFocus, filterDocumentsByTimeRange } from './knowledge-evidence.js';

const IMAGE_DOCUMENT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const RECENT_UPLOAD_SCOPE_PATTERNS = /最近上传|刚上传|新上传|这批文档|这批材料|latest upload|recent upload/i;
const RECENT_ACTIVITY_SCOPE_PATTERNS = /最近解析|最新解析|刚解析|最近扫描|最新扫描|刚扫描|最近更新|最新更新|刚更新|recent parse|recently parsed|latest parsed|recent scan|latest scan|recent update|latest update/i;
const FAILED_PARSE_SCOPE_PATTERNS = /解析失败|扫描失败|OCR失败|ocr失败|重解析|重新解析|重试|failed parse|parse failed|scan failed|ocr failed|reparse|retry/i;
const IMAGE_DETAIL_SCOPE_PATTERNS = /图片|图像|照片|截图|image|photo|picture|screenshot|png|jpg|jpeg|webp|gif|bmp/i;

export type KnowledgeScopedDocumentItem = Awaited<ReturnType<typeof loadParsedDocuments>>['items'][number];

function extractDocumentTimestamp(item: KnowledgeScopedDocumentItem) {
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

export function prioritizeScopedItems(items: KnowledgeScopedDocumentItem[]) {
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

function isImageDocumentItem(item: KnowledgeScopedDocumentItem) {
  return IMAGE_DOCUMENT_EXTENSIONS.has(String(item.ext || '').toLowerCase());
}

export function buildFallbackScopedItems(input: {
  requestText: string;
  items: KnowledgeScopedDocumentItem[];
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
