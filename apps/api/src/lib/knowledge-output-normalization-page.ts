import { inferSectionDisplayModeFromTitle as inferVisualSectionDisplayModeFromTitle } from './report-visual-intent.js';
import type { ReportPlanDatavizSlot } from './report-planner.js';
import {
  isObject,
  normalizeDatavizSlotKey,
  normalizeReportPlanPageSpec,
  normalizeText,
  sanitizeStringArray,
  sanitizeText,
} from './knowledge-output-normalization-support.js';

export function normalizeCards(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((item) => ({
      label: sanitizeText(item.label),
      value: sanitizeText(item.value),
      note: sanitizeText(item.note),
    }))
    .filter((item) => item.label || item.value || item.note);
}

export function normalizeSectionDisplayMode(value: unknown) {
  const normalized = sanitizeText(value);
  return ['summary', 'insight-list', 'timeline', 'comparison', 'cta', 'appendix'].includes(normalized)
    ? normalized
    : '';
}

export function inferSectionDisplayModeFromTitle(title: string, fallback?: string) {
  return (
    normalizeSectionDisplayMode(fallback)
    || inferVisualSectionDisplayModeFromTitle(
      title,
      /建议|行动|应答|下一步/i.test(title) ? 'cta' : 'summary',
    )
  );
}

export function normalizeSections(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((item) => ({
      title: sanitizeText(item.title),
      body: sanitizeText(item.body || item.content || item.summary),
      bullets: sanitizeStringArray(item.bullets || item.points || item.items),
      displayMode: normalizeSectionDisplayMode(item.displayMode),
    }))
    .filter((item) => item.title || item.body || item.bullets.length);
}

export function normalizeChartRender(value: unknown) {
  if (!isObject(value)) return null;
  const renderer = sanitizeText(value.renderer);
  const chartType = sanitizeText(value.chartType);
  const svg = sanitizeText(value.svg);
  const alt = sanitizeText(value.alt);
  const generatedAt = sanitizeText(value.generatedAt);
  return renderer || chartType || svg || alt || generatedAt
    ? { renderer, chartType, svg, alt, generatedAt }
    : null;
}

export function normalizeCharts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((item) => ({
      title: sanitizeText(item.title),
      items: Array.isArray(item.items)
        ? item.items
            .filter(isObject)
            .map((entry) => ({
              label: sanitizeText(entry.label),
              value: Number(entry.value || 0),
            }))
            .filter((entry) => entry.label)
        : [],
      render: normalizeChartRender(item.render),
    }))
    .filter((item) => item.title || item.items.length || item.render);
}

type KnowledgeOutputChart = {
  title?: string;
  items?: Array<{ label?: string; value?: number }>;
  render?: {
    renderer?: string;
    chartType?: string;
    svg?: string;
    alt?: string;
    generatedAt?: string;
  } | null;
};

export function applyPlannedDatavizSlots(
  charts: KnowledgeOutputChart[],
  slots: ReportPlanDatavizSlot[] = [],
) {
  const normalizedSlots = Array.isArray(slots) ? slots.filter((item) => item?.title) : [];
  if (!normalizedSlots.length) return charts;

  const normalizedCharts = Array.isArray(charts) ? charts.filter(Boolean) : [];
  const usedChartIndexes = new Set<number>();
  const plannedCharts = normalizedSlots.map((slot, slotIndex) => {
    const explicitMatchIndex = normalizedCharts.findIndex((chart, chartIndex) => {
      if (usedChartIndexes.has(chartIndex)) return false;
      return normalizeDatavizSlotKey(String(chart.title || '')) === normalizeDatavizSlotKey(slot.title);
    });
    const fallbackMatchIndex = explicitMatchIndex >= 0
      ? explicitMatchIndex
      : normalizedCharts.findIndex((_, chartIndex) => !usedChartIndexes.has(chartIndex) && chartIndex === slotIndex);
    const resolvedIndex = fallbackMatchIndex >= 0
      ? fallbackMatchIndex
      : normalizedCharts.findIndex((_, chartIndex) => !usedChartIndexes.has(chartIndex));
    const sourceChart = resolvedIndex >= 0 ? normalizedCharts[resolvedIndex] : null;
    if (resolvedIndex >= 0) usedChartIndexes.add(resolvedIndex);
    return {
      ...(sourceChart || {}),
      title: sanitizeText(sourceChart?.title) || slot.title,
      items: Array.isArray(sourceChart?.items) ? sourceChart.items : [],
      render: sourceChart?.render || null,
    };
  });

  const remainingCharts = normalizedCharts.filter((_, chartIndex) => !usedChartIndexes.has(chartIndex));
  return [...plannedCharts, ...remainingCharts];
}

export function alignSectionsToEnvelope(
  sections: Array<{ title?: string; body?: string; bullets?: string[]; displayMode?: string }>,
  envelopeSections: string[],
  summary: string,
) {
  if (!envelopeSections.length) return sections;

  const unused = [...sections];
  return envelopeSections.map((title, index) => {
    const normalizedTitle = normalizeText(title);
    const exactIndex = unused.findIndex((item) => normalizeText(item.title || '') === normalizedTitle);
    const fuzzyIndex = exactIndex >= 0
      ? exactIndex
      : unused.findIndex((item) => {
          const itemTitle = normalizeText(item.title || '');
          return itemTitle && (itemTitle.includes(normalizedTitle) || normalizedTitle.includes(itemTitle));
        });
    const matched = fuzzyIndex >= 0 ? unused.splice(fuzzyIndex, 1)[0] : undefined;
    return {
      title,
      body: matched?.body || (index === 0 ? summary : ''),
      bullets: matched?.bullets || [],
      displayMode: normalizeSectionDisplayMode(matched?.displayMode),
    };
  });
}

export function applyPageSpecSectionDisplayModes(
  sections: Array<{ title?: string; body?: string; bullets?: string[]; displayMode?: string }>,
  pageSpec: ReturnType<typeof normalizeReportPlanPageSpec>,
) {
  if (!pageSpec?.sections?.length) return sections;
  return sections.map((section, index) => {
    const normalizedTitle = normalizeText(section.title || '');
    const matchedSection =
      pageSpec.sections.find((item) => normalizeText(item.title) === normalizedTitle)
      || pageSpec.sections[index];
    return {
      ...section,
      displayMode: inferSectionDisplayModeFromTitle(String(section.title || ''), section.displayMode || matchedSection?.displayMode),
    };
  });
}
