import type { ReportDynamicSource } from './report-center.js';
import { normalizeStoredDatavizSlots, normalizeStoredPageSpec, normalizeStoredVisualMixTargets } from './report-center-normalization-plan.js';
import { normalizeTextField } from './report-center-normalization-support.js';

export function normalizeDynamicSource(
  dynamicSource: Partial<ReportDynamicSource> | null | undefined,
  fallback: {
    request?: string;
    kind?: ReportDynamicSource['outputType'];
    templateKey?: string;
    templateLabel?: string;
    libraries?: Array<{ key?: string; label?: string }>;
  },
): ReportDynamicSource | null {
  const enabled = Boolean(dynamicSource?.enabled) || fallback.kind === 'page';
  const outputType = (dynamicSource?.outputType || fallback.kind || 'page') as ReportDynamicSource['outputType'];
  const conceptMode = Boolean(dynamicSource?.conceptMode)
    || (outputType === 'page' && !normalizeTextField(dynamicSource?.templateKey));
  const libraries = Array.isArray(dynamicSource?.libraries) && dynamicSource?.libraries.length
    ? dynamicSource.libraries
    : Array.isArray(fallback.libraries)
      ? fallback.libraries
      : [];

  if (!enabled || !libraries.length) return null;

  return {
    enabled: true,
    request: normalizeTextField(dynamicSource?.request || fallback.request),
    outputType,
    conceptMode,
    templateKey: conceptMode ? '' : normalizeTextField(dynamicSource?.templateKey || fallback.templateKey),
    templateLabel: conceptMode ? '' : normalizeTextField(dynamicSource?.templateLabel || fallback.templateLabel),
    timeRange: normalizeTextField(dynamicSource?.timeRange),
    contentFocus: normalizeTextField(dynamicSource?.contentFocus),
    libraries: libraries
      .map((item) => ({
        key: normalizeTextField(item?.key),
        label: normalizeTextField(item?.label),
      }))
      .filter((item) => item.key || item.label),
    updatedAt: normalizeTextField(dynamicSource?.updatedAt) || new Date().toISOString(),
    lastRenderedAt: normalizeTextField(dynamicSource?.lastRenderedAt),
    sourceFingerprint: normalizeTextField(dynamicSource?.sourceFingerprint),
    sourceDocumentCount: Number(dynamicSource?.sourceDocumentCount || 0),
    sourceUpdatedAt: normalizeTextField(dynamicSource?.sourceUpdatedAt),
    planAudience: normalizeTextField(dynamicSource?.planAudience),
    planObjective: normalizeTextField(dynamicSource?.planObjective),
    planTemplateMode: normalizeTextField(dynamicSource?.planTemplateMode),
    planSectionTitles: Array.isArray(dynamicSource?.planSectionTitles)
      ? dynamicSource.planSectionTitles.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planCardLabels: Array.isArray(dynamicSource?.planCardLabels)
      ? dynamicSource.planCardLabels.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planChartTitles: Array.isArray(dynamicSource?.planChartTitles)
      ? dynamicSource.planChartTitles.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planMustHaveModules: Array.isArray(dynamicSource?.planMustHaveModules)
      ? dynamicSource.planMustHaveModules.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planOptionalModules: Array.isArray(dynamicSource?.planOptionalModules)
      ? dynamicSource.planOptionalModules.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planEvidencePriority: Array.isArray(dynamicSource?.planEvidencePriority)
      ? dynamicSource.planEvidencePriority.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planAudienceTone: normalizeTextField(dynamicSource?.planAudienceTone),
    planRiskNotes: Array.isArray(dynamicSource?.planRiskNotes)
      ? dynamicSource.planRiskNotes.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planVisualMixTargets: normalizeStoredVisualMixTargets(dynamicSource?.planVisualMixTargets),
    planDatavizSlots: normalizeStoredDatavizSlots(dynamicSource?.planDatavizSlots),
    planPageSpec: normalizeStoredPageSpec(dynamicSource?.planPageSpec),
    planUpdatedAt: normalizeTextField(dynamicSource?.planUpdatedAt),
  };
}
