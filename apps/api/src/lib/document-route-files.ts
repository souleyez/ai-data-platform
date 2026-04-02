import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SCAN_DIR } from './document-store.js';

export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

export const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  ...IMAGE_CONTENT_TYPES,
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || `upload-${Date.now()}`;
}

export function buildAttachmentDisposition(fileName: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function resolveDocumentReadablePath(rawPath: string) {
  const original = String(rawPath || '').trim();
  if (!original) return original;

  const normalized = original.replace(/\\/g, '/');
  const marker = '/storage/files/';
  const markerIndex = normalized.toLowerCase().lastIndexOf(marker);
  if (markerIndex < 0) return original;

  const relative = normalized.slice(markerIndex + marker.length);
  return path.join(DEFAULT_SCAN_DIR, relative);
}

export async function hasReadableDocumentSource(rawPath: string) {
  const readablePath = resolveDocumentReadablePath(rawPath);
  if (!readablePath) return false;

  try {
    await fs.access(readablePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveReadableDocumentSource(rawPath: string) {
  const readablePath = resolveDocumentReadablePath(rawPath);
  if (!readablePath) return null;

  try {
    await fs.access(readablePath);
    return readablePath;
  } catch {
    return null;
  }
}
