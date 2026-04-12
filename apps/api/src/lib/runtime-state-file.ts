import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export type RuntimeStateReadSource = 'main' | 'backup' | 'fallback';

export type RuntimeStateReadResult<T> = {
  data: T;
  source: RuntimeStateReadSource;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function buildRuntimeStateBackupPath(filePath: string) {
  return `${filePath}.bak`;
}

const runtimeStateWriteChains = new Map<string, Promise<void>>();

async function tryReadJsonFile(filePath: string) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

export async function readRuntimeStateJson<T>(input: {
  filePath: string;
  fallback: T | (() => T);
  normalize?: (parsed: unknown) => T;
}): Promise<RuntimeStateReadResult<T>> {
  const { filePath } = input;
  const fallback = typeof input.fallback === 'function'
    ? (input.fallback as () => T)
    : () => input.fallback as T;
  const normalize = input.normalize || ((parsed: unknown) => parsed as T);
  const backupPath = buildRuntimeStateBackupPath(filePath);

  try {
    return {
      data: normalize(await tryReadJsonFile(filePath)),
      source: 'main',
    };
  } catch {
    try {
      return {
        data: normalize(await tryReadJsonFile(backupPath)),
        source: 'backup',
      };
    } catch {
      return {
        data: fallback(),
        source: 'fallback',
      };
    }
  }
}

export async function writeRuntimeStateJson<T>(input: {
  filePath: string;
  payload: T;
  serialize?: (payload: T) => unknown;
}) {
  const { filePath } = input;
  const previous = runtimeStateWriteChains.get(filePath) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const payload = input.serialize ? input.serialize(input.payload) : input.payload;
      const backupPath = buildRuntimeStateBackupPath(filePath);
      const tempFilePath = `${filePath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;

      await fs.mkdir(path.dirname(filePath), { recursive: true });

      try {
        await fs.copyFile(filePath, backupPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          throw error;
        }
      }

      await fs.writeFile(tempFilePath, JSON.stringify(payload, null, 2), 'utf8');
      await fs.copyFile(tempFilePath, filePath);
      await fs.rm(tempFilePath, { force: true });
    });

  runtimeStateWriteChains.set(filePath, next);
  try {
    await next;
  } finally {
    if (runtimeStateWriteChains.get(filePath) === next) {
      runtimeStateWriteChains.delete(filePath);
    }
  }
}

export function normalizeArrayPayload<T>(parsed: unknown, itemGuard?: (item: unknown) => item is T) {
  if (!isRecord(parsed)) return [];
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  if (!itemGuard) return items as T[];
  return items.filter((item): item is T => itemGuard(item));
}
