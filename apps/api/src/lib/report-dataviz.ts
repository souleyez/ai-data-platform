import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ChatOutput } from './knowledge-output.js';
import { REPO_ROOT } from './paths.js';

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

async function resolvePythonExecutable() {
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
  const [pythonExecutable, scriptExists] = await Promise.all([
    resolvePythonExecutable(),
    fs.access(PYTHON_RENDER_SCRIPT).then(() => true).catch(() => false),
  ]);

  if (!pythonExecutable || !scriptExists) return null;

  return new Promise((resolve) => {
    const child = spawn(pythonExecutable, [PYTHON_RENDER_SCRIPT], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, RENDER_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        if (stderr.trim()) console.warn(`[report-dataviz] renderer failed: ${stderr.trim()}`);
        return resolve(null);
      }
      try {
        const parsed = JSON.parse(stdout) as { svg?: string; chart_type?: string };
        const svg = String(parsed.svg || '').trim();
        if (!svg) return resolve(null);
        const chartType = String(parsed.chart_type || payload.chart_type || '').trim() || payload.chart_type;
        resolve({
          renderer: 'python-dataviz',
          chartType,
          svg,
          alt: buildChartAlt(payload.title, chartType),
          generatedAt: new Date().toISOString(),
        });
      } catch {
        resolve(null);
      }
    });

    child.stdin.end(JSON.stringify(payload));
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
