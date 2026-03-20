import 'dotenv/config';

const workerName = process.env.WORKER_NAME || 'ingest-worker';
const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 15000);
const apiBaseUrl = (process.env.API_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const scanPath = process.env.WORKER_SCAN_PATH || '/api/documents/scan';
const webCapturePath = process.env.WORKER_WEB_CAPTURE_PATH || '/api/web-captures/run-due';

type ScanResponse = {
  status?: string;
  totalFiles?: number;
  scanRoot?: string;
  message?: string;
  startedAt?: string;
  finishedAt?: string;
};

type WebCaptureTickResponse = {
  status?: string;
  total?: number;
  executedCount?: number;
  successCount?: number;
  errorCount?: number;
};

async function triggerScan(): Promise<ScanResponse> {
  const response = await fetch(`${apiBaseUrl}${scanPath}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`scan request failed with status ${response.status}`);
  }

  return response.json() as Promise<ScanResponse>;
}

async function runTick() {
  try {
    const result = await triggerScan();
    console.log(
      `[worker:${workerName}] scan=${result.status || 'unknown'} | files=${result.totalFiles ?? 0} | scanRoot=${result.scanRoot || 'n/a'} | finishedAt=${result.finishedAt || new Date().toISOString()}`,
    );

    if (result.message) {
      console.log(`[worker:${workerName}] ${result.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[worker:${workerName}] scan failed | api=${apiBaseUrl}${scanPath} | reason=${message}`);
  }

  try {
    const response = await fetch(`${apiBaseUrl}${webCapturePath}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`web capture request failed with status ${response.status}`);
    }

    const result = await response.json() as WebCaptureTickResponse;
    console.log(
      `[worker:${workerName}] web-captures=${result.status || 'unknown'} | executed=${result.executedCount ?? 0} | success=${result.successCount ?? 0} | error=${result.errorCount ?? 0}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[worker:${workerName}] web capture tick failed | api=${apiBaseUrl}${webCapturePath} | reason=${message}`);
  }
}

console.log(`[worker:${workerName}] starting with interval=${pollIntervalMs}ms | scan=${apiBaseUrl}${scanPath} | web=${apiBaseUrl}${webCapturePath}`);
await runTick();
setInterval(() => {
  void runTick();
}, pollIntervalMs);
