import path from 'node:path';
import type { DeepParseQueueItem, QueueStatus } from './document-deep-parse-queue-types.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeQueueStatus(value: unknown): QueueStatus {
  return value === 'processing' || value === 'succeeded' || value === 'failed'
    ? value
    : 'queued';
}

export function normalizeQueueItem(value: unknown): DeepParseQueueItem | null {
  if (!isRecord(value)) return null;
  const pathValue = String(value.path || '').trim();
  if (!pathValue) return null;
  return {
    path: pathValue,
    status: normalizeQueueStatus(value.status),
    queuedAt: String(value.queuedAt || '').trim() || new Date().toISOString(),
    lastAttemptAt: String(value.lastAttemptAt || '').trim() || undefined,
    completedAt: String(value.completedAt || '').trim() || undefined,
    attempts: Math.max(0, Number(value.attempts || 0)),
    error: String(value.error || '').trim() || undefined,
  };
}

export function buildTimestamp(offsetMinutes = 0) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

export function normalizeQueuePath(filePath: string) {
  return path.resolve(String(filePath || ''));
}

export function extractQueuePriority(item: DeepParseQueueItem) {
  const normalizedPath = normalizeQueuePath(item.path).toLowerCase();
  const uploadBoost = normalizedPath.includes(`${path.sep}storage${path.sep}files${path.sep}uploads${path.sep}`.toLowerCase())
    ? 10_000_000_000_000
    : 0;
  const baseName = path.basename(String(item.path || ''));
  const timestampMatch = baseName.match(/^(\d{13})(?:[-_.]|$)/);
  const pathTimestamp = timestampMatch ? Number(timestampMatch[1]) : 0;
  if (pathTimestamp > 0) return uploadBoost + pathTimestamp;
  const queuedAt = item.queuedAt ? Date.parse(item.queuedAt) : 0;
  return uploadBoost + (Number.isFinite(queuedAt) ? queuedAt : 0);
}
