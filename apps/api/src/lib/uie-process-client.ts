import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildAugmentedEnv, getUIEPythonCommandCandidates } from './runtime-executables.js';

type PendingRequest = {
  resolve: (value: Record<string, string[]>) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
};

type UIEWorkerResponse = {
  id?: string;
  ok?: boolean;
  slots?: Record<string, string[]>;
  error?: string;
};

const REQUEST_TIMEOUT_MS = 120_000;
const WORKER_SCRIPT_PATH = path.resolve(process.cwd(), 'src', 'scripts', 'uie_stdio_worker.py');

let child: ChildProcessWithoutNullStreams | null = null;
let childBuffer = '';
let currentPythonCommand = '';
const pending = new Map<string, PendingRequest>();

function rejectAllPending(error: Error) {
  for (const [id, request] of pending) {
    clearTimeout(request.timer);
    request.reject(error);
    pending.delete(id);
  }
}

function cleanupChild() {
  if (child) {
    child.removeAllListeners();
    child.stdout.removeAllListeners();
    child.stderr.removeAllListeners();
    child = null;
  }
  childBuffer = '';
  currentPythonCommand = '';
}

function handleWorkerMessage(line: string) {
  let parsed: UIEWorkerResponse;
  try {
    parsed = JSON.parse(line) as UIEWorkerResponse;
  } catch {
    return;
  }

  if (!parsed.id) return;
  const request = pending.get(parsed.id);
  if (!request) return;

  clearTimeout(request.timer);
  pending.delete(parsed.id);

  if (parsed.ok && parsed.slots) {
    request.resolve(parsed.slots);
    return;
  }

  request.reject(new Error(parsed.error || 'UIE worker request failed'));
}

function attachChildListeners(processRef: ChildProcessWithoutNullStreams) {
  processRef.stdout.on('data', (chunk: Buffer | string) => {
    childBuffer += chunk.toString();
    let newlineIndex = childBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = childBuffer.slice(0, newlineIndex).trim();
      childBuffer = childBuffer.slice(newlineIndex + 1);
      if (line) handleWorkerMessage(line);
      newlineIndex = childBuffer.indexOf('\n');
    }
  });

  processRef.stderr.on('data', () => {
    // ignored; caller falls back on timeout/error
  });

  processRef.on('exit', (code, signal) => {
    const error = new Error(`UIE worker exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
    cleanupChild();
    rejectAllPending(error);
  });

  processRef.on('error', (error) => {
    cleanupChild();
    rejectAllPending(error);
  });
}

function spawnWorker() {
  const env = {
    ...buildAugmentedEnv(),
    PYTHONIOENCODING: 'utf-8',
  };

  const candidates = getUIEPythonCommandCandidates();
  let lastError: Error | null = null;

  for (const command of candidates) {
    try {
      const processRef = spawn(command, [WORKER_SCRIPT_PATH], {
        cwd: process.cwd(),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      currentPythonCommand = command;
      attachChildListeners(processRef);
      child = processRef;
      return processRef;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('Unable to start UIE worker');
}

function ensureWorker() {
  if (child && !child.killed) return child;
  return spawnWorker();
}

export async function extractWithUIEWorker(input: {
  text: string;
  model?: string;
  schema: readonly string[];
}) {
  const processRef = ensureWorker();
  const requestId = randomUUID();
  const payload = JSON.stringify({
    id: requestId,
    text: input.text,
    model: input.model || 'uie-base',
    schema: [...input.schema],
  });

  return new Promise<Record<string, string[]>>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      try {
        processRef.kill();
      } catch {
        // ignore
      }
      reject(new Error(`UIE worker timed out after ${REQUEST_TIMEOUT_MS}ms`));
    }, REQUEST_TIMEOUT_MS);

    pending.set(requestId, { resolve, reject, timer });

    processRef.stdin.write(`${payload}\n`, (error) => {
      if (!error) return;
      clearTimeout(timer);
      pending.delete(requestId);
      reject(error);
    });
  });
}

export function getUIEWorkerDebugState() {
  return {
    active: Boolean(child && !child.killed),
    pythonCommand: currentPythonCommand,
    pendingRequests: pending.size,
  };
}
