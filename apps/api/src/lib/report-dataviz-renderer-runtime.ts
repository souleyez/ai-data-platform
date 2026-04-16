import { promises as fs } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './paths.js';

const PYTHON_DATAVIZ_DIR = path.join(REPO_ROOT, 'skills', 'python-dataviz');
export const PYTHON_RENDER_SCRIPT = path.join(PYTHON_DATAVIZ_DIR, 'scripts', 'render_report_chart.py');
const WINDOWS_PYTHON = path.join(PYTHON_DATAVIZ_DIR, '.venv', 'Scripts', 'python.exe');
const POSIX_PYTHON = path.join(PYTHON_DATAVIZ_DIR, '.venv', 'bin', 'python');
export const RENDER_TIMEOUT_MS = 15000;

export async function resolvePythonExecutable() {
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
