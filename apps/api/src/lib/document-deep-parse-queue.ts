import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { mergeParsedDocumentsForPaths } from './document-store.js';
import { refreshOpenClawMemoryCatalogNow } from './openclaw-memory-sync.js';
import { STORAGE_CACHE_DIR } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';
import { upsertDocumentVectorIndex } from './document-vector-index.js';
import {
  markTaskFailed,
  markTaskSkipped,
  markTaskStarted,
  markTaskSucceeded,
} from './task-runtime-metrics.js';

type QueueStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

type DeepParseQueueItem = {
  path: string;
  status: QueueStatus;
  queuedAt: string;
  lastAttemptAt?: string;
  completedAt?: string;
  attempts: number;
  error?: string;
};

type DeepParseQueuePayload = {
  updatedAt: string;
  items: DeepParseQueueItem[];
};

const QUEUE_FILE = path.join(STORAGE_CACHE_DIR, 'document-deep-parse-queue.json');
const LOCK_TTL_MS = 5 * 60 * 1000;

let activeLock: { owner: string; acquiredAt: number } | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeQueueStatus(value: unknown): QueueStatus {
  return value === 'processing' || value === 'succeeded' || value === 'failed'
    ? value
    : 'queued';
}

function normalizeQueueItem(value: unknown): DeepParseQueueItem | null {
  if (!isRecord(value)) return null;
  const pathValue = String(value.path || '').trim();
  if (!pathValue) return null;
  return {
    path: pathValue,
    status: normalizeQueueStatus(value.status),
    queuedAt: String(value.queuedAt || '').trim() || new Date().toISOString(),
    lastAttemptAt: String(value.lastAttemptAt || '').trim() || undefined,
    completedAt: String(value.completedAt || '').trim() || undefined,
    attempts: Math.max(0, Number(value.attempts || 0)),
    error: String(value.error || '').trim() || undefined,
  };
}

async function readQueue(): Promise<DeepParseQueuePayload> {
  const { data } = await readRuntimeStateJson<DeepParseQueuePayload>({
    filePath: QUEUE_FILE,
    fallback: () => ({
      updatedAt: new Date().toISOString(),
      items: [],
    }),
    normalize: (parsed) => {
      if (!isRecord(parsed)) {
        return {
          updatedAt: new Date().toISOString(),
          items: [],
        };
      }
      return {
        updatedAt: String(parsed.updatedAt || '').trim() || new Date().toISOString(),
        items: Array.isArray(parsed.items)
          ? parsed.items.map((item) => normalizeQueueItem(item)).filter((item): item is DeepParseQueueItem => Boolean(item))
          : [],
      };
    },
  });
  const now = Date.now();
  const hasFreshLock = Boolean(activeLock && now - activeLock.acquiredAt < LOCK_TTL_MS);

  const items = data.items.map((item) => {
    if (item.status !== 'processing') return item;
    if (!hasFreshLock) {
      return {
        ...item,
        status: 'queued' as const,
        error: undefined,
      };
    }
    const lastAttemptAt = item.lastAttemptAt ? Date.parse(item.lastAttemptAt) : 0;
    if (lastAttemptAt && Number.isFinite(lastAttemptAt) && now - lastAttemptAt < LOCK_TTL_MS) {
      return item;
    }
    return {
      ...item,
      status: 'queued' as const,
      error: undefined,
    };
  });
  return {
    updatedAt: data.updatedAt,
    items,
  };
}

async function writeQueue(payload: DeepParseQueuePayload) {
  await writeRuntimeStateJson({
    filePath: QUEUE_FILE,
    payload,
  });
}

async function acquireLock() {
  const now = Date.now();
  const owner = `${process.pid}-${now}`;
  if (activeLock && now - activeLock.acquiredAt < LOCK_TTL_MS) {
    return null;
  }
  activeLock = { owner, acquiredAt: now };
  return owner;
}

async function releaseLock(owner: string | null) {
  if (!owner) return;
  if (activeLock?.owner === owner) activeLock = null;
}

function normalizeQueuePath(filePath: string) {
  return path.resolve(String(filePath || ''));
}

function extractQueuePriority(item: DeepParseQueueItem) {
  const normalizedPath = normalizeQueuePath(item.path).toLowerCase();
  const uploadBoost = normalizedPath.includes(`${path.sep}storage${path.sep}files${path.sep}uploads${path.sep}`.toLowerCase())
    ? 10_000_000_000_000
    : 0;
  const baseName = path.basename(String(item.path || ''));
  const timestampMatch = baseName.match(/^(\d{13})(?:[-_.]|$)/);
  const pathTimestamp = timestampMatch ? Number(timestampMatch[1]) : 0;
  if (pathTimestamp > 0) return uploadBoost + pathTimestamp;
  const queuedAt = item.queuedAt ? Date.parse(item.queuedAt) : 0;
  return uploadBoost + (Number.isFinite(queuedAt) ? queuedAt : 0);
}

export async function enqueueDetailedParse(filePaths: string[]) {
  const normalized = [...new Set((filePaths || []).map(normalizeQueuePath).filter(Boolean))];
  if (!normalized.length) return { queuedCount: 0 };

  const queue = await readQueue();
  const byPath = new Map(queue.items.map((item) => [normalizeQueuePath(item.path), item]));
  let queuedCount = 0;

  for (const filePath of normalized) {
    const existing = byPath.get(filePath);
    if (existing && (existing.status === 'queued' || existing.status === 'processing')) {
      continue;
    }

    byPath.set(filePath, {
      path: filePath,
      status: 'queued',
      queuedAt: new Date().toISOString(),
      lastAttemptAt: existing?.lastAttemptAt,
      completedAt: undefined,
      attempts: existing?.attempts || 0,
      error: undefined,
    });
    queuedCount += 1;
  }

  await writeQueue({
    updatedAt: new Date().toISOString(),
    items: [...byPath.values()],
  });

  return { queuedCount };
}

