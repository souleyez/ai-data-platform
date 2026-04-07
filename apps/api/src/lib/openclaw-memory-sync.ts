import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';
import {
  markTaskFailed,
  markTaskScheduled,
  markTaskStarted,
  markTaskSucceeded,
} from './task-runtime-metrics.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

const SYNC_DEBOUNCE_MS = Math.max(500, Number(process.env.OPENCLAW_MEMORY_SYNC_DEBOUNCE_MS || 1500));
const STATUS_FILE = path.join(STORAGE_CONFIG_DIR, 'openclaw-memory-sync-status.json');

let scheduledTimer: NodeJS.Timeout | null = null;
let running = false;
let rerunRequested = false;
const pendingReasons = new Set<string>();

export type OpenClawMemorySyncStatus = {
  status: 'idle' | 'scheduled' | 'running' | 'success' | 'failed';
  lastRequestedAt: string;
  lastStartedAt: string;
  lastFinishedAt: string;
  lastSuccessAt: string;
  lastErrorAt: string;
  lastErrorMessage: string;
  pendingReasons: string[];
  lastReasons: string[];
  lastResult: {
    generatedAt: string;
    libraryCount: number;
    documentCount: number;
    templateCount: number;
    outputCount: number;
    changeCount: number;
    changedThisRun: number;
  } | null;
};

function buildDefaultStatus(): OpenClawMemorySyncStatus {
  return {
    status: 'idle',
    lastRequestedAt: '',
    lastStartedAt: '',
    lastFinishedAt: '',
    lastSuccessAt: '',
    lastErrorAt: '',
    lastErrorMessage: '',
    pendingReasons: [],
    lastReasons: [],
    lastResult: null,
  };
}

async function writeSyncStatus(status: OpenClawMemorySyncStatus) {
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
  await writeRuntimeStateJson({
    filePath: STATUS_FILE,
    payload: status,
  });
}

async function updateSyncStatus(patch: Partial<OpenClawMemorySyncStatus>) {
  const current = await readOpenClawMemorySyncStatus();
  await writeSyncStatus({
    ...current,
    ...patch,
  });
}

async function runRefresh() {
  const { refreshOpenClawMemoryCatalog } = await import('./openclaw-memory-catalog.js');
  return refreshOpenClawMemoryCatalog();
}

async function flushOpenClawMemoryCatalogSync() {
  if (running) {
    rerunRequested = true;
    await updateSyncStatus({
      status: 'scheduled',
      lastRequestedAt: new Date().toISOString(),
      pendingReasons: [...pendingReasons],
    });
    await markTaskScheduled('memory-sync', {
      queuedCount: pendingReasons.size,
      processingCount: 1,
      lastMessage: 'memory sync rerun requested while current run is active',
    }).catch(() => undefined);
    return null;
  }

  running = true;
  const reasons = [...pendingReasons];
  pendingReasons.clear();
  const startedAtMs = Date.now();
  await updateSyncStatus({
    status: 'running',
    lastRequestedAt: new Date().toISOString(),
    lastStartedAt: new Date().toISOString(),
    pendingReasons: [],
    lastReasons: reasons,
    lastErrorMessage: '',
  });
  await markTaskStarted('memory-sync', {
    queuedCount: reasons.length,
    processingCount: 1,
    lastMessage: reasons.join(', ') || 'manual',
  }).catch(() => undefined);

  try {
    const result = await runRefresh();
    await updateSyncStatus({
      status: 'success',
      lastFinishedAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      lastErrorAt: '',
      lastErrorMessage: '',
      pendingReasons: [...pendingReasons],
      lastReasons: reasons,
      lastResult: {
        generatedAt: result.generatedAt,
        libraryCount: result.libraryCount,
        documentCount: result.documentCount,
        templateCount: result.templateCount,
        outputCount: result.outputCount,
        changeCount: result.changeCount,
        changedThisRun: result.changedThisRun,
      },
    });
    await markTaskSucceeded('memory-sync', {
      queuedCount: pendingReasons.size,
      processingCount: 0,
      durationMs: Date.now() - startedAtMs,
      lastMessage: reasons.join(', ') || 'manual',
    }).catch(() => undefined);
    return {
      ...result,
      reasons,
    };
  } catch (error) {
    await updateSyncStatus({
      status: 'failed',
      lastFinishedAt: new Date().toISOString(),
      lastErrorAt: new Date().toISOString(),
      lastErrorMessage: error instanceof Error ? error.message : 'openclaw-memory-sync-failed',
      pendingReasons: [...pendingReasons],
      lastReasons: reasons,
    });
    await markTaskFailed('memory-sync', error instanceof Error ? error.message : 'openclaw-memory-sync-failed', {
      queuedCount: pendingReasons.size,
      processingCount: 0,
      durationMs: Date.now() - startedAtMs,
      retryDelta: rerunRequested ? 1 : 0,
      lastMessage: reasons.join(', ') || 'manual',
    }).catch(() => undefined);
    throw error;
  } finally {
    running = false;
    if (rerunRequested) {
      rerunRequested = false;
      scheduleOpenClawMemoryCatalogSync('rerun');
    }
  }
}

