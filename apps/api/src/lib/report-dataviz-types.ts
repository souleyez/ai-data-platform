import type { ReportPlanDatavizSlot } from './report-planner.js';

export type ReportChartRender = {
  renderer?: string;
  chartType?: string;
  svg?: string;
  alt?: string;
  generatedAt?: string;
};

export type ChartItem = { label?: string; value?: number };
export type PageChart = {
  title?: string;
  items?: ChartItem[];
  render?: ReportChartRender | null;
};

export type PageShape = {
  summary?: string;
  cards?: Array<{ label?: string; value?: string; note?: string }>;
  sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
  charts?: PageChart[];
};

export type DatavizPlanningInput = {
  slots?: ReportPlanDatavizSlot[] | null;
};

export type RendererPayload = {
  title: string;
  chart_type: 'bar' | 'horizontal-bar' | 'line';
  items: Array<{ label: string; value: number }>;
};
