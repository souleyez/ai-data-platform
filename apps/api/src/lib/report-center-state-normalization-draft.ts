import { normalizeDraftVisualMixTargets, normalizeStoredDraftHistoryEntry } from './report-draft-history.js';
import { hydrateDraftQuality } from './report-draft-quality.js';
import type {
  ReportOutputDraft,
  ReportDraftModule,
  ReportDraftModuleStatus,
  ReportDraftModuleType,
  ReportDraftReviewStatus,
} from './report-center.js';
import type { ReportPlanLayoutVariant } from './report-planner.js';
import { normalizeStoredPageCard, normalizeStoredPageChart } from './report-center-state-normalization-page.js';
import type { StateStoreDeps } from './report-center-state-normalization.js';
import { normalizeReportViewportTarget } from './report-viewport-target.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStoredDraftModuleType(value: unknown, deps: StateStoreDeps): ReportDraftModuleType {
  const normalized = deps.normalizeTextField(value);
  if (
    normalized === 'hero'
    || normalized === 'summary'
    || normalized === 'metric-grid'
    || normalized === 'insight-list'
    || normalized === 'table'
    || normalized === 'chart'
    || normalized === 'timeline'
    || normalized === 'comparison'
    || normalized === 'cta'
    || normalized === 'appendix'
  ) {
    return normalized;
  }
  return 'summary';
}

function normalizeStoredDraftModuleStatus(value: unknown, deps: StateStoreDeps): ReportDraftModuleStatus {
  const normalized = deps.normalizeTextField(value);
  if (normalized === 'edited' || normalized === 'disabled') return normalized;
  return 'generated';
}

function normalizeStoredDraftReviewStatus(value: unknown, deps: StateStoreDeps): ReportDraftReviewStatus {
  const normalized = deps.normalizeTextField(value);
  if (normalized === 'draft_reviewing' || normalized === 'approved') return normalized;
  return 'draft_generated';
}

export function normalizeStoredDraftModule(value: unknown, deps: StateStoreDeps, fallbackOrder = 0): ReportDraftModule | null {
  if (!isRecord(value)) return null;

  const moduleId = deps.normalizeTextField(value.moduleId) || deps.buildId('draftmod');
  const moduleType = normalizeStoredDraftModuleType(value.moduleType, deps);
  const title = deps.normalizeTextField(value.title) || '未命名模块';
  const purpose = deps.normalizeTextField(value.purpose);
  const contentDraft = deps.normalizeTextField(value.contentDraft);
  const evidenceRefs = deps.normalizeStringList(value.evidenceRefs);
  const bullets = deps.normalizeStringList(value.bullets);
  const cards = Array.isArray(value.cards)
    ? value.cards.map((item) => normalizeStoredPageCard(item, deps)).filter(Boolean) as Array<{ label?: string; value?: string; note?: string }>
    : [];
  const chartIntent = isRecord(value.chartIntent)
    ? {
        title: deps.normalizeTextField(value.chartIntent.title),
        preferredChartType: deps.normalizeDraftChartType(value.chartIntent.preferredChartType),
        items: Array.isArray(value.chartIntent.items)
          ? value.chartIntent.items
              .map((item) => normalizeStoredPageChart({ items: [item] }, deps)?.items?.[0] || null)
              .filter(Boolean) as Array<{ label?: string; value?: number }>
          : [],
      }
    : null;

  return {
    moduleId,
    moduleType,
    title,
    purpose,
    contentDraft,
    evidenceRefs,
    chartIntent,
    cards,
    bullets,
    enabled: value.enabled !== false && normalizeStoredDraftModuleStatus(value.status, deps) !== 'disabled',
    status: normalizeStoredDraftModuleStatus(value.status, deps),
    order: Number.isFinite(Number(value.order)) ? Number(value.order) : fallbackOrder,
    layoutType: deps.normalizeTextField(value.layoutType) || moduleType,
  };
}

export function normalizeStoredDraft(value: unknown, deps: StateStoreDeps): ReportOutputDraft | null {
  if (!isRecord(value)) return null;

  const modules = Array.isArray(value.modules)
    ? value.modules.map((item, index) => normalizeStoredDraftModule(item, deps, index)).filter(Boolean) as ReportDraftModule[]
    : [];
  if (!modules.length) return null;

  const normalizeStoredDraftValue = (input: unknown) => normalizeStoredDraft(input, deps);
  return hydrateDraftQuality({
    reviewStatus: normalizeStoredDraftReviewStatus(value.reviewStatus, deps),
    version: Math.max(1, Number(value.version || 1) || 1),
    modules: modules.sort((left, right) => left.order - right.order),
    history: Array.isArray(value.history)
      ? value.history
          .map((item) => normalizeStoredDraftHistoryEntry(item, {
            buildId: deps.buildId,
            normalizeTextField: deps.normalizeTextField,
            normalizeVisualStylePreset: deps.normalizeVisualStylePreset,
            normalizeStringList: deps.normalizeStringList,
            normalizeStoredDraft: normalizeStoredDraftValue,
          }))
          .filter(Boolean) as NonNullable<ReportOutputDraft['history']>
      : [],
    lastEditedAt: deps.normalizeTextField(value.lastEditedAt),
    approvedAt: deps.normalizeTextField(value.approvedAt),
    audience: deps.normalizeTextField(value.audience),
    objective: deps.normalizeTextField(value.objective),
    layoutVariant: deps.normalizeTextField(value.layoutVariant) as ReportPlanLayoutVariant,
    visualStyle: deps.normalizeVisualStylePreset(value.visualStyle),
    viewportTarget: normalizeReportViewportTarget(value.viewportTarget),
    mustHaveModules: deps.normalizeStringList(value.mustHaveModules),
    optionalModules: deps.normalizeStringList(value.optionalModules),
    evidencePriority: deps.normalizeStringList(value.evidencePriority),
    audienceTone: deps.normalizeTextField(value.audienceTone),
    riskNotes: deps.normalizeStringList(value.riskNotes),
    visualMixTargets: normalizeDraftVisualMixTargets(value.visualMixTargets, deps.normalizeTextField),
  });
}
