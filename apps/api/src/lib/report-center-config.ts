import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR, STORAGE_FILES_DIR } from './paths.js';

export const REPORT_CONFIG_DIR = STORAGE_CONFIG_DIR;
export const REPORT_REFERENCE_DIR = path.join(STORAGE_FILES_DIR, 'report-references');
export const REPORT_LIBRARY_EXPORT_DIR = path.join(STORAGE_FILES_DIR, 'generated-report-library');
export const REPORT_STATE_FILE = path.join(REPORT_CONFIG_DIR, 'report-center.json');
export const REPORT_STATE_VERSION = 1;

export function buildReportCenterId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function ensureReportCenterDirs() {
  await fs.mkdir(REPORT_CONFIG_DIR, { recursive: true });
  await fs.mkdir(REPORT_REFERENCE_DIR, { recursive: true });
}

export function isReportCenterRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeReportCenterTextField(value: unknown) {
  return String(value || '').trim();
}

export function normalizeReportCenterStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => normalizeReportCenterTextField(item)).filter(Boolean)
    : [];
}
