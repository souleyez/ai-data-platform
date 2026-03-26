import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { mergeParsedDocumentsForPaths } from './document-store.js';
import { STORAGE_CACHE_DIR } from './paths.js';

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

async function ensureQueueDir() {
  await fs.mkdir(STORAGE_CACHE_DIR, { recursive: true });
}

async function readQueue(): Promise<DeepParseQueuePayload> {
  try {
    const raw = await fs.readFile(QUEUE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DeepParseQueuePayload;
    return {
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return {
      updatedAt: new Date().toISOString(),
      items: [],
    };
  }
}

async function writeQueue(payload: DeepParseQueuePayload) {
  await ensureQueueDir();
  await fs.writeFile(QUEUE_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function normalizeQueuePath(filePath: string) {
  return path.resolve(String(filePath || ''));
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

    return {
      ...item,
      detailParseStatus: item.parseStage === 'detailed' ? 'succeeded' : queueItem.status,
      detailParseQueuedAt: queueItem.queuedAt,
      detailParsedAt: item.detailParsedAt || queueItem.completedAt,
      detailParseAttempts: Math.max(Number(item.detailParseAttempts || 0), Number(queueItem.attempts || 0)),
      detailParseError: queueItem.status === 'failed' ? queueItem.error || item.detailParseError : item.detailParseError,
    };
  });
}

export async function runDetailedParseBatch(limit = 12, scanRoots?: string[]) {
  const queue = await readQueue();
  const queued = queue.items.filter((item) => item.status === 'queued').slice(0, Math.max(1, limit));
  if (!queued.length) {
    return { processedCount: 0, succeededCount: 0, failedCount: 0 };
  }

  const now = new Date().toISOString();
  const processingPaths = new Set(queued.map((item) => normalizeQueuePath(item.path)));
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

  try {
    await mergeParsedDocumentsForPaths(
      queued.map((item) => item.path),
      200,
      scanRoots,
      { parseStage: 'detailed', cloudEnhancement: true },
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

    return {
      processedCount: queued.length,
      succeededCount: queued.length,
      failedCount: 0,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'deep-parse-failed';
    const afterFailure = await readQueue();
    const items = afterFailure.items.map((item) =>
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

    return {
      processedCount: queued.length,
      succeededCount: 0,
      failedCount: queued.length,
    };
  }
}
