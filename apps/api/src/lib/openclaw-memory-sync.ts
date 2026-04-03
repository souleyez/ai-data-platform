import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';

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
  await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2), 'utf8');
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
    return null;
  }

  running = true;
  const reasons = [...pendingReasons];
  pendingReasons.clear();
  await updateSyncStatus({
    status: 'running',
    lastRequestedAt: new Date().toISOString(),
    lastStartedAt: new Date().toISOString(),
    pendingReasons: [],
    lastReasons: reasons,
    lastErrorMessage: '',
  });

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
  try {
    const raw = await fs.readFile(STATUS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<OpenClawMemorySyncStatus>;
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
  } catch {
    return buildDefaultStatus();
  }
}
