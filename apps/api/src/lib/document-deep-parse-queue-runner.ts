import { mergeParsedDocumentsForPaths } from './document-store.js';
import { refreshOpenClawMemoryCatalogNow } from './openclaw-memory-sync.js';
import { upsertDocumentVectorIndex } from './document-vector-index.js';
import {
  markTaskFailed,
  markTaskSkipped,
  markTaskStarted,
  markTaskSucceeded,
} from './task-runtime-metrics.js';
import {
  acquireQueueLock,
  readQueue,
  releaseQueueLock,
  writeQueue,
} from './document-deep-parse-queue-storage.js';
import { extractQueuePriority, normalizeQueuePath } from './document-deep-parse-queue-support.js';

export async function runDetailedParseBatch(limit = 12, scanRoots?: string[]) {
  const lockOwner = await acquireQueueLock();
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
    await releaseQueueLock(lockOwner);
  }
}
