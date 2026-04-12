import path from 'node:path';
import { loadDocumentCategoryConfig } from './document-config.js';
import {
  getParsedDocumentCanonicalParseStatus,
  getParsedDocumentCanonicalSource,
} from './document-canonical-text.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { loadIndexedDocumentById, loadIndexedDocumentMap } from './document-route-loaders.js';
import {
  DOCUMENT_AUDIO_EXTENSIONS,
  DOCUMENT_IMAGE_EXTENSIONS,
  DOCUMENT_PRESENTATION_EXTENSIONS,
} from './document-parser.js';
import { supportsMarkItDownExtension } from './document-markdown-provider.js';
import { DEFAULT_SCAN_DIR, loadParsedDocuments } from './document-store.js';
import { mergeParsedDocumentsForPaths } from './document-store.js';
import {
  enqueueDetailedParse,
  readDetailedParseQueueState,
  runDetailedParseBatch,
} from './document-deep-parse-queue.js';
import { rebuildDocumentVectorIndex } from './document-vector-index.js';
import {
  autoAssignSuggestedLibraries,
  reclusterUngroupedDocuments,
} from './document-route-services.js';

const CANONICAL_BACKFILL_IMAGE_EXTENSIONS = new Set<string>(DOCUMENT_IMAGE_EXTENSIONS);
const CANONICAL_BACKFILL_PRESENTATION_EXTENSIONS = new Set<string>(DOCUMENT_PRESENTATION_EXTENSIONS);
const CANONICAL_BACKFILL_AUDIO_EXTENSIONS = new Set<string>(DOCUMENT_AUDIO_EXTENSIONS);

function supportsCanonicalBackfillExtension(ext: string) {
  const normalized = String(ext || '').toLowerCase();
  return normalized === '.md'
    || supportsMarkItDownExtension(normalized)
    || CANONICAL_BACKFILL_IMAGE_EXTENSIONS.has(normalized)
    || CANONICAL_BACKFILL_PRESENTATION_EXTENSIONS.has(normalized)
    || CANONICAL_BACKFILL_AUDIO_EXTENSIONS.has(normalized);
}

function normalizeBackfillPath(filePath: string) {
  return path.resolve(String(filePath || ''));
}

function shouldBackfillCanonicalParse(
  item: Awaited<ReturnType<typeof loadParsedDocuments>>['items'][number],
  queueStatus?: string,
) {
  if (item.ignored) return false;
  if (!supportsCanonicalBackfillExtension(item.ext)) return false;

  const activeQueueStatus = String(queueStatus || '').trim();
  if (activeQueueStatus === 'queued' || activeQueueStatus === 'processing') return false;

  const detailStatus = String(item.detailParseStatus || '').trim();
  if (activeQueueStatus === 'failed' || detailStatus === 'failed') return true;
  if (item.parseStage !== 'detailed') return true;

  const canonicalParseStatus = getParsedDocumentCanonicalParseStatus(item);
  if (canonicalParseStatus === 'ready' || canonicalParseStatus === 'unsupported') return false;
  if (canonicalParseStatus === 'failed') return true;
  return true;
}

export async function runDocumentOrganizeAction() {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const { items } = await loadParsedDocuments(200, false, config.scanRoots);
  const libraries = await loadDocumentLibraries();
  const { updatedCount: organizedCount, ungroupedCount } = await autoAssignSuggestedLibraries(items, libraries);

  return {
    organizedCount,
    ungroupedCount,
    scanRoot: config.scanRoot,
    scanRoots: config.scanRoots,
  };
}

export async function runReclusterUngroupedAction() {
  return reclusterUngroupedDocuments();
}

export async function runDocumentDeepParseAction(limit: unknown) {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  return runDetailedParseBatch(Math.max(1, Math.min(24, Number(limit || 8))), config.scanRoots);
}

