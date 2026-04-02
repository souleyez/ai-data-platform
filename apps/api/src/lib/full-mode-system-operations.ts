import path from 'node:path';
import { loadDocumentCategoryConfig } from './document-config.js';
import { buildDocumentId, DEFAULT_SCAN_DIR, loadParsedDocuments, mergeParsedDocumentsForPaths } from './document-store.js';
import type { ParsedDocument } from './document-parser.js';
import type { FullModeSystemOperationSummary } from './full-mode-system-context.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

export type FullModeSystemOperationIntent =
  | {
      kind: 'documents_reparse_images';
      requestedScope: string;
      targetExtensions: string[];
      limit: number | null;
      failedOnly: boolean;
    }
  | null;

function normalizeText(value: string) {
  return String(value || '').trim().toLowerCase();
}

function resolveRequestedLimit(prompt: string) {
  const text = String(prompt || '');
  if (/(?:所有|全部|全都|全部的|所有的)/.test(text)) return null;
  const explicit = text.match(/(\d+)\s*(?:个|份|张|篇|条)/);
  if (explicit) {
    const parsed = Number(explicit[1]);
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 24);
  }
  if (/(?:几个|几张|几份|一些|这批)/.test(text)) return 6;
  return 6;
}

function resolveTargetExtensions(prompt: string) {
  const text = normalizeText(prompt);
  const targets: string[] = [];

  for (const ext of IMAGE_EXTENSIONS) {
    const bare = ext.slice(1);
    if (text.includes(bare)) targets.push(ext);
  }

  if (targets.length) return [...new Set(targets)];
  if (/(?:图片|图像|截图|扫描件|ocr)/.test(prompt)) return [...IMAGE_EXTENSIONS];
  return [];
}

export function detectFullModeSystemOperation(prompt: string): FullModeSystemOperationIntent {
  const text = String(prompt || '').trim();
  if (!text) return null;

  const wantsReparse = /(?:重新扫描|重扫|重新解析|重解析|再扫描一遍|再解析一遍|重做ocr|重新ocr|再跑ocr)/i.test(text);
  const imageExtensions = resolveTargetExtensions(text);
  const mentionsImage = imageExtensions.length > 0;
  const mentionsDocumentScope = /(?:文档库|文档中心|知识库|合同|图片|图像|ocr|扫描件)/i.test(text);

  if (wantsReparse && mentionsImage && mentionsDocumentScope) {
    return {
      kind: 'documents_reparse_images',
      requestedScope: /(合同|合同协议)/.test(text) ? 'contract_images' : 'recent_image_documents',
      targetExtensions: imageExtensions,
      limit: resolveRequestedLimit(text),
      failedOnly: /(?:失败|未提取到文本|ocr失败|解析失败)/i.test(text),
    };
  }

  return null;
}

function matchesRequestedScope(item: ParsedDocument, requestedScope: string) {
  if (requestedScope === 'contract_images') {
    const groups = item.confirmedGroups?.length ? item.confirmedGroups : item.groups || [];
    return (
      groups.includes('contract')
      || groups.includes('合同协议')
      || (item.confirmedBizCategory || item.bizCategory) === 'contract'
    );
  }
  return true;
}

function isCandidateImageDocument(item: ParsedDocument, intent: NonNullable<FullModeSystemOperationIntent>) {
  const ext = String(item.ext || '').toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return false;
  if (intent.targetExtensions.length && !intent.targetExtensions.includes(ext)) return false;
  if (intent.failedOnly) {
    const failed = item.parseStatus === 'error' || item.detailParseStatus === 'failed';
    if (!failed) return false;
  }
  return matchesRequestedScope(item, intent.requestedScope);
}

export async function runFullModeSystemOperationIfNeeded(prompt: string): Promise<FullModeSystemOperationSummary | null> {
  const intent = detectFullModeSystemOperation(prompt);
  if (!intent) return null;

  if (intent.kind === 'documents_reparse_images') {
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, config.scanRoots, { skipBackgroundTasks: true });
    const matchedItems = items
      .filter((item) => isCandidateImageDocument(item, intent))
      .slice(0, intent.limit ?? Number.MAX_SAFE_INTEGER);

    if (!matchedItems.length) {
      return {
        kind: intent.kind,
        matchedCount: 0,
        succeededCount: 0,
        failedCount: 0,
        requestedScope: intent.requestedScope,
        targetExtensions: intent.targetExtensions,
        targetNames: [],
      };
    }

    const reparsed = await mergeParsedDocumentsForPaths(
      matchedItems.map((item) => item.path),
      200,
      config.scanRoots,
      { parseStage: 'detailed', cloudEnhancement: true },
    );
    const reparsedById = new Map(reparsed.items.map((item) => [buildDocumentId(item.path), item]));
    const succeededCount = matchedItems.filter((item) => reparsedById.get(buildDocumentId(item.path))?.parseStatus === 'parsed').length;

    return {
      kind: intent.kind,
      matchedCount: matchedItems.length,
      succeededCount,
      failedCount: matchedItems.length - succeededCount,
      requestedScope: intent.requestedScope,
      targetExtensions: intent.targetExtensions,
      targetNames: matchedItems.map((item) => path.basename(item.name || item.path)).slice(0, 8),
    };
  }

  return null;
}
