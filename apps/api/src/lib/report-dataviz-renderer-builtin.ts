import { buildChartAlt } from './report-dataviz-planning.js';
import type { RendererPayload, ReportChartRender } from './report-dataviz-types.js';
import { markTaskSucceeded } from './task-runtime-metrics.js';

const BUILTIN_FONT_STACK = "'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','SimHei',sans-serif";

function escapeXml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildBuiltinAxisTicks(maxValue: number, steps = 4) {
  const safeMax = Math.max(maxValue, 1);
  return Array.from({ length: steps + 1 }, (_, index) => {
    const ratio = index / steps;
    return {
      ratio,
      value: Math.round((safeMax * ratio) / 10) * 10 || Math.round(safeMax * ratio),
    };
  });
}

function renderBuiltinBarSvg(payload: RendererPayload) {
  const width = 720;
  const height = 420;
  const margins = { top: 64, right: 28, bottom: 88, left: 56 };
  const chartWidth = width - margins.left - margins.right;
  const chartHeight = height - margins.top - margins.bottom;
  const maxValue = Math.max(...payload.items.map((item) => item.value), 1);
  const slotWidth = chartWidth / payload.items.length;
  const barWidth = Math.max(26, Math.min(72, slotWidth * 0.58));
  const ticks = buildBuiltinAxisTicks(maxValue);

  const gridLines = ticks.map((tick) => {
    const y = margins.top + chartHeight - (tick.ratio * chartHeight);
    return [
      `<line x1="${margins.left}" y1="${y.toFixed(1)}" x2="${(width - margins.right).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#d7e3f3" stroke-width="1"/>`,
      `<text x="${(margins.left - 10).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="#4b637d">${escapeXml(String(tick.value))}</text>`,
    ].join('');
  }).join('');

  const bars = payload.items.map((item, index) => {
    const x = margins.left + (slotWidth * index) + ((slotWidth - barWidth) / 2);
    const barHeight = maxValue > 0 ? (item.value / maxValue) * chartHeight : 0;
    const y = margins.top + chartHeight - barHeight;
    const labelX = x + (barWidth / 2);
    return [
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="10" fill="#3b82f6"/>`,
      `<text x="${labelX.toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" font-size="12" fill="#0f172a">${escapeXml(String(item.value))}</text>`,
      `<text x="${labelX.toFixed(1)}" y="${(height - 34).toFixed(1)}" text-anchor="end" transform="rotate(-28 ${labelX.toFixed(1)} ${(height - 34).toFixed(1)})" font-size="12" fill="#334155">${escapeXml(item.label)}</text>`,
    ].join('');
  }).join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(buildChartAlt(payload.title, payload.chart_type))}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${margins.left}" y="32" font-size="24" font-weight="700" fill="#0f172a" font-family="${BUILTIN_FONT_STACK}">${escapeXml(payload.title)}</text>`,
    `<text x="${margins.left}" y="52" font-size="13" fill="#64748b" font-family="${BUILTIN_FONT_STACK}">Rendered by builtin SVG fallback</text>`,
    gridLines,
    `<line x1="${margins.left}" y1="${(margins.top + chartHeight).toFixed(1)}" x2="${(width - margins.right).toFixed(1)}" y2="${(margins.top + chartHeight).toFixed(1)}" stroke="#94a3b8" stroke-width="1.2"/>`,
    bars,
    `</svg>`,
  ].join('');
}

function renderBuiltinHorizontalBarSvg(payload: RendererPayload) {
  const width = 720;
  const rowHeight = 34;
  const height = Math.max(260, 110 + (payload.items.length * rowHeight));
  const margins = { top: 68, right: 72, bottom: 28, left: 176 };
  const chartWidth = width - margins.left - margins.right;
  const maxValue = Math.max(...payload.items.map((item) => item.value), 1);
  const ticks = buildBuiltinAxisTicks(maxValue);

  const gridLines = ticks.map((tick) => {
    const x = margins.left + (tick.ratio * chartWidth);
    return [
      `<line x1="${x.toFixed(1)}" y1="${margins.top}" x2="${x.toFixed(1)}" y2="${(height - margins.bottom).toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`,
      `<text x="${x.toFixed(1)}" y="${(margins.top - 12).toFixed(1)}" text-anchor="middle" font-size="12" fill="#4b637d">${escapeXml(String(tick.value))}</text>`,
    ].join('');
  }).join('');

  const bars = payload.items.map((item, index) => {
    const y = margins.top + (index * rowHeight);
    const barWidth = maxValue > 0 ? (item.value / maxValue) * chartWidth : 0;
    return [
      `<text x="${(margins.left - 12).toFixed(1)}" y="${(y + 21).toFixed(1)}" text-anchor="end" font-size="13" fill="#334155">${escapeXml(item.label)}</text>`,
      `<rect x="${margins.left}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="20" rx="10" fill="#0ea5e9"/>`,
      `<text x="${(margins.left + barWidth + 10).toFixed(1)}" y="${(y + 15).toFixed(1)}" font-size="12" fill="#0f172a">${escapeXml(String(item.value))}</text>`,
    ].join('');
  }).join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(buildChartAlt(payload.title, payload.chart_type))}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${margins.left}" y="34" font-size="24" font-weight="700" fill="#0f172a" font-family="${BUILTIN_FONT_STACK}">${escapeXml(payload.title)}</text>`,
    `<text x="${margins.left}" y="54" font-size="13" fill="#64748b" font-family="${BUILTIN_FONT_STACK}">Rendered by builtin SVG fallback</text>`,
    gridLines,
    bars,
    `</svg>`,
  ].join('');
}

