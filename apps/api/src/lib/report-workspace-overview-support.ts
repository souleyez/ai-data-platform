import { UNGROUPED_LIBRARY_KEY } from './document-libraries.js';
import type { ReportVisualStylePreset } from './report-center.js';

export function buildWorkspaceOverviewModuleId(key: string, index: number) {
  return `workspace-overview-${key}-${index + 1}`;
}

export function toWorkspaceOverviewNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatWorkspaceOverviewPercent(numerator: number, denominator: number) {
  if (!denominator) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function chooseWorkspaceOverviewGroupKey(preferredKey: string | undefined, libraries: Array<{ key?: string }>) {
  const keys = libraries.map((item) => String(item?.key || '').trim()).filter(Boolean);
  if (preferredKey && keys.includes(preferredKey)) return preferredKey;
  return keys.find((key) => key !== UNGROUPED_LIBRARY_KEY) || keys[0] || '';
}

export function pickTopWorkspaceOverviewLibraries(libraries: Array<{ key?: string; label?: string; documentCount?: number }>, limit = 6) {
  return [...libraries]
    .filter((item) => item?.key !== UNGROUPED_LIBRARY_KEY)
    .sort((left, right) => {
      const countDiff = toWorkspaceOverviewNumber(right?.documentCount) - toWorkspaceOverviewNumber(left?.documentCount);
      if (countDiff !== 0) return countDiff;
      return String(left?.label || left?.key || '').localeCompare(String(right?.label || right?.key || ''), 'zh-CN');
    })
    .slice(0, limit);
}

export function pickTopWorkspaceDraftScenarios(
  scenarios: Array<{ label?: string; readyRatio?: number; blocked?: number; total?: number; averageEvidenceCoverage?: number }>,
  limit = 3,
) {
  return [...scenarios]
    .filter((item) => toWorkspaceOverviewNumber(item?.total) > 0)
    .sort((left, right) => {
      const ratioDiff = toWorkspaceOverviewNumber(right?.readyRatio) - toWorkspaceOverviewNumber(left?.readyRatio);
      if (ratioDiff !== 0) return ratioDiff;
      const blockedDiff = toWorkspaceOverviewNumber(left?.blocked) - toWorkspaceOverviewNumber(right?.blocked);
      if (blockedDiff !== 0) return blockedDiff;
      return toWorkspaceOverviewNumber(right?.total) - toWorkspaceOverviewNumber(left?.total);
    })
    .slice(0, limit);
}

export function normalizeWorkspaceOverviewVisualStyle(value: unknown): ReportVisualStylePreset | undefined {
  const normalized = String(value || '').trim();
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
