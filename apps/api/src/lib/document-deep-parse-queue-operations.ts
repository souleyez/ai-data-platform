import type { ParsedDocument } from './document-parser.js';
import {
  readQueue,
  writeQueue,
} from './document-deep-parse-queue-storage.js';
import { normalizeQueuePath } from './document-deep-parse-queue-support.js';

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

export async function clearDetailedParseQueueEntries(filePaths: string[]) {
  const normalized = new Set((filePaths || []).map(normalizeQueuePath).filter(Boolean));
  if (!normalized.size) return { clearedCount: 0 };

  const queue = await readQueue();
  const nextItems = queue.items.filter((item) => !normalized.has(normalizeQueuePath(item.path)));
  const clearedCount = queue.items.length - nextItems.length;
  if (!clearedCount) return { clearedCount: 0 };

  await writeQueue({
    updatedAt: new Date().toISOString(),
    items: nextItems,
  });

  return { clearedCount };
}
