import path from 'node:path';
import { STORAGE_CACHE_DIR } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';
import type { DeepParseQueuePayload } from './document-deep-parse-queue-types.js';
import { isRecord, normalizeQueueItem } from './document-deep-parse-queue-support.js';

const QUEUE_FILE = path.join(STORAGE_CACHE_DIR, 'document-deep-parse-queue.json');
const LOCK_TTL_MS = 5 * 60 * 1000;

let activeLock: { owner: string; acquiredAt: number } | null = null;

function createEmptyQueueState(): DeepParseQueuePayload {
  return {
    updatedAt: new Date().toISOString(),
    items: [],
  };
}

export async function readQueue(): Promise<DeepParseQueuePayload> {
  const { data } = await readRuntimeStateJson<DeepParseQueuePayload>({
    filePath: QUEUE_FILE,
    fallback: createEmptyQueueState,
    normalize: (parsed) => {
      if (!isRecord(parsed)) return createEmptyQueueState();
      return {
        updatedAt: String(parsed.updatedAt || '').trim() || new Date().toISOString(),
        items: Array.isArray(parsed.items)
          ? parsed.items.map((item) => normalizeQueueItem(item)).filter((item): item is NonNullable<typeof item> => Boolean(item))
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

export async function writeQueue(payload: DeepParseQueuePayload) {
  await writeRuntimeStateJson({
    filePath: QUEUE_FILE,
    payload,
  });
}

export async function acquireQueueLock() {
  const now = Date.now();
  const owner = `${process.pid}-${now}`;
  if (activeLock && now - activeLock.acquiredAt < LOCK_TTL_MS) {
    return null;
  }
  activeLock = { owner, acquiredAt: now };
  return owner;
}

export async function releaseQueueLock(owner: string | null) {
  if (!owner) return;
  if (activeLock?.owner === owner) activeLock = null;
}
