import type {
  ReportPlanDatavizSlot,
  ReportPlanPageSpec,
  ReportPlanVisualMixTarget,
} from './report-planner.js';
import { inferSectionDisplayModeFromTitle } from './report-visual-intent.js';
import { isRecord, normalizeTextField } from './report-center-normalization-support.js';

export function normalizeStoredDatavizSlots(value: unknown): ReportPlanDatavizSlot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const preferredChartType: ReportPlanDatavizSlot['preferredChartType'] =
        item?.preferredChartType === 'horizontal-bar' || item?.preferredChartType === 'line'
          ? item.preferredChartType
          : 'bar';
      const placement: ReportPlanDatavizSlot['placement'] =
        item?.placement === 'section' ? 'section' : 'hero';
      return {
        key: normalizeTextField(item?.key),
        title: normalizeTextField(item?.title),
        purpose: normalizeTextField(item?.purpose),
        preferredChartType,
        placement,
        sectionTitle: normalizeTextField(item?.sectionTitle),
        evidenceFocus: normalizeTextField(item?.evidenceFocus),
        minItems: Number.isFinite(Number(item?.minItems)) ? Number(item?.minItems) : 2,
        maxItems: Number.isFinite(Number(item?.maxItems)) ? Number(item?.maxItems) : 6,
      } satisfies ReportPlanDatavizSlot;
    })
    .filter((item) => item.title);
}

export function normalizeStoredPageSpec(value: unknown): ReportPlanPageSpec | undefined {
  if (!isRecord(value) || !Array.isArray(value.sections)) return undefined;

  const inferStoredDisplayMode = (
    title: string,
    rawDisplayMode: unknown,
  ): ReportPlanPageSpec['sections'][number]['displayMode'] => {
    const explicit = normalizeTextField(rawDisplayMode);
    if (
      explicit === 'summary'
      || explicit === 'insight-list'
      || explicit === 'timeline'
      || explicit === 'comparison'
      || explicit === 'cta'
      || explicit === 'appendix'
    ) {
      return explicit;
    }
    return inferSectionDisplayModeFromTitle(
      title,
      /建议|行动|应答|下一步/i.test(title) ? 'cta' : 'summary',
    );
  };

  return {
    layoutVariant: normalizeTextField(value.layoutVariant) as ReportPlanPageSpec['layoutVariant'] || 'insight-brief',
    heroCardLabels: Array.isArray(value.heroCardLabels)
      ? value.heroCardLabels.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    heroDatavizSlotKeys: Array.isArray(value.heroDatavizSlotKeys)
      ? value.heroDatavizSlotKeys.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    sections: value.sections
      .map((item: Record<string, unknown>) => {
        const title = normalizeTextField(item?.title);
        const completionMode: ReportPlanPageSpec['sections'][number]['completionMode'] =
          item?.completionMode === 'knowledge-first' ? 'knowledge-first' : 'knowledge-plus-model';
        return {
          title,
          purpose: normalizeTextField(item?.purpose),
          completionMode,
          displayMode: inferStoredDisplayMode(title, item?.displayMode),
          datavizSlotKeys: Array.isArray(item?.datavizSlotKeys)
            ? item.datavizSlotKeys.map((entry) => normalizeTextField(entry)).filter(Boolean)
            : [],
        };
      })
      .filter((item) => item.title),
  };
}

export function normalizeStoredVisualMixTargets(value: unknown): ReportPlanVisualMixTarget[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      moduleType: normalizeTextField(item?.moduleType) as ReportPlanVisualMixTarget['moduleType'],
      minCount: Number(item?.minCount || 0),
      targetCount: Number(item?.targetCount || 0),
      maxCount: Number(item?.maxCount || 0),
    }))
    .filter((item) => item.moduleType && Number.isFinite(item.minCount) && Number.isFinite(item.targetCount) && Number.isFinite(item.maxCount));
}
