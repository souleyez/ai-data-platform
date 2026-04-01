import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';

const ACCESS_KEY_STATE_FILE = path.join(STORAGE_CONFIG_DIR, 'access-keys.json');
const DEFAULT_ACCESS_KEY_LENGTH = 6;

export const ACCESS_KEY_STATE_VERSION = 1;

export type AccessKeyRecord = {
  id: string;
  code: string;
  label: string;
  createdAt: string;
};

type AccessKeyState = {
  version: number;
  items: AccessKeyRecord[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildId(prefix = 'key') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCode(value: unknown, allowEmpty = false) {
  const code = String(value || '').trim();
  if (!code) {
    if (allowEmpty) return '';
    throw new Error('access key code is required');
  }
  if (!/^\d{4,8}$/.test(code)) {
    throw new Error('access key code must be 4-8 digits');
  }
  return code;
}

function normalizeLabel(value: unknown, fallback = '访问密钥') {
  const label = String(value || '').trim().replace(/\s+/g, ' ');
  return label || fallback;
}

function normalizeCreatedAt(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return new Date().toISOString();
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function generateCode(existingCodes: Set<string>, length = DEFAULT_ACCESS_KEY_LENGTH) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const code = Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
    if (!existingCodes.has(code)) return code;
  }
  throw new Error('failed to generate access key');
}

function normalizeAccessKeyRecord(value: unknown): AccessKeyRecord | null {
  if (!isRecord(value)) return null;

  try {
    const code = normalizeCode(value.code);
    return {
      id: String(value.id || buildId('key')).trim() || buildId('key'),
      code,
      label: normalizeLabel(value.label),
      createdAt: normalizeCreatedAt(value.createdAt),
    };
  } catch {
    return null;
  }
}

function normalizePersistedAccessKeyState(value: unknown): AccessKeyState {
  const source = isRecord(value) ? value : {};
  const rawItems = Array.isArray(source.items)
    ? source.items
    : Array.isArray(source.keys)
      ? source.keys
      : [];

  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const items = rawItems
    .map(normalizeAccessKeyRecord)
    .filter((item): item is AccessKeyRecord => Boolean(item))
    .filter((item) => {
      if (seenIds.has(item.id) || seenCodes.has(item.code)) return false;
      seenIds.add(item.id);
      seenCodes.add(item.code);
      return true;
    });

  return {
    version: ACCESS_KEY_STATE_VERSION,
    items,
  };
}

async function ensureAccessKeyDir() {
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
}

async function readState() {
  await ensureAccessKeyDir();

  try {
    const raw = await fs.readFile(ACCESS_KEY_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const state = normalizePersistedAccessKeyState(parsed);
    const migrated = JSON.stringify(state) !== JSON.stringify(parsed);
    return { state, migrated };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return {
        state: normalizePersistedAccessKeyState(null),
        migrated: false,
      };
    }
    throw error;
  }
}

async function writeState(state: AccessKeyState) {
  await ensureAccessKeyDir();
  await fs.writeFile(
    ACCESS_KEY_STATE_FILE,
    JSON.stringify(normalizePersistedAccessKeyState(state), null, 2),
    'utf8',
  );
}

export async function loadAccessKeyState() {
  const { state, migrated } = await readState();
  if (migrated) {
    await writeState(state);
  }
  return state;
}

export async function listAccessKeys() {
  const state = await loadAccessKeyState();
  return state.items;
}

export async function hasConfiguredAccessKeys() {
  const items = await listAccessKeys();
  return items.length > 0;
}

export async function getAccessKeyStatus() {
  const items = await listAccessKeys();
  return {
    initialized: items.length > 0,
    total: items.length,
  };
}

export async function createAccessKey(input: { code?: string; label?: string }) {
  const { state } = await readState();
  const existingCodes = new Set(state.items.map((item) => item.code));
  const normalizedCode = normalizeCode(input.code, true) || generateCode(existingCodes);

  if (existingCodes.has(normalizedCode)) {
    throw new Error('access key code already exists');
  }

  const item: AccessKeyRecord = {
    id: buildId('key'),
    code: normalizedCode,
    label: normalizeLabel(input.label, `访问密钥 ${state.items.length + 1}`),
    createdAt: new Date().toISOString(),
  };

  state.items.unshift(item);
  await writeState(state);
  return item;
}

export async function verifyAccessKey(code: string) {
  try {
    const normalizedCode = normalizeCode(code);
    const items = await listAccessKeys();
    return items.find((item) => item.code === normalizedCode) || null;
  } catch {
    return null;
  }
}

export async function deleteAccessKey(id: string) {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    throw new Error('access key id is required');
  }

  const { state } = await readState();
  const targetIndex = state.items.findIndex((item) => item.id === normalizedId);
  if (targetIndex < 0) {
    throw new Error('access key not found');
  }

  const [item] = state.items.splice(targetIndex, 1);
  await writeState(state);
  return item;
}
