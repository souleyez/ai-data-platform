import { promises as fs } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, STORAGE_CONFIG_DIR } from './paths.js';

export type WecomChannelConfig = {
  routeKey: string;
  token: string;
  encodingAesKey: string;
  corpId: string;
  enabled: boolean;
};

type PersistedWecomChannelConfig = {
  version: number;
  updatedAt: string;
  items: WecomChannelConfig[];
};

const CONFIG_VERSION = 1;
const DEFAULT_FILE = path.join(REPO_ROOT, 'config', 'wecom-channels.default.json');
const STORAGE_FILE = path.join(STORAGE_CONFIG_DIR, 'wecom-channels.json');

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeTimestamp(value: unknown) {
  const text = normalizeText(value);
  if (!text) return new Date().toISOString();
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : new Date().toISOString();
}

function normalizeItem(value: unknown): WecomChannelConfig | null {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!source) return null;

  const routeKey = normalizeText(source.routeKey);
  const token = normalizeText(source.token);
  const encodingAesKey = normalizeText(source.encodingAesKey);
  const corpId = normalizeText(source.corpId);
  if (!routeKey || !token || !encodingAesKey || !corpId) {
    return null;
  }

  return {
    routeKey,
    token,
    encodingAesKey,
    corpId,
    enabled: source.enabled !== false,
  };
}

function normalizeConfig(value: unknown): PersistedWecomChannelConfig {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const seen = new Set<string>();
  const items = Array.isArray(source.items)
    ? source.items
        .map((item) => normalizeItem(item))
        .filter((item): item is WecomChannelConfig => Boolean(item))
        .filter((item) => {
          if (seen.has(item.routeKey)) return false;
          seen.add(item.routeKey);
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

export async function listWecomChannelConfigs() {
  const [defaultRaw, storageRaw] = await Promise.all([
    readJson(DEFAULT_FILE),
    readJson(STORAGE_FILE),
  ]);
  const defaults = normalizeConfig(defaultRaw);
  const storage = normalizeConfig(storageRaw);
  const merged = new Map<string, WecomChannelConfig>();
  for (const item of defaults.items) merged.set(item.routeKey, item);
  for (const item of storage.items) merged.set(item.routeKey, item);
  return [...merged.values()].filter((item) => item.enabled);
}

export async function getWecomChannelConfig(routeKey: string) {
  const normalized = normalizeText(routeKey);
  if (!normalized) return null;
  const items = await listWecomChannelConfigs();
  return items.find((item) => item.routeKey === normalized) || null;
}
