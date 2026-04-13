import type {
  ReportOutputDraft,
  ReportOutputRecord,
  ReportVisualStylePreset,
} from './report-center.js';
import type { ReportPlanLayoutVariant, ReportPlanPageSpec } from './report-planner.js';
import { inferSectionDisplayMode } from './report-visual-intent.js';

function normalizeDraftSlotKey(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

type DraftPreviewDeps = {
  resolveDefaultReportVisualStyle: (
    layoutVariant?: ReportPlanLayoutVariant | string,
    title?: string,
  ) => ReportVisualStylePreset;
};

export function draftModulesToPage(
  draft: ReportOutputDraft,
  record: ReportOutputRecord,
  deps: DraftPreviewDeps,
): NonNullable<ReportOutputRecord['page']> | null {
  const enabledModules = (draft.modules || [])
    .filter((item) => item.enabled !== false && item.status !== 'disabled')
    .sort((left, right) => left.order - right.order);
  if (!enabledModules.length) return null;

  const summaryModule = enabledModules.find((item) => item.moduleType === 'hero')
    || enabledModules.find((item) => item.moduleType === 'summary')
    || null;

  const cards = enabledModules
    .filter((item) => item.moduleType === 'metric-grid')
    .flatMap((item) => item.cards || []);

  const sections = enabledModules
    .filter((item) => item.moduleType !== 'metric-grid' && item.moduleType !== 'chart')
    .map((item) => ({
      title: item.title,
      body: item.contentDraft,
      bullets: Array.isArray(item.bullets) ? item.bullets.filter(Boolean) : [],
      displayMode: inferSectionDisplayMode(item.moduleType),
    }))
    .filter((item) => item.title || item.body || item.bullets.length);

  const charts = enabledModules
    .filter((item) => item.moduleType === 'chart')
    .map((item) => ({
      title: item.chartIntent?.title || item.title,
      items: Array.isArray(item.chartIntent?.items) ? item.chartIntent.items : [],
      render: null,
    }))
    .filter((item) => item.title || item.items.length);

  const datavizSlots = charts.map((chart, index) => ({
    key: normalizeDraftSlotKey(String(chart.title || 'draft-chart')) || `draft-chart-${index + 1}`,
    title: String(chart.title || `图表 ${index + 1}`),
    purpose: '',
    preferredChartType: enabledModules.find((item) => item.moduleType === 'chart' && (item.chartIntent?.title || item.title) === chart.title)?.chartIntent?.preferredChartType || 'bar',
    placement: index === 0 ? 'hero' as const : 'section' as const,
    sectionTitle: index === 0 ? '' : (sections[Math.min(index - 1, Math.max(sections.length - 1, 0))]?.title || ''),
    evidenceFocus: '',
    minItems: 2,
    maxItems: 8,
  }));

  const pageSpec = {
    layoutVariant: draft.layoutVariant || record.page?.pageSpec?.layoutVariant || record.dynamicSource?.planPageSpec?.layoutVariant || 'insight-brief',
    heroCardLabels: cards.map((item) => String(item?.label || '').trim()).filter(Boolean),
    heroDatavizSlotKeys: datavizSlots.slice(0, 1).map((item) => item.key),
    sections: sections.map((item, index) => ({
      title: item.title || `模块 ${index + 1}`,
      purpose: enabledModules.find((module) => module.title === item.title)?.purpose || '',
      completionMode: 'knowledge-plus-model' as const,
      displayMode: (item.displayMode || 'summary') as ReportPlanPageSpec['sections'][number]['displayMode'],
      datavizSlotKeys: datavizSlots
        .filter((slot) => slot.sectionTitle && slot.sectionTitle === item.title)
        .map((slot) => slot.key),
    })),
  } satisfies ReportPlanPageSpec;

  return {
    summary: summaryModule?.contentDraft || record.page?.summary || '',
    cards,
    sections,
    charts,
    datavizSlots,
    pageSpec,
    visualStyle: draft.visualStyle || record.page?.visualStyle || deps.resolveDefaultReportVisualStyle(pageSpec.layoutVariant, record.title),
  };
}

export function withDraftPreviewPage(
  record: ReportOutputRecord,
  draft: ReportOutputDraft | null,
  deps: DraftPreviewDeps,
): ReportOutputRecord {
  if (!draft) return { ...record, draft: null };
  const nextPage = draftModulesToPage(draft, record, deps) || record.page || null;
  return {
    ...record,
    page: nextPage,
    draft,
  };
}
