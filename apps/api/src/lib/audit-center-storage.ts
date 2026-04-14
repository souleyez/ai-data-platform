import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadDocumentOverrides, saveDocumentOverrides } from './document-overrides.js';
import { STORAGE_CONFIG_DIR, STORAGE_ROOT, STORAGE_CACHE_DIR } from './paths.js';
import { removeRetainedDocument } from './retained-documents.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';
import type { AuditLog, AuditState } from './audit-center-types.js';

const AUDIT_CONFIG_DIR = STORAGE_CONFIG_DIR;
const AUDIT_STATE_FILE = path.join(AUDIT_CONFIG_DIR, 'audit-center.json');
const DOCUMENT_CACHE_FILE = path.join(STORAGE_CACHE_DIR, 'documents-cache.json');
const MIN_FREE_RATIO = Number(process.env.AUDIT_STORAGE_MIN_FREE_RATIO || 0.2);

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function toIso(value: Date) {
  return value.toISOString();
}

export function diffDays(from: string) {
  const timestamp = Date.parse(from);
  if (Number.isNaN(timestamp)) return 0;
  return Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
}

export function getDocumentGroups(item: { confirmedGroups?: string[]; groups?: string[] }) {
  return [...new Set((item.confirmedGroups?.length ? item.confirmedGroups : item.groups || []).filter(Boolean))];
}

export function detectDocumentSourceType(filePath: string): 'upload' | 'capture' | 'other' {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/uploads/')) return 'upload';
  if (normalized.includes('/web-captures/')) return 'capture';
  return 'other';
}

async function ensureAuditDir() {
  await fs.mkdir(AUDIT_CONFIG_DIR, { recursive: true });
}

export async function readAuditState(): Promise<AuditState> {
  const { data } = await readRuntimeStateJson<AuditState>({
    filePath: AUDIT_STATE_FILE,
    fallback: {},
    normalize: (parsed) => {
      const logs = Array.isArray((parsed as AuditState | null)?.logs)
        ? (parsed as AuditState).logs
        : [];
      return { logs };
    },
  });
  return data;
}

async function writeAuditState(state: AuditState) {
  await ensureAuditDir();
  await writeRuntimeStateJson({
    filePath: AUDIT_STATE_FILE,
    payload: state,
  });
}

export async function appendAuditLog(input: Omit<AuditLog, 'id' | 'time'>) {
  const current = await readAuditState();
  const item: AuditLog = {
    id: buildId('audit'),
    time: new Date().toISOString(),
    ...input,
  };
  const logs = [item, ...(current.logs || [])].slice(0, 200);
  await writeAuditState({ logs });
  return item;
}

export async function getStorageStats() {
  const stat = await fs.statfs(STORAGE_ROOT);
  const totalBytes = Number(stat.blocks) * Number(stat.bsize);
  const freeBytes = Number(stat.bavail) * Number(stat.bsize);
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const freeRatio = totalBytes > 0 ? freeBytes / totalBytes : 1;

  return {
    totalBytes,
    freeBytes,
    usedBytes,
    freeRatio,
    freeThresholdRatio: MIN_FREE_RATIO,
    belowThreshold: freeRatio < MIN_FREE_RATIO,
  };
}

export async function statCreatedAt(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    const candidate = stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime;
    return toIso(candidate);
  } catch {
    return '';
  }
}

async function syncDocumentCache(removedPaths: string[]) {
  try {
    const raw = await fs.readFile(DOCUMENT_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as { items?: Array<{ path: string }>; totalFiles?: number };
    const nextItems = (parsed.items || []).filter((item) => !removedPaths.includes(item.path));
    await fs.writeFile(DOCUMENT_CACHE_FILE, JSON.stringify({
      ...parsed,
      items: nextItems,
      totalFiles: nextItems.length,
      generatedAt: new Date().toISOString(),
    }, null, 2), 'utf8');
  } catch {
    // keep audit cleanup best-effort
  }
}

export async function removeDocumentFiles(filePaths: string[]) {
  await Promise.all(filePaths.map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)));

  const overrides = await loadDocumentOverrides();
  let changed = false;
  for (const filePath of filePaths) {
    if (overrides[filePath]) {
      delete overrides[filePath];
      changed = true;
    }
  }
  if (changed) {
    await saveDocumentOverrides(overrides);
  }
}

export async function purgeDocumentRecords(filePaths: string[]) {
  await removeDocumentFiles(filePaths);
  await syncDocumentCache(filePaths);
  await Promise.all(filePaths.map((filePath) => removeRetainedDocument(filePath)));
}

export function getCaptureFilePaths(task: {
  documentPath?: string;
  markdownPath?: string;
  rawDocumentPath?: string;
}) {
  return Array.from(new Set([
    String(task.documentPath || '').trim(),
    String(task.markdownPath || '').trim(),
    String(task.rawDocumentPath || '').trim(),
  ].filter(Boolean)));
}
