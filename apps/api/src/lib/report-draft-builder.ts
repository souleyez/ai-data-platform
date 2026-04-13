import { buildSpecializedDraftForRecord } from './report-draft-composers.js';
import { hydrateDraftQuality } from './report-draft-quality.js';
import type {
  ReportDraftModule,
  ReportDraftModuleType,
  ReportOutputDraft,
  ReportOutputRecord,
  ReportVisualStylePreset,
} from './report-center.js';
import type { ReportPlanDatavizSlot } from './report-planner.js';

type ReportPageChart = NonNullable<NonNullable<ReportOutputRecord['page']>['charts']>[number];

type ReportDraftBuilderDeps = {
  buildId: (prefix: string) => string;
  normalizeDraftChartType: (value: unknown) => ReportPlanDatavizSlot['preferredChartType'] | undefined;
  resolveDefaultReportVisualStyle: (layoutVariant?: string, title?: string) => ReportVisualStylePreset;
  isNarrativeReportKind: (kind?: ReportOutputRecord['kind']) => boolean;
};

function buildDraftChartIntentFromChart(
  chart: ReportPageChart | null | undefined,
  slot: ReportPlanDatavizSlot | null | undefined,
  deps: ReportDraftBuilderDeps,
) {
  if (!chart && !slot) return null;
  return {
    title: String(chart?.title || slot?.title || '').trim(),
    preferredChartType: deps.normalizeDraftChartType(chart?.render?.chartType) || slot?.preferredChartType || 'bar',
    items: Array.isArray(chart?.items) ? chart.items : [],
  };
}

function buildPageDraftModules(record: ReportOutputRecord, deps: ReportDraftBuilderDeps) {
  if (!deps.isNarrativeReportKind(record.kind) || !record.page) return [];
  const page = record.page;
  const planPageSpec = page.pageSpec || record.dynamicSource?.planPageSpec || null;
  const plannedSlots = Array.isArray(page.datavizSlots) && page.datavizSlots.length
    ? page.datavizSlots
    : (record.dynamicSource?.planDatavizSlots || []);
  const slotByKey = new Map(
    plannedSlots
      .map((slot) => [String(slot.key || '').trim(), slot] as const)
      .filter(([key]) => key),
  );
  const modules: ReportDraftModule[] = [];
  let order = 0;

  if (String(page.summary || '').trim()) {
    modules.push({
      moduleId: deps.buildId('draftmod'),
      moduleType: 'hero',
      title: '页面摘要',
      purpose: record.dynamicSource?.planObjective || 'Open with a concise page summary.',
      contentDraft: String(page.summary || '').trim(),
      evidenceRefs: [],
      chartIntent: null,
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      order: order++,
      layoutType: 'hero',
    });
  }

  if (Array.isArray(page.cards) && page.cards.length) {
    modules.push({
      moduleId: deps.buildId('draftmod'),
      moduleType: 'metric-grid',
      title: '关键指标',
      purpose: 'Highlight the most important page metrics first.',
      contentDraft: '',
      evidenceRefs: [],
      chartIntent: null,
      cards: page.cards,
      bullets: [],
      enabled: true,
      status: 'generated',
      order: order++,
      layoutType: 'metric-grid',
    });
  }

  const sectionSpecs = Array.isArray(planPageSpec?.sections) ? planPageSpec.sections : [];
  const sectionSpecByTitle = new Map(sectionSpecs.map((item) => [String(item.title || '').trim(), item] as const));
  const sectionDatavizTitles = new Set<string>();
  for (const spec of sectionSpecs) {
    for (const slotKey of spec.datavizSlotKeys || []) {
      const slot = slotByKey.get(String(slotKey || '').trim());
      const title = String(slot?.title || '').trim();
      if (title) sectionDatavizTitles.add(title);
    }
  }

  for (const section of page.sections || []) {
    const title = String(section?.title || '').trim() || '内容模块';
    const spec = sectionSpecByTitle.get(title);
    modules.push({
      moduleId: deps.buildId('draftmod'),
      moduleType: Array.isArray(section?.bullets) && section.bullets.length ? 'insight-list' : 'summary',
      title,
      purpose: String(spec?.purpose || '').trim(),
      contentDraft: String(section?.body || '').trim(),
      evidenceRefs: [],
      chartIntent: null,
      cards: [],
      bullets: Array.isArray(section?.bullets) ? section.bullets : [],
      enabled: true,
      status: 'generated',
      order: order++,
      layoutType: Array.isArray(section?.bullets) && section.bullets.length ? 'insight-list' : 'summary',
    });
  }

  for (const chart of page.charts || []) {
    const title = String(chart?.title || '').trim() || '图表模块';
    const plannedSlot = plannedSlots.find((slot) => String(slot?.title || '').trim() === title)
      || plannedSlots.find((slot) => String(slot?.key || '').trim() && (planPageSpec?.heroDatavizSlotKeys || []).includes(String(slot.key || '').trim()) && String(slot?.title || '').trim() === title)
      || null;
    const chartModuleType: ReportDraftModuleType = sectionDatavizTitles.has(title) ? 'chart' : 'chart';
    modules.push({
      moduleId: deps.buildId('draftmod'),
      moduleType: chartModuleType,
      title,
      purpose: String(plannedSlot?.purpose || '').trim(),
      contentDraft: '',
      evidenceRefs: [],
      chartIntent: buildDraftChartIntentFromChart(chart, plannedSlot, deps),
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      order: order++,
      layoutType: 'chart',
    });
  }

  return modules;
}

