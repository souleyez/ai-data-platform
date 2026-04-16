import type { ReportOutputRecord } from './report-center.js';
import type { StateStoreDeps } from './report-center-state-normalization.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeStoredPageCard(value: unknown, deps: StateStoreDeps) {
  if (!isRecord(value)) return null;
  const label = deps.normalizeTextField(value.label);
  const rawValue = deps.normalizeTextField(value.value);
  const note = deps.normalizeTextField(value.note);
  return label || rawValue || note ? { label, value: rawValue, note } : null;
}

function normalizeStoredPageSection(value: unknown, deps: StateStoreDeps) {
  if (!isRecord(value)) return null;
  const title = deps.normalizeTextField(value.title);
  const body = deps.normalizeTextField(value.body);
  const bullets = deps.normalizeStringList(value.bullets);
  const displayMode = deps.normalizeTextField(value.displayMode);
  return title || body || bullets.length ? { title, body, bullets, displayMode } : null;
}

function normalizeStoredPageChartRender(value: unknown, deps: StateStoreDeps) {
  if (!isRecord(value)) return null;
  const renderer = deps.normalizeTextField(value.renderer);
  const chartType = deps.normalizeTextField(value.chartType);
  const svg = deps.normalizeTextField(value.svg);
  const alt = deps.normalizeTextField(value.alt);
  const generatedAt = deps.normalizeTextField(value.generatedAt);
  return renderer || chartType || svg || alt || generatedAt
    ? { renderer, chartType, svg, alt, generatedAt }
    : null;
}

export function normalizeStoredPageChart(value: unknown, deps: StateStoreDeps) {
  if (!isRecord(value)) return null;
  const title = deps.normalizeTextField(value.title);
  const items = Array.isArray(value.items)
    ? value.items
        .map((item) => {
          if (!isRecord(item)) return null;
          const label = deps.normalizeTextField(item.label);
          const numericValue = Number(item.value);
          return label
            ? {
                label,
                value: Number.isFinite(numericValue) ? numericValue : 0,
              }
            : null;
        })
        .filter(Boolean) as Array<{ label?: string; value?: number }>
    : [];
  const render = normalizeStoredPageChartRender(value.render, deps);
  return title || items.length || render ? { title, items, render } : null;
}

export function normalizeStoredPage(value: unknown, deps: StateStoreDeps): ReportOutputRecord['page'] | null {
  if (!isRecord(value)) return null;

  const summary = deps.normalizeTextField(value.summary);
  const cards = Array.isArray(value.cards)
    ? value.cards.map((item) => normalizeStoredPageCard(item, deps)).filter(Boolean) as Array<{ label?: string; value?: string; note?: string }>
    : [];
  const sections = Array.isArray(value.sections)
    ? value.sections.map((item) => normalizeStoredPageSection(item, deps)).filter(Boolean) as Array<{ title?: string; body?: string; bullets?: string[]; displayMode?: string }>
    : [];
  const datavizSlots = deps.normalizeStoredDatavizSlots(value.datavizSlots);
  const pageSpec = deps.normalizeStoredPageSpec(value.pageSpec);
  const visualStyle = deps.normalizeVisualStylePreset(value.visualStyle);
  const charts = Array.isArray(value.charts)
    ? value.charts.map((item) => normalizeStoredPageChart(item, deps)).filter(Boolean) as Array<{
        title?: string;
        items?: Array<{ label?: string; value?: number }>;
        render?: { renderer?: string; chartType?: string; svg?: string; alt?: string; generatedAt?: string } | null;
      }>
    : [];

  return summary || cards.length || sections.length || charts.length || datavizSlots.length || pageSpec || visualStyle
    ? { summary, cards, sections, datavizSlots, pageSpec, visualStyle, charts }
    : null;
}
