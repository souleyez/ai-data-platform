import type { ReportPlanDatavizSlot } from './report-planner.js';
import type { ChartItem, DatavizPlanningInput, PageChart } from './report-dataviz-types.js';

const MAX_RENDER_ITEMS = 10;

export function normalizeLabel(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .trim();
}

function normalizeSlotKey(value: string) {
  return normalizeLabel(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function looksLikeTrendChart(title: string, items: Array<{ label: string; value: number }>) {
  if (items.length < 3) return false;
  const normalizedTitle = normalizeLabel(title).toLowerCase();
  if (/(month|monthly|trend|time|timeline|week|weekly|day|daily|quarter|year)/.test(normalizedTitle)) return true;
  return items.every((item) => /^\d{4}([-/]\d{1,2})?$/.test(item.label) || /^\d{1,2}m$/i.test(item.label));
}

export function inferRendererChartType(title: string, items: Array<{ label: string; value: number }>) {
  if (looksLikeTrendChart(title, items)) return 'line' as const;
  if (items.length > 4 || items.some((item) => item.label.length > 8)) return 'horizontal-bar' as const;
  return 'bar' as const;
}

function resolveSlotForChart(
  chart: PageChart,
  index: number,
  slots: ReportPlanDatavizSlot[],
) {
  const normalizedTitle = normalizeSlotKey(String(chart.title || ''));
  return slots.find((slot) => normalizeSlotKey(slot.title) === normalizedTitle)
    || slots[index]
    || null;
}

export function applyDatavizPlanToCharts(
  charts: Array<PageChart | null | undefined>,
  plan?: DatavizPlanningInput | null,
) {
  const normalizedCharts = (charts || []).filter(Boolean) as PageChart[];
  const slots = Array.isArray(plan?.slots) ? plan.slots.filter(Boolean) : [];
  if (!slots.length) return normalizedCharts;

  const usedChartIndexes = new Set<number>();
  const plannedCharts = slots.map((slot, slotIndex) => {
    const explicitMatchIndex = normalizedCharts.findIndex((chart, chartIndex) => {
      if (usedChartIndexes.has(chartIndex)) return false;
      return normalizeSlotKey(String(chart.title || '')) === normalizeSlotKey(slot.title);
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
      title: normalizeLabel(String(sourceChart?.title || slot.title)) || slot.title,
      items: Array.isArray(sourceChart?.items) ? sourceChart?.items : [],
    } satisfies PageChart;
  });

  const remainingCharts = normalizedCharts.filter((_, chartIndex) => !usedChartIndexes.has(chartIndex));
  return [...plannedCharts, ...remainingCharts];
}

export function sanitizeChartItems(items: Array<ChartItem | null | undefined>) {
  return (items || [])
    .map((item) => {
      const label = normalizeLabel(String(item?.label || ''));
      const value = Number(item?.value);
      if (!label || !Number.isFinite(value)) return null;
      return { label: label.slice(0, 32), value };
    })
    .filter(Boolean)
    .slice(0, MAX_RENDER_ITEMS) as Array<{ label: string; value: number }>;
}

export function buildChartAlt(title: string, chartType: string) {
  const normalizedTitle = normalizeLabel(title) || 'Data chart';
  if (chartType === 'line') return `${normalizedTitle} line chart`;
  if (chartType === 'bar') return `${normalizedTitle} bar chart`;
  return `${normalizedTitle} horizontal bar chart`;
}
