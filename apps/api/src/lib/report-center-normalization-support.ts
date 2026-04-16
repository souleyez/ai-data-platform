import path from 'node:path';
import type { ReportPlanLayoutVariant } from './report-planner.js';
import type { ReportVisualStylePreset } from './report-center.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeTextField(value: unknown) {
  return String(value || '').trim();
}

export function getExtensionFromPathLike(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  const pathname = normalized.split('?')[0].split('#')[0];
  return path.extname(pathname);
}

export function normalizeReferenceName(value: string) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeVisualStylePreset(value: unknown): ReportVisualStylePreset | undefined {
  const normalized = normalizeTextField(value);
  if (
    normalized === 'signal-board'
    || normalized === 'midnight-glass'
    || normalized === 'editorial-brief'
    || normalized === 'minimal-canvas'
  ) {
    return normalized;
  }
  return undefined;
}

export function resolveDefaultReportVisualStyle(layoutVariant?: ReportPlanLayoutVariant | string, title?: string): ReportVisualStylePreset {
  const normalizedLayout = normalizeTextField(layoutVariant);
  const normalizedTitle = normalizeTextField(title).toLowerCase();
  if (normalizedLayout === 'operations-cockpit') return 'signal-board';
  if (normalizedLayout === 'research-brief' || normalizedLayout === 'risk-brief') return 'editorial-brief';
  if (normalizedLayout === 'talent-showcase') return 'minimal-canvas';
  if (/workspace|overview|dashboard|cockpit|总览|经营|运营/.test(normalizedTitle)) return 'signal-board';
  return 'midnight-glass';
}