export function buildDraftForRecordWithDeps(record: ReportOutputRecord, deps: ReportDraftBuilderDeps): ReportOutputDraft | null {
  if (!deps.isNarrativeReportKind(record.kind) || !record.page) return null;
  const fallbackVisualStyle = record.page?.visualStyle || deps.resolveDefaultReportVisualStyle(
    record.page?.pageSpec?.layoutVariant || record.dynamicSource?.planPageSpec?.layoutVariant,
    record.title,
  );
  const specializedDraft = buildSpecializedDraftForRecord(record, fallbackVisualStyle);
  if (specializedDraft) return hydrateDraftQuality(specializedDraft);

  const modules = buildPageDraftModules(record, deps);
  if (!modules.length) return null;
  const layoutVariant = record.page?.pageSpec?.layoutVariant || record.dynamicSource?.planPageSpec?.layoutVariant;

  return hydrateDraftQuality({
    reviewStatus: 'draft_generated',
    version: 1,
    modules,
    history: [],
    lastEditedAt: record.createdAt,
    approvedAt: '',
    audience: String(record.dynamicSource?.planAudience || 'client').trim(),
    objective: String(record.dynamicSource?.planObjective || '').trim(),
    layoutVariant,
    visualStyle: fallbackVisualStyle,
    mustHaveModules: (record.dynamicSource?.planMustHaveModules || record.dynamicSource?.planSectionTitles || []).slice(0, 8),
    optionalModules: (record.dynamicSource?.planOptionalModules || []).slice(0, 8),
    evidencePriority: (record.dynamicSource?.planEvidencePriority || record.dynamicSource?.planCardLabels || []).slice(0, 8),
    audienceTone: String(record.dynamicSource?.planAudienceTone || 'client-facing').trim() || 'client-facing',
    riskNotes: (record.dynamicSource?.planRiskNotes || []).slice(0, 8),
    visualMixTargets: Array.isArray(record.dynamicSource?.planVisualMixTargets)
      ? record.dynamicSource.planVisualMixTargets.slice(0, 10).map((item) => ({
          moduleType: item.moduleType,
          minCount: Number(item.minCount || 0),
          targetCount: Number(item.targetCount || 0),
          maxCount: Number(item.maxCount || 0),
        }))
      : [],
  });
}