export async function applyDetailedParseQueueMetadata(items: ParsedDocument[]) {
  const queue = await readQueue();
  const byPath = new Map(queue.items.map((item) => [normalizeQueuePath(item.path), item]));

  return items.map((item) => {
    const queueItem = byPath.get(normalizeQueuePath(item.path));
    if (!queueItem) return item;
    const effectiveDetailStatus =
      queueItem.status === 'succeeded'
        ? (item.detailParseStatus || (item.parseStage === 'detailed' ? 'succeeded' : 'queued'))
        : queueItem.status;

    return {
      ...item,
      detailParseStatus: effectiveDetailStatus,
      detailParseQueuedAt: queueItem.queuedAt,
      detailParsedAt: item.detailParsedAt || queueItem.completedAt,
      detailParseAttempts: Math.max(Number(item.detailParseAttempts || 0), Number(queueItem.attempts || 0)),
      detailParseError: queueItem.status === 'failed' ? queueItem.error || item.detailParseError : item.detailParseError,
    };
  });
}

export async function readDetailedParseQueueState() {
  return readQueue();
}

export async function runDetailedParseBatch(limit = 12, scanRoots?: string[]) {
  const lockOwner = await acquireLock();
  if (!lockOwner) {
    await markTaskSkipped('deep-parse', 'deep-parse-already-running', {
      processingCount: 0,
    }).catch(() => undefined);
    return {
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      message: 'deep-parse-already-running',
    };
  }

  try {
    const queue = await readQueue();
    const queuedCount = queue.items.filter((item) => item.status === 'queued').length;
    const queued = queue.items
      .filter((item) => item.status === 'queued')
      .sort((left, right) => extractQueuePriority(right) - extractQueuePriority(left))
      .slice(0, Math.max(1, limit));
    if (!queued.length) {
      await markTaskSkipped('deep-parse', 'no-queued-items', {
        queuedCount: 0,
        processingCount: 0,
      }).catch(() => undefined);
      return { processedCount: 0, succeededCount: 0, failedCount: 0 };
    }

    const startedAtMs = Date.now();
    const now = new Date().toISOString();
    const processingPaths = new Set(queued.map((item) => normalizeQueuePath(item.path)));
    await markTaskStarted('deep-parse', {
      queuedCount,
      processingCount: processingPaths.size,
      lastMessage: `processing ${processingPaths.size} queued documents`,
    }).catch(() => undefined);
    const markedItems = queue.items.map((item) =>
      processingPaths.has(normalizeQueuePath(item.path))
        ? {
            ...item,
            status: 'processing' as const,
            lastAttemptAt: now,
            attempts: Number(item.attempts || 0) + 1,
            error: undefined,
          }
        : item,
    );

    await writeQueue({
      updatedAt: now,
      items: markedItems,
    });

    const parseResult = await mergeParsedDocumentsForPaths(
      queued.map((item) => item.path),
      200,
      scanRoots,
      { parseStage: 'detailed', cloudEnhancement: true },
    );
    await upsertDocumentVectorIndex(
      parseResult.items.filter((item) => processingPaths.has(normalizeQueuePath(item.path))),
    );

    const afterSuccess = await readQueue();
    const items = afterSuccess.items
      .map((item) =>
        processingPaths.has(normalizeQueuePath(item.path))
          ? {
              ...item,
              status: 'succeeded' as const,
              completedAt: new Date().toISOString(),
              error: undefined,
            }
          : item,
      )
      .filter((item) => item.status !== 'succeeded');

    await writeQueue({
      updatedAt: new Date().toISOString(),
      items,
    });
    await refreshOpenClawMemoryCatalogNow('document-deep-parse-succeeded').catch(() => null);
    await markTaskSucceeded('deep-parse', {
      queuedCount: items.filter((item) => item.status === 'queued').length,
      processingCount: 0,
      durationMs: Date.now() - startedAtMs,
      lastMessage: `processed ${queued.length} documents`,
    }).catch(() => undefined);

    return {
      processedCount: queued.length,
      succeededCount: queued.length,
      failedCount: 0,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'deep-parse-failed';
    const queue = await readQueue();
    const processingPaths = new Set(
      queue.items
        .filter((item) => item.status === 'processing')
        .slice(0, Math.max(1, limit))
        .map((item) => normalizeQueuePath(item.path)),
    );

    if (processingPaths.size) {
      const items = queue.items.map((item) =>
        processingPaths.has(normalizeQueuePath(item.path))
          ? {
              ...item,
              status: 'failed' as const,
              error: String(reason).slice(0, 240),
            }
          : item,
      );

      await writeQueue({
        updatedAt: new Date().toISOString(),
        items,
      });
      await refreshOpenClawMemoryCatalogNow('document-deep-parse-failed').catch(() => null);
    }
    await markTaskFailed('deep-parse', reason, {
      queuedCount: queue.items.filter((item) => item.status === 'queued').length,
      processingCount: 0,
      retryDelta: processingPaths.size ? 1 : 0,
      lastMessage: processingPaths.size
        ? `failed while processing ${processingPaths.size} documents`
        : 'deep parse failed before selecting queued documents',
    }).catch(() => undefined);

    return {
      processedCount: processingPaths.size,
      succeededCount: 0,
      failedCount: processingPaths.size,
    };
  } finally {
    await releaseLock(lockOwner);
  }
}