function renderBuiltinLineSvg(payload: RendererPayload) {
  const width = 720;
  const height = 360;
  const margins = { top: 64, right: 36, bottom: 56, left: 56 };
  const chartWidth = width - margins.left - margins.right;
  const chartHeight = height - margins.top - margins.bottom;
  const maxValue = Math.max(...payload.items.map((item) => item.value), 1);
  const ticks = buildBuiltinAxisTicks(maxValue);
  const stepX = payload.items.length > 1 ? chartWidth / (payload.items.length - 1) : 0;

  const gridLines = ticks.map((tick) => {
    const y = margins.top + chartHeight - (tick.ratio * chartHeight);
    return [
      `<line x1="${margins.left}" y1="${y.toFixed(1)}" x2="${(width - margins.right).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`,
      `<text x="${(margins.left - 10).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="#4b637d">${escapeXml(String(tick.value))}</text>`,
    ].join('');
  }).join('');

  const points = payload.items.map((item, index) => {
    const x = margins.left + (stepX * index);
    const y = margins.top + chartHeight - ((item.value / maxValue) * chartHeight);
    return { x, y, item };
  });
  const polylinePoints = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const nodes = points.map((point) => [
    `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4.5" fill="#2563eb"/>`,
    `<text x="${point.x.toFixed(1)}" y="${(point.y - 10).toFixed(1)}" text-anchor="middle" font-size="12" fill="#0f172a">${escapeXml(String(point.item.value))}</text>`,
    `<text x="${point.x.toFixed(1)}" y="${(height - 18).toFixed(1)}" text-anchor="middle" font-size="12" fill="#334155">${escapeXml(point.item.label)}</text>`,
  ].join('')).join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(buildChartAlt(payload.title, payload.chart_type))}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${margins.left}" y="32" font-size="24" font-weight="700" fill="#0f172a" font-family="${BUILTIN_FONT_STACK}">${escapeXml(payload.title)}</text>`,
    `<text x="${margins.left}" y="52" font-size="13" fill="#64748b" font-family="${BUILTIN_FONT_STACK}">Rendered by builtin SVG fallback</text>`,
    gridLines,
    `<polyline fill="none" stroke="#2563eb" stroke-width="3" points="${polylinePoints}"/>`,
    nodes,
    `</svg>`,
  ].join('');
}

export function renderBuiltinSvg(payload: RendererPayload) {
  if (payload.chart_type === 'line') return renderBuiltinLineSvg(payload);
  if (payload.chart_type === 'horizontal-bar') return renderBuiltinHorizontalBarSvg(payload);
  return renderBuiltinBarSvg(payload);
}

export async function buildBuiltinRender(payload: RendererPayload, reason: string, startedAtMs: number): Promise<ReportChartRender> {
  const chartType = payload.chart_type;
  const render: ReportChartRender = {
    renderer: 'builtin-svg',
    chartType,
    svg: renderBuiltinSvg(payload),
    alt: buildChartAlt(payload.title, chartType),
    generatedAt: new Date().toISOString(),
  };
  await markTaskSucceeded('dataviz', {
    processingCount: 0,
    durationMs: Date.now() - startedAtMs,
    lastMessage: `${payload.title} (${reason})`,
  }).catch(() => undefined);
  return render;
}
