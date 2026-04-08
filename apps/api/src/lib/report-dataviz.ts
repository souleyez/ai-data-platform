import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ChatOutput } from './knowledge-output.js';
import { REPO_ROOT } from './paths.js';
import {
  markTaskFailed,
  markTaskSkipped,
  markTaskStarted,
  markTaskSucceeded,
} from './task-runtime-metrics.js';

export type ReportChartRender = {
  renderer?: string;
  chartType?: string;
  svg?: string;
  alt?: string;
  generatedAt?: string;
};

type ChartItem = { label?: string; value?: number };
type PageChart = {
  title?: string;
  items?: ChartItem[];
  render?: ReportChartRender | null;
};

type PageShape = {
  summary?: string;
  cards?: Array<{ label?: string; value?: string; note?: string }>;
  sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
  charts?: PageChart[];
};

type RendererPayload = {
  title: string;
  chart_type: 'bar' | 'horizontal-bar' | 'line';
  items: Array<{ label: string; value: number }>;
};

const PYTHON_DATAVIZ_DIR = path.join(REPO_ROOT, 'skills', 'python-dataviz');
const PYTHON_RENDER_SCRIPT = path.join(PYTHON_DATAVIZ_DIR, 'scripts', 'render_report_chart.py');
const WINDOWS_PYTHON = path.join(PYTHON_DATAVIZ_DIR, '.venv', 'Scripts', 'python.exe');
const POSIX_PYTHON = path.join(PYTHON_DATAVIZ_DIR, '.venv', 'bin', 'python');
const RENDER_TIMEOUT_MS = 15000;
const MAX_RENDER_CHARTS = 4;
const MAX_RENDER_ITEMS = 10;
const BUILTIN_FONT_STACK = "'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','SimHei',sans-serif";

function normalizeLabel(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .trim();
}

function looksLikeTrendChart(title: string, items: Array<{ label: string; value: number }>) {
  if (items.length < 3) return false;
  const normalizedTitle = normalizeLabel(title).toLowerCase();
  if (/(month|monthly|trend|time|timeline|week|weekly|day|daily|quarter|year)/.test(normalizedTitle)) return true;
  return items.every((item) => /^\d{4}([-/]\d{1,2})?$/.test(item.label) || /^\d{1,2}m$/i.test(item.label));
}

function inferRendererChartType(title: string, items: Array<{ label: string; value: number }>) {
  if (looksLikeTrendChart(title, items)) return 'line' as const;
  if (items.length > 4 || items.some((item) => item.label.length > 8)) return 'horizontal-bar' as const;
  return 'bar' as const;
}

function sanitizeChartItems(items: Array<ChartItem | null | undefined>) {
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

function buildChartAlt(title: string, chartType: string) {
  const normalizedTitle = normalizeLabel(title) || 'Data chart';
  if (chartType === 'line') return `${normalizedTitle} line chart`;
  if (chartType === 'bar') return `${normalizedTitle} bar chart`;
  return `${normalizedTitle} horizontal bar chart`;
}

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

function renderBuiltinSvg(payload: RendererPayload) {
  if (payload.chart_type === 'line') return renderBuiltinLineSvg(payload);
  if (payload.chart_type === 'horizontal-bar') return renderBuiltinHorizontalBarSvg(payload);
  return renderBuiltinBarSvg(payload);
}

async function buildBuiltinRender(payload: RendererPayload, reason: string, startedAtMs: number) {
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

async function resolvePythonExecutable() {
  if (/^(1|true|yes)$/i.test(String(process.env.AI_DATA_PLATFORM_DISABLE_PYTHON_DATAVIZ || '').trim())) {
    return '';
  }
  for (const candidate of [WINDOWS_PYTHON, POSIX_PYTHON]) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  return '';
}

async function runRenderer(payload: RendererPayload): Promise<ReportChartRender | null> {
  const startedAtMs = Date.now();
  const [pythonExecutable, scriptExists] = await Promise.all([
    resolvePythonExecutable(),
    fs.access(PYTHON_RENDER_SCRIPT).then(() => true).catch(() => false),
  ]);

  if (!pythonExecutable || !scriptExists) {
    return buildBuiltinRender(payload, 'builtin-fallback', startedAtMs);
  }

  return new Promise((resolve) => {
    void markTaskStarted('dataviz', {
      processingCount: 1,
      lastMessage: payload.title,
    }).catch(() => undefined);
    const child = spawn(pythonExecutable, [PYTHON_RENDER_SCRIPT], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      void buildBuiltinRender(payload, 'builtin-timeout-fallback', startedAtMs)
        .then(resolve)
        .catch(() => resolve(null));
    }, RENDER_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });
    child.on('error', () => {
      clearTimeout(timer);
      void buildBuiltinRender(payload, 'builtin-spawn-fallback', startedAtMs)
        .then(resolve)
        .catch(() => resolve(null));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        if (stderr.trim()) console.warn(`[report-dataviz] renderer failed: ${stderr.trim()}`);
        void buildBuiltinRender(payload, 'builtin-process-fallback', startedAtMs)
          .then(resolve)
          .catch(() => resolve(null));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { svg?: string; chart_type?: string };
        const svg = String(parsed.svg || '').trim();
        if (!svg) {
          void buildBuiltinRender(payload, 'builtin-invalid-output-fallback', startedAtMs)
            .then(resolve)
            .catch(() => resolve(null));
          return;
        }
        const chartType = String(parsed.chart_type || payload.chart_type || '').trim() || payload.chart_type;
        void markTaskSucceeded('dataviz', {
          processingCount: 0,
          durationMs: Date.now() - startedAtMs,
          lastMessage: payload.title,
        }).catch(() => undefined);
        resolve({
          renderer: 'python-dataviz',
          chartType,
          svg,
          alt: buildChartAlt(payload.title, chartType),
          generatedAt: new Date().toISOString(),
        });
      } catch {
        void buildBuiltinRender(payload, 'builtin-parse-fallback', startedAtMs)
          .then(resolve)
          .catch(() => resolve(null));
      }
    });

    child.stdin.end(JSON.stringify(payload), 'utf8');
  });
}

export async function attachDatavizRendersToPage(page: PageShape | null | undefined) {
  if (!page?.charts?.length) return page || null;

  const renderedCharts = await Promise.all(
    page.charts.slice(0, MAX_RENDER_CHARTS).map(async (chart) => {
      const title = normalizeLabel(chart.title || '');
      const items = sanitizeChartItems(chart.items || []);
      if (!title || items.length < 2) return chart;
      const render = await runRenderer({
        title,
        chart_type: inferRendererChartType(title, items),
        items,
      });
      return render ? { ...chart, render } : chart;
    }),
  );

  return {
    ...page,
    charts: [
      ...renderedCharts,
      ...(page.charts.slice(MAX_RENDER_CHARTS) || []),
    ],
  };
}

export async function attachDatavizRendersToOutput(output: ChatOutput) {
  if (output.type !== 'page' || !output.page) return output;
  const page = await attachDatavizRendersToPage(output.page);
  return page ? { ...output, page } : output;
}
