import { promises as fs } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, STORAGE_CONFIG_DIR } from './paths.js';

export type WecomLongConnectionConfig = {
  externalBotId: string;
  secret: string;
  enabled: boolean;
  wsUrl?: string;
};

type PersistedWecomLongConnectionConfig = {
  version: number;
  updatedAt: string;
  items: WecomLongConnectionConfig[];
};

const CONFIG_VERSION = 1;
const DEFAULT_FILE = path.join(REPO_ROOT, 'config', 'wecom-long-connections.default.json');
const STORAGE_FILE = path.join(STORAGE_CONFIG_DIR, 'wecom-long-connections.json');

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeTimestamp(value: unknown) {
  const text = normalizeText(value);
  if (!text) return new Date().toISOString();
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : new Date().toISOString();
}

function normalizeItem(value: unknown): WecomLongConnectionConfig | null {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!source) return null;
  const externalBotId = normalizeText(source.externalBotId || source.botId);
  const secret = normalizeText(source.secret);
  if (!externalBotId || !secret) return null;
  return {
    externalBotId,
    secret,
    enabled: source.enabled !== false,
    wsUrl: normalizeText(source.wsUrl) || undefined,
  };
}

function normalizeConfig(value: unknown): PersistedWecomLongConnectionConfig {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const seen = new Set<string>();
  const items = Array.isArray(source.items)
    ? source.items
        .map((item) => normalizeItem(item))
        .filter((item): item is WecomLongConnectionConfig => Boolean(item))
        .filter((item) => {
          if (seen.has(item.externalBotId)) return false;
          seen.add(item.externalBotId);
          return true;
        })
    : [];
  return {
    version: CONFIG_VERSION,
    updatedAt: normalizeTimestamp(source.updatedAt),
    items,
  };
}

async function readJson(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export async function listWecomLongConnectionConfigs() {
  const [defaultRaw, storageRaw] = await Promise.all([
    readJson(DEFAULT_FILE),
    readJson(STORAGE_FILE),
  ]);
  const defaults = normalizeConfig(defaultRaw);
  const storage = normalizeConfig(storageRaw);
  const merged = new Map<string, WecomLongConnectionConfig>();
  for (const item of defaults.items) merged.set(item.externalBotId, item);
  for (const item of storage.items) merged.set(item.externalBotId, item);
  return [...merged.values()].filter((item) => item.enabled);
}
