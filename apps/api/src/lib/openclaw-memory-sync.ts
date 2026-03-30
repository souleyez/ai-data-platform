const SYNC_DEBOUNCE_MS = Math.max(500, Number(process.env.OPENCLAW_MEMORY_SYNC_DEBOUNCE_MS || 1500));

let scheduledTimer: NodeJS.Timeout | null = null;
let running = false;
let rerunRequested = false;
const pendingReasons = new Set<string>();

async function runRefresh() {
  const { refreshOpenClawMemoryCatalog } = await import('./openclaw-memory-catalog.js');
  return refreshOpenClawMemoryCatalog();
}

async function flushOpenClawMemoryCatalogSync() {
  if (running) {
    rerunRequested = true;
    return null;
  }

  running = true;
  const reasons = [...pendingReasons];
  pendingReasons.clear();

  try {
    const result = await runRefresh();
    return {
      ...result,
      reasons,
    };
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
  if (scheduledTimer) return;

  scheduledTimer = setTimeout(async () => {
    scheduledTimer = null;
    try {
      await flushOpenClawMemoryCatalogSync();
    } catch {
      // Swallow sync errors in background mode. Manual refresh surfaces them.
    }
  }, SYNC_DEBOUNCE_MS);
}

export async function refreshOpenClawMemoryCatalogNow(reason = 'manual') {
  pendingReasons.add(String(reason || 'manual'));
  if (scheduledTimer) {
    clearTimeout(scheduledTimer);
    scheduledTimer = null;
  }
  return flushOpenClawMemoryCatalogSync();
}