export function scheduleOpenClawMemoryCatalogSync(reason = 'unspecified') {
  pendingReasons.add(String(reason || 'unspecified'));
  void updateSyncStatus({
    status: running ? 'running' : 'scheduled',
    lastRequestedAt: new Date().toISOString(),
    pendingReasons: [...pendingReasons],
  }).catch(() => undefined);
  void markTaskScheduled('memory-sync', {
    queuedCount: pendingReasons.size,
    processingCount: running ? 1 : 0,
    lastMessage: String(reason || 'unspecified'),
  }).catch(() => undefined);
  if (scheduledTimer) return;

  scheduledTimer = setTimeout(async () => {
    scheduledTimer = null;
    try {
      await flushOpenClawMemoryCatalogSync();
    } catch {
      // Swallow sync errors in background mode. Manual refresh surfaces them.
    }
  }, SYNC_DEBOUNCE_MS);
  scheduledTimer.unref?.();
}

export async function refreshOpenClawMemoryCatalogNow(reason = 'manual') {
  pendingReasons.add(String(reason || 'manual'));
  if (scheduledTimer) {
    clearTimeout(scheduledTimer);
    scheduledTimer = null;
  }
  return flushOpenClawMemoryCatalogSync();
}

export async function readOpenClawMemorySyncStatus(): Promise<OpenClawMemorySyncStatus> {
  const { data } = await readRuntimeStateJson<OpenClawMemorySyncStatus>({
    filePath: STATUS_FILE,
    fallback: buildDefaultStatus(),
    normalize: (raw) => {
      const parsed = (raw || {}) as Partial<OpenClawMemorySyncStatus>;
      return {
        ...buildDefaultStatus(),
        ...parsed,
        pendingReasons: Array.isArray(parsed.pendingReasons) ? parsed.pendingReasons.map((item) => String(item || '')).filter(Boolean) : [],
        lastReasons: Array.isArray(parsed.lastReasons) ? parsed.lastReasons.map((item) => String(item || '')).filter(Boolean) : [],
        lastResult: parsed.lastResult && typeof parsed.lastResult === 'object'
          ? {
              generatedAt: String(parsed.lastResult.generatedAt || ''),
              libraryCount: Number(parsed.lastResult.libraryCount || 0),
              documentCount: Number(parsed.lastResult.documentCount || 0),
              templateCount: Number(parsed.lastResult.templateCount || 0),
              outputCount: Number(parsed.lastResult.outputCount || 0),
              changeCount: Number(parsed.lastResult.changeCount || 0),
              changedThisRun: Number(parsed.lastResult.changedThisRun || 0),
            }
          : null,
      };
    },
  });
  return data;
}
