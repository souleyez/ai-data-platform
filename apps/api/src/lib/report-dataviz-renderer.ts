import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { buildChartAlt } from './report-dataviz-planning.js';
import type { RendererPayload, ReportChartRender } from './report-dataviz-types.js';
import { buildBuiltinRender } from './report-dataviz-renderer-builtin.js';
import {
  PYTHON_RENDER_SCRIPT,
  RENDER_TIMEOUT_MS,
  resolvePythonExecutable,
} from './report-dataviz-renderer-runtime.js';
import { markTaskStarted, markTaskSucceeded } from './task-runtime-metrics.js';
import { REPO_ROOT } from './paths.js';

export async function runDatavizRenderer(payload: RendererPayload): Promise<ReportChartRender | null> {
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
