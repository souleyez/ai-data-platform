import type { ChatOutput } from './knowledge-output.js';
import {
  applyDatavizPlanToCharts,
  inferRendererChartType,
  normalizeLabel,
  sanitizeChartItems,
} from './report-dataviz-planning.js';
import { runDatavizRenderer } from './report-dataviz-renderer.js';
import type { DatavizPlanningInput, PageShape, ReportChartRender } from './report-dataviz-types.js';

export type { DatavizPlanningInput, PageShape, ReportChartRender } from './report-dataviz-types.js';

const MAX_RENDER_CHARTS = 4;

export async function attachDatavizRendersToPage(
  page: PageShape | null | undefined,
  plan?: DatavizPlanningInput | null,
) {
  if (!page?.charts?.length) return page || null;
  const plannedCharts = applyDatavizPlanToCharts(page.charts || [], plan);
  const slots = Array.isArray(plan?.slots) ? plan.slots.filter(Boolean) : [];

  const renderedCharts = await Promise.all(
    plannedCharts.slice(0, MAX_RENDER_CHARTS).map(async (chart, index) => {
      const title = normalizeLabel(chart.title || '');
      const items = sanitizeChartItems(chart.items || []);
      if (!title || items.length < 2) return chart;
      const slot = slots[index] || null;
      const render = await runDatavizRenderer({
        title,
        chart_type: slot?.preferredChartType || inferRendererChartType(title, items),
        items,
      });
      return render ? { ...chart, render } : chart;
    }),
  );

  return {
    ...page,
    charts: [
      ...renderedCharts,
      ...(plannedCharts.slice(MAX_RENDER_CHARTS) || []),
    ],
  };
}

export async function attachDatavizRendersToOutput(
  output: ChatOutput,
  plan?: DatavizPlanningInput | null,
) {
  if (output.type !== 'page' || !output.page) return output;
  const page = await attachDatavizRendersToPage(output.page, plan);
  return page ? { ...output, page } : output;
}
