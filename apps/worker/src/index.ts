import 'dotenv/config';

const workerName = process.env.WORKER_NAME || 'ingest-worker';
const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 15000);
const apiBaseUrl = (process.env.API_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const scanPath = process.env.WORKER_SCAN_PATH || '/api/documents/scan';
const webCapturePath = process.env.WORKER_WEB_CAPTURE_PATH || '/api/web-captures/run-due';
const auditPolicyPath = process.env.WORKER_AUDIT_POLICY_PATH || '/api/audit/run-policy';
const enableAutoScan = /^(1|true|yes)$/i.test(String(process.env.WORKER_ENABLE_SCAN || 'false'));
const enableAuditPolicy = /^(1|true|yes)$/i.test(String(process.env.WORKER_ENABLE_AUDIT || 'false'));
const auditHour = Number(process.env.WORKER_AUDIT_HOUR ?? 2);
const auditMinute = Number(process.env.WORKER_AUDIT_MINUTE ?? 0);

let lastAuditRunKey = '';

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

type AuditPolicyResponse = {
  status?: string;
  cleanedDocuments?: number;
  cleanedCaptureTasks?: number;
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

function buildAuditRunKey(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shouldRunAuditPolicy(now = new Date()) {
  if (!enableAuditPolicy) return false;
  if (now.getHours() !== auditHour) return false;
  if (now.getMinutes() !== auditMinute) return false;
  return lastAuditRunKey !== buildAuditRunKey(now);
}

async function runAuditPolicyTick(now = new Date()) {
  if (!enableAuditPolicy) {
    console.log(`[worker:${workerName}] audit-policy disabled | set WORKER_ENABLE_AUDIT=true to enable ${apiBaseUrl}${auditPolicyPath}`);
    return;
  }

  if (!shouldRunAuditPolicy(now)) {
    const nextWindow = `${String(auditHour).padStart(2, '0')}:${String(auditMinute).padStart(2, '0')}`;
    console.log(`[worker:${workerName}] audit-policy idle | next daily run at ${nextWindow}`);
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}${auditPolicyPath}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`audit policy request failed with status ${response.status}`);
    }

    const result = await response.json() as AuditPolicyResponse;
    lastAuditRunKey = buildAuditRunKey(now);
    console.log(
      `[worker:${workerName}] audit-policy=${result.status || 'unknown'} | cleanedDocs=${result.cleanedDocuments ?? 0} | cleanedSources=${result.cleanedCaptureTasks ?? 0}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[worker:${workerName}] audit policy tick failed | api=${apiBaseUrl}${auditPolicyPath} | reason=${message}`);
  }
}

async function runTick() {
  if (enableAutoScan) {
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
  } else {
    console.log(`[worker:${workerName}] auto-scan disabled | set WORKER_ENABLE_SCAN=true to enable ${apiBaseUrl}${scanPath}`);
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

  await runAuditPolicyTick();
}

console.log(`[worker:${workerName}] starting with interval=${pollIntervalMs}ms | autoScan=${enableAutoScan} | audit=${enableAuditPolicy} | auditAt=${String(auditHour).padStart(2, '0')}:${String(auditMinute).padStart(2, '0')} | scan=${apiBaseUrl}${scanPath} | web=${apiBaseUrl}${webCapturePath} | auditPath=${apiBaseUrl}${auditPolicyPath}`);
await runTick();
setInterval(() => {
  void runTick();
}, pollIntervalMs);
