import type {
  ReportDraftModule,
  ReportDraftModuleType,
  ReportOutputRecord,
} from './report-center.js';
import type { ReportPlanDatavizSlot } from './report-planner.js';
import { buildSupplementalVisualModule } from './report-visual-intent.js';
import { normalizeText } from './report-draft-copy-polish.js';
import {
  normalizeDraftChartType,
  normalizeSlotKey,
} from './report-draft-policy.js';

export function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildPlaceholderModule(
  moduleType: ReportDraftModuleType,
  title: string,
  summary: string,
  order: number,
): ReportDraftModule {
  const normalizedSummary = normalizeText(summary);
  if (moduleType === 'chart') {
    return {
      moduleId: buildId('draftmod'),
      moduleType,
      title,
      purpose: 'Reserve a visual slot so the final page keeps a stable chart position.',
      contentDraft: '',
      evidenceRefs: ['composer:placeholder'],
      chartIntent: {
        title,
        preferredChartType: 'bar',
        items: [],
      },
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      order,
      layoutType: 'chart',
    };
  }

  if (moduleType === 'metric-grid') {
    return {
      moduleId: buildId('draftmod'),
      moduleType,
      title,
      purpose: 'Reserve a compact metric cluster for final review.',
      contentDraft: `${normalizeText(title) || '当前指标模块'} 当前仍待补充确认后的关键数据，终稿前替换为可直接展示的指标卡。`,
      evidenceRefs: ['composer:placeholder'],
      chartIntent: null,
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      order,
      layoutType: 'metric-grid',
    };
  }

  return {
    moduleId: buildId('draftmod'),
    moduleType,
    title,
    purpose: 'Reserve a scenario-critical module so the draft structure stays editable before finalization.',
    contentDraft: normalizedSummary,
    evidenceRefs: ['composer:placeholder'],
    chartIntent: null,
    cards: [],
    bullets: normalizedSummary ? [normalizedSummary] : [],
    enabled: true,
    status: 'generated',
    order,
    layoutType: moduleType,
  };
}

export function buildChartIntent(
  chart: NonNullable<NonNullable<ReportOutputRecord['page']>['charts']>[number] | null | undefined,
  slot: ReportPlanDatavizSlot | null | undefined,
) {
  if (!chart && !slot) return null;
  return {
    title: normalizeText(chart?.title || slot?.title || ''),
    preferredChartType: normalizeDraftChartType(chart?.render?.chartType) || slot?.preferredChartType || 'bar',
    items: Array.isArray(chart?.items) ? chart.items : [],
  };
}

export function buildSequentialSectionModules(
  record: ReportOutputRecord,
  classifyModuleType: (title: string, body: string, bullets: string[], hasBullets: boolean) => ReportDraftModuleType,
) {
  if (!record.page) return [];
  const page = record.page;
  const modules: ReportDraftModule[] = [];
  const sectionSpecs = Array.isArray(page.pageSpec?.sections) ? page.pageSpec.sections : [];
  const sectionSpecByTitle = new Map(
    sectionSpecs
      .map((item) => [normalizeText(item.title), item] as const)
      .filter(([title]) => title),
  );
  const slots = Array.isArray(page.datavizSlots) ? page.datavizSlots : [];
  const slotByKey = new Map(
    slots
      .map((item) => [normalizeSlotKey(item?.key || ''), item] as const)
      .filter(([key]) => key),
  );
  const chartByTitle = new Map(
    (page.charts || [])
      .map((item) => [normalizeText(item?.title), item] as const)
      .filter(([title]) => title),
  );
  const consumedCharts = new Set<string>();
  let order = 0;

  const pushModule = (module: Omit<ReportDraftModule, 'moduleId' | 'order'>) => {
    modules.push({
      moduleId: buildId('draftmod'),
      order: order++,
      ...module,
    });
  };

  if (normalizeText(page.summary)) {
    pushModule({
      moduleType: 'hero',
      title: '页面摘要',
      purpose: normalizeText(record.dynamicSource?.planObjective) || 'Open with the strongest summary first.',
      contentDraft: normalizeText(page.summary),
      evidenceRefs: ['page.summary'],
      chartIntent: null,
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      layoutType: 'hero',
    });
  }

  if (Array.isArray(page.cards) && page.cards.length) {
    pushModule({
      moduleType: 'metric-grid',
      title: '关键指标',
      purpose: 'Anchor the page with a small set of high-signal metrics.',
      contentDraft: '',
      evidenceRefs: ['page.cards'],
      chartIntent: null,
      cards: page.cards,
      bullets: [],
      enabled: true,
      status: 'generated',
      layoutType: 'metric-grid',
    });
  }

  for (const section of page.sections || []) {
    const title = normalizeText(section?.title) || '内容模块';
    const body = normalizeText(section?.body);
    const bullets = Array.isArray(section?.bullets) ? section.bullets.filter(Boolean) : [];
    const moduleType = classifyModuleType(title, body, bullets, bullets.length > 0);
    pushModule({
      moduleType,
      title,
      purpose: normalizeText(sectionSpecByTitle.get(title)?.purpose),
      contentDraft: body,
      evidenceRefs: [`section:${title}`],
      chartIntent: null,
      cards: [],
      bullets,
      enabled: true,
      status: 'generated',
      layoutType: moduleType,
    });

    const sectionSlots = (sectionSpecByTitle.get(title)?.datavizSlotKeys || [])
      .map((slotKey) => slotByKey.get(normalizeSlotKey(slotKey)) || null)
      .filter(Boolean) as ReportPlanDatavizSlot[];

    for (const slot of sectionSlots) {
      const chartTitle = normalizeText(slot.title);
      if (!chartTitle || consumedCharts.has(chartTitle)) continue;
      consumedCharts.add(chartTitle);
      pushModule({
        moduleType: 'chart',
        title: chartTitle,
        purpose: normalizeText(slot.purpose),
        contentDraft: '',
        evidenceRefs: [`chart:${chartTitle}`],
        chartIntent: buildChartIntent(chartByTitle.get(chartTitle) || null, slot),
        cards: [],
        bullets: [],
        enabled: true,
        status: 'generated',
        layoutType: 'chart',
      });
    }

    if (!sectionSlots.length) {
      const supplementalModule = buildSupplementalVisualModule({
        title,
        body,
        bullets,
        fallbackModuleType: moduleType,
      });
      if (supplementalModule) {
        pushModule({
          ...supplementalModule,
          evidenceRefs: [`section:${title}`, `supplemental:${supplementalModule.moduleType}`],
          contentDraft: '',
          bullets: [],
          enabled: true,
          status: 'generated',
        });
      }
    }
  }

  for (const chart of page.charts || []) {
    const chartTitle = normalizeText(chart?.title) || '图表模块';
    if (consumedCharts.has(chartTitle)) continue;
    consumedCharts.add(chartTitle);
    const slot = slots.find((item) => normalizeText(item?.title) === chartTitle) || null;
    pushModule({
      moduleType: 'chart',
      title: chartTitle,
      purpose: normalizeText(slot?.purpose),
      contentDraft: '',
      evidenceRefs: [`chart:${chartTitle}`],
      chartIntent: buildChartIntent(chart, slot),
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      layoutType: 'chart',
    });
  }

  return modules;
}
