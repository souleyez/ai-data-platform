import type {
  ReportDraftModule,
  ReportOutputRecord,
} from './report-center.js';
import type { ReportPlanDatavizSlot } from './report-planner.js';
import { buildSupplementalVisualModule } from './report-visual-intent.js';
import { normalizeText } from './report-draft-copy-polish.js';
import {
  normalizeSlotKey,
} from './report-draft-policy.js';
import { classifySectionType } from './report-draft-scenarios.js';
import { buildChartIntent, buildId } from './report-draft-module-builders-support.js';

export function buildOperationsCockpitModules(record: ReportOutputRecord): ReportDraftModule[] {
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
  const slotByTitle = new Map(
    slots
      .map((item) => [normalizeText(item.title), item] as const)
      .filter(([title]) => title),
  );
  const chartByTitle = new Map(
    (page.charts || [])
      .map((item) => [normalizeText(item?.title), item] as const)
      .filter(([title]) => title),
  );

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
      purpose: normalizeText(record.dynamicSource?.planObjective) || 'Open with the current operating picture first.',
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
      purpose: 'Anchor the page with the most important operating metrics first.',
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

  const consumedCharts = new Set<string>();
  for (const section of page.sections || []) {
    const title = normalizeText(section?.title) || '内容模块';
    const bullets = Array.isArray(section?.bullets) ? section.bullets.filter(Boolean) : [];
    const sectionBody = normalizeText(section?.body);
    const sectionType = classifySectionType(title, sectionBody, bullets, bullets.length > 0);
    pushModule({
      moduleType: sectionType,
      title,
      purpose: normalizeText(sectionSpecByTitle.get(title)?.purpose),
      contentDraft: sectionBody,
      evidenceRefs: [`section:${title}`],
      chartIntent: null,
      cards: [],
      bullets,
      enabled: true,
      status: 'generated',
      layoutType: sectionType,
    });

    const boundCharts = (sectionSpecByTitle.get(title)?.datavizSlotKeys || [])
      .map((slotKey) => {
        const normalizedSlotKey = normalizeSlotKey(slotKey);
        const slot = slots.find((entry) => normalizeSlotKey(entry?.key || '') === normalizedSlotKey) || null;
        if (!slot) return null;
        const chart = chartByTitle.get(normalizeText(slot.title)) || null;
        return chart || slot ? { chart, slot } : null;
      })
      .filter(Boolean) as Array<{ chart: NonNullable<NonNullable<ReportOutputRecord['page']>['charts']>[number] | null; slot: ReportPlanDatavizSlot | null }>;

    for (const entry of boundCharts) {
      const chartTitle = normalizeText(entry.chart?.title || entry.slot?.title);
      if (!chartTitle || consumedCharts.has(chartTitle)) continue;
      consumedCharts.add(chartTitle);
      pushModule({
        moduleType: 'chart',
        title: chartTitle,
        purpose: normalizeText(entry.slot?.purpose),
        contentDraft: '',
        evidenceRefs: [`chart:${chartTitle}`],
        chartIntent: buildChartIntent(entry.chart, entry.slot),
        cards: [],
        bullets: [],
        enabled: true,
        status: 'generated',
        layoutType: 'chart',
      });
    }

    if (!boundCharts.length) {
      const supplementalModule = buildSupplementalVisualModule({
        title,
        body: sectionBody,
        bullets,
        fallbackModuleType: sectionType,
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
    const slot = slotByTitle.get(chartTitle) || null;
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
