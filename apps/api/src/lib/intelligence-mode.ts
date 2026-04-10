import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createAccessKey, getAccessKeyStatus, type AccessKeyRecord, verifyAccessKey } from './access-keys.js';
import { STORAGE_CONFIG_DIR } from './paths.js';

export type IntelligenceMode = 'service' | 'full';

export type IntelligenceCapabilities = {
  canReadLocalFiles: boolean;
  canImportLocalFiles: boolean;
  canModifyLocalSystemFiles: boolean;
};

export type IntelligenceModeState = {
  version: number;
  mode: IntelligenceMode;
  updatedAt: string;
  fullModeEnabledAt: string;
  fullModeEnabledByKeyId: string;
};

const INTELLIGENCE_MODE_STATE_FILE = path.join(STORAGE_CONFIG_DIR, 'intelligence-mode.json');
export const INTELLIGENCE_MODE_STATE_VERSION = 1;

type PersistedIntelligenceModeState = Partial<IntelligenceModeState> & Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTimestamp(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function normalizeMode(value: unknown): IntelligenceMode {
  return String(value || '').trim().toLowerCase() === 'full' ? 'full' : 'service';
}

export function resolveEffectiveIntelligenceMode(...modes: Array<unknown>): IntelligenceMode {
  return modes.some((item) => normalizeMode(item) === 'full') ? 'full' : 'service';
}

function normalizePersistedIntelligenceModeState(value: unknown): IntelligenceModeState {
  const source = isRecord(value) ? value as PersistedIntelligenceModeState : {};
  return {
    version: INTELLIGENCE_MODE_STATE_VERSION,
    mode: normalizeMode(source.mode),
    updatedAt: normalizeTimestamp(source.updatedAt) || new Date().toISOString(),
    fullModeEnabledAt: normalizeTimestamp(source.fullModeEnabledAt),
    fullModeEnabledByKeyId: String(source.fullModeEnabledByKeyId || '').trim(),
  };
}

async function ensureStateDir() {
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
}

async function readState() {
  await ensureStateDir();

  try {
    const raw = await fs.readFile(INTELLIGENCE_MODE_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const state = normalizePersistedIntelligenceModeState(parsed);
    const migrated = JSON.stringify(state) !== JSON.stringify(parsed);
    return { state, migrated };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return {
        state: normalizePersistedIntelligenceModeState(null),
        migrated: false,
      };
    }
    throw error;
  }
}

async function writeState(state: IntelligenceModeState) {
  await ensureStateDir();
  await fs.writeFile(
    INTELLIGENCE_MODE_STATE_FILE,
    JSON.stringify(normalizePersistedIntelligenceModeState(state), null, 2),
    'utf8',
  );
}

export function resolveIntelligenceCapabilities(mode: IntelligenceMode): IntelligenceCapabilities {
  return {
    canReadLocalFiles: true,
    canImportLocalFiles: true,
    canModifyLocalSystemFiles: mode === 'full',
  };
}

export async function loadIntelligenceModeState() {
  const { state, migrated } = await readState();
  if (migrated) {
    await writeState(state);
  }
  return state;
}

export async function setIntelligenceMode(mode: IntelligenceMode, input?: { enabledByKeyId?: string }) {
  const current = await loadIntelligenceModeState();
  const now = new Date().toISOString();
  const next: IntelligenceModeState = {
    ...current,
    mode,
    updatedAt: now,
    fullModeEnabledAt: mode === 'full'
      ? current.fullModeEnabledAt || now
      : current.fullModeEnabledAt,
    fullModeEnabledByKeyId: mode === 'full'
      ? String(input?.enabledByKeyId || current.fullModeEnabledByKeyId || '').trim()
      : current.fullModeEnabledByKeyId,
  };
  await writeState(next);
  return next;
}

export async function enableFullIntelligenceMode(code: string) {
  const item = await verifyAccessKey(code);
  if (!item) {
    throw new Error('invalid access key');
  }

  const state = await setIntelligenceMode('full', { enabledByKeyId: item.id });
  return { state, item };
}

export async function setupFullIntelligenceMode(input: { code?: string; label?: string }) {
  const accessStatus = await getAccessKeyStatus();
  if (accessStatus.initialized) {
    throw new Error('full mode already initialized');
  }

  const item = await createAccessKey(input);
  const state = await setIntelligenceMode('full', { enabledByKeyId: item.id });
  return { state, item };
}

export async function disableFullIntelligenceMode() {
  const state = await setIntelligenceMode('service');
  return state;
}

export async function getIntelligenceModeStatus() {
  const state = await loadIntelligenceModeState();
  const accessKeys = await getAccessKeyStatus();
  return {
    mode: state.mode,
    capabilities: resolveIntelligenceCapabilities(state.mode),
    accessKeys,
    fullModeEnabledAt: state.fullModeEnabledAt || '',
    fullModeEnabledByKeyId: state.fullModeEnabledByKeyId || '',
  };
}

export async function ensureFullIntelligenceMode(code: string): Promise<{
  state: IntelligenceModeState;
  item: AccessKeyRecord;
}> {
  return enableFullIntelligenceMode(code);
}
