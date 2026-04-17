import type {
  ReportDraftHistoryAction,
  ReportDraftHistoryEntry,
  ReportDraftHistorySnapshot,
  ReportOutputDraft,
} from './report-center.js';
import type { ReportPlanLayoutVariant, ReportPlanVisualMixTarget } from './report-planner.js';
import { normalizeReportViewportTarget } from './report-viewport-target.js';

function isHistoryRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function buildDraftStructureSummary(draft: ReportOutputDraft) {
  return (draft.modules || [])
    .sort((left, right) => left.order - right.order)
    .map((module) => ({
      moduleId: module.moduleId,
      moduleType: module.moduleType,
      title: module.title,
      enabled: module.enabled,
      order: module.order,
      layoutType: module.layoutType || module.moduleType,
    }));
}

export function normalizeStoredDraftHistoryAction(
  value: unknown,
  normalizeTextField: (value: unknown) => string,
): ReportDraftHistoryAction {
  const normalized = normalizeTextField(value);
  if (
    normalized === 'saved'
    || normalized === 'module-revised'
    || normalized === 'structure-revised'
    || normalized === 'copy-revised'
    || normalized === 'finalized'
    || normalized === 'restored'
  ) {
    return normalized;
  }
  return 'saved';
}

export function normalizeDraftVisualMixTargets(
  value: unknown,
  normalizeTextField: (value: unknown) => string,
): ReportPlanVisualMixTarget[] {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          moduleType: normalizeTextField(isHistoryRecord(item) ? item.moduleType : ''),
          minCount: Number(isHistoryRecord(item) ? item.minCount : 0),
          targetCount: Number(isHistoryRecord(item) ? item.targetCount : 0),
          maxCount: Number(isHistoryRecord(item) ? item.maxCount : 0),
        }))
        .filter((item) => item.moduleType && Number.isFinite(item.minCount) && Number.isFinite(item.targetCount) && Number.isFinite(item.maxCount))
        .map((item) => ({
          moduleType: item.moduleType as ReportPlanVisualMixTarget['moduleType'],
          minCount: item.minCount,
          targetCount: item.targetCount,
          maxCount: item.maxCount,
        }))
    : [];
}

type DraftSnapshotDeps = {
  normalizeTextField: (value: unknown) => string;
  normalizeVisualStylePreset: (value: unknown) => ReportOutputDraft['visualStyle'] | undefined;
  normalizeStringList: (value: unknown) => string[];
};

export function buildDraftHistorySnapshot(
  draft: ReportOutputDraft,
  deps: DraftSnapshotDeps,
): ReportDraftHistorySnapshot {
  return {
    reviewStatus: draft.reviewStatus === 'approved' ? 'approved' : 'draft_reviewing',
    version: Math.max(1, Number(draft.version || 0) || 1),
    modules: Array.isArray(draft.modules)
      ? draft.modules.map((module) => ({
          ...module,
          evidenceRefs: Array.isArray(module.evidenceRefs) ? [...module.evidenceRefs] : [],
          cards: Array.isArray(module.cards) ? module.cards.map((card) => ({ ...card })) : [],
          bullets: Array.isArray(module.bullets) ? [...module.bullets] : [],
          chartIntent: module.chartIntent
            ? {
                ...module.chartIntent,
                items: Array.isArray(module.chartIntent.items)
                  ? module.chartIntent.items.map((item) => ({ ...item }))
                  : [],
              }
            : null,
        }))
      : [],
    lastEditedAt: deps.normalizeTextField(draft.lastEditedAt),
    approvedAt: deps.normalizeTextField(draft.approvedAt),
    audience: deps.normalizeTextField(draft.audience),
    objective: deps.normalizeTextField(draft.objective),
    layoutVariant: deps.normalizeTextField(draft.layoutVariant) as ReportPlanLayoutVariant,
    visualStyle: deps.normalizeVisualStylePreset(draft.visualStyle),
    viewportTarget: normalizeReportViewportTarget(draft.viewportTarget),
    mustHaveModules: deps.normalizeStringList(draft.mustHaveModules),
    optionalModules: deps.normalizeStringList(draft.optionalModules),
    evidencePriority: deps.normalizeStringList(draft.evidencePriority),
    audienceTone: deps.normalizeTextField(draft.audienceTone),
    riskNotes: deps.normalizeStringList(draft.riskNotes),
    visualMixTargets: normalizeDraftVisualMixTargets(draft.visualMixTargets, deps.normalizeTextField),
  };
}

export function normalizeStoredDraftHistorySnapshot(
  value: unknown,
  normalizeStoredDraft: (value: unknown) => ReportOutputDraft | null,
  deps: DraftSnapshotDeps,
): ReportDraftHistorySnapshot | null {
  if (!isHistoryRecord(value)) return null;
  const normalizedDraft = normalizeStoredDraft({
    ...value,
    history: [],
  });
  if (!normalizedDraft) return null;
  return buildDraftHistorySnapshot(normalizedDraft, deps);
}

type DraftHistoryEntryDeps = DraftSnapshotDeps & {
  buildId: (prefix: string) => string;
  normalizeStoredDraft: (value: unknown) => ReportOutputDraft | null;
};

export function normalizeStoredDraftHistoryEntry(
  value: unknown,
  deps: DraftHistoryEntryDeps,
): ReportDraftHistoryEntry | null {
  if (!isHistoryRecord(value)) return null;
  const label = deps.normalizeTextField(value.label);
  const createdAt = deps.normalizeTextField(value.createdAt);
  if (!label || !createdAt) return null;
  return {
    id: deps.normalizeTextField(value.id) || deps.buildId('drafthist'),
    action: normalizeStoredDraftHistoryAction(value.action, deps.normalizeTextField),
    label,
    detail: deps.normalizeTextField(value.detail),
    createdAt,
    snapshot: normalizeStoredDraftHistorySnapshot(value.snapshot, deps.normalizeStoredDraft, deps),
  };
}

type AppendDraftHistoryDeps = DraftSnapshotDeps & {
  buildId: (prefix: string) => string;
};

export function appendDraftHistory(
  draft: ReportOutputDraft,
  entry: { action: ReportDraftHistoryAction; label: string; detail?: string },
  deps: AppendDraftHistoryDeps,
  now = new Date().toISOString(),
) {
  const nextEntry: ReportDraftHistoryEntry = {
    id: deps.buildId('drafthist'),
    action: entry.action,
    label: String(entry.label || '').trim() || '更新草稿',
    detail: deps.normalizeTextField(entry.detail),
    createdAt: now,
    snapshot: buildDraftHistorySnapshot(draft, deps),
  };
  const history = Array.isArray(draft.history) ? draft.history : [];
  return [...history, nextEntry].slice(-20);
}