export async function runDocumentCanonicalBackfillAction(limit: unknown, runImmediately = false) {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const cappedLimit = Math.max(1, Math.min(500, Number(limit || 50)));
  const snapshot = await loadParsedDocuments(
    Math.max(cappedLimit * 10, 500),
    false,
    config.scanRoots,
    { skipBackgroundTasks: true },
  );
  const queueState = await readDetailedParseQueueState();
  const queueStatusByPath = new Map(
    queueState.items.map((item) => [normalizeBackfillPath(item.path), item.status]),
  );
  const candidates = snapshot.items
    .filter((item) => shouldBackfillCanonicalParse(item, queueStatusByPath.get(normalizeBackfillPath(item.path))))
    .slice(0, cappedLimit);

  const queuedPaths = candidates.map((item) => item.path);
  const enqueueResult = await enqueueDetailedParse(queuedPaths);
  const batchResult = runImmediately && queuedPaths.length
    ? await runDetailedParseBatch(Math.min(24, queuedPaths.length), config.scanRoots)
    : null;

  return {
    matchedCount: candidates.length,
    queuedCount: enqueueResult.queuedCount,
    runImmediately,
    candidates: candidates.map((item) => ({
      path: item.path,
      name: item.name,
      title: item.title,
      ext: item.ext,
      parseStage: item.parseStage,
      detailParseStatus: item.detailParseStatus,
      canonicalParseStatus: getParsedDocumentCanonicalParseStatus(item),
      canonicalSource: getParsedDocumentCanonicalSource(item),
      markdownMethod: item.markdownMethod,
      markdownError: item.markdownError,
    })),
    batchResult,
  };
}

export async function runDocumentCanonicalBackfillByIdAction(id: string, runImmediately = false) {
  const { documentConfig, found } = await loadIndexedDocumentById(id, { skipBackgroundTasks: true });
  if (!found) {
    throw new Error('document not found');
  }

  const queueState = await readDetailedParseQueueState();
  const queueStatus = queueState.items.find((item) => normalizeBackfillPath(item.path) === normalizeBackfillPath(found.path))?.status;
  const matched = shouldBackfillCanonicalParse(found, queueStatus);

  if (!matched) {
    return {
      matchedCount: 0,
      queuedCount: 0,
      runImmediately,
      candidate: {
        id,
        path: found.path,
        name: found.name,
        title: found.title,
        ext: found.ext,
        parseStage: found.parseStage,
        detailParseStatus: found.detailParseStatus,
        canonicalParseStatus: getParsedDocumentCanonicalParseStatus(found),
        canonicalSource: getParsedDocumentCanonicalSource(found),
        markdownMethod: found.markdownMethod,
        markdownError: found.markdownError,
      },
      batchResult: null,
    };
  }

  const enqueueResult = await enqueueDetailedParse([found.path]);
  const batchResult = runImmediately
    ? await runDetailedParseBatch(1, documentConfig.scanRoots)
    : null;

  return {
    matchedCount: 1,
    queuedCount: enqueueResult.queuedCount,
    runImmediately,
    candidate: {
      id,
      path: found.path,
      name: found.name,
      title: found.title,
      ext: found.ext,
      parseStage: found.parseStage,
      detailParseStatus: found.detailParseStatus,
      canonicalParseStatus: getParsedDocumentCanonicalParseStatus(found),
      canonicalSource: getParsedDocumentCanonicalSource(found),
      markdownMethod: found.markdownMethod,
      markdownError: found.markdownError,
    },
    batchResult,
  };
}

export async function runDocumentReparseAction(idsInput: unknown) {
  const ids = Array.isArray(idsInput)
    ? idsInput.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  if (!ids.length) {
    return {
      matchedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      missingIds: [] as string[],
    };
  }

  const { documentConfig, byId } = await loadIndexedDocumentMap();
  const matchedItems = ids
    .map((id) => byId.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const missingIds = ids.filter((id) => !byId.has(id));

  if (!matchedItems.length) {
    return {
      matchedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      missingIds,
    };
  }

  const parsed = await mergeParsedDocumentsForPaths(
    matchedItems.map((item) => item.path),
    200,
    documentConfig.scanRoots,
    { parseStage: 'detailed', cloudEnhancement: true, clearQueueEntries: true },
  );

  const reparsedByPath = new Map(parsed.items.map((item) => [item.path, item]));
  const succeededCount = matchedItems.filter((item) => reparsedByPath.get(item.path)?.parseStatus === 'parsed').length;
  const failedCount = matchedItems.length - succeededCount;

  return {
    matchedCount: matchedItems.length,
    succeededCount,
    failedCount,
    missingIds,
  };
}

export async function runDocumentVectorRebuildAction() {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const { items } = await loadParsedDocuments(200, false, config.scanRoots);
  return rebuildDocumentVectorIndex(items);
}
