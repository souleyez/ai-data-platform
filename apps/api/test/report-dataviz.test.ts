import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..', '..', '..');
const PYTHON_VENV_WINDOWS = path.join(REPO_ROOT, 'skills', 'python-dataviz', '.venv', 'Scripts', 'python.exe');
const PYTHON_VENV_POSIX = path.join(REPO_ROOT, 'skills', 'python-dataviz', '.venv', 'bin', 'python');

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-dataviz-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const { attachDatavizRendersToPage } = await importFresh<typeof import('../src/lib/report-dataviz.js')>(
  '../src/lib/report-dataviz.js',
);

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('attachDatavizRendersToPage should render svg when the local python-dataviz venv is available', async () => {
  const page = {
    summary: 'Demo chart',
    charts: [
      {
        title: 'Channel contribution',
        items: [
          { label: 'Tmall', value: 42 },
          { label: 'JD', value: 27 },
          { label: 'Douyin', value: 18 },
        ],
      },
    ],
  };

  const rendered = await attachDatavizRendersToPage(page);
  const venvAvailable = existsSync(PYTHON_VENV_WINDOWS) || existsSync(PYTHON_VENV_POSIX);

  assert.equal(Array.isArray(rendered?.charts), true);
  assert.equal(rendered?.charts?.[0]?.render?.renderer, venvAvailable ? 'python-dataviz' : 'builtin-svg');
  assert.match(rendered?.charts?.[0]?.render?.svg || '', /<svg/i);
  assert.match(rendered?.charts?.[0]?.render?.alt || '', /Channel contribution/i);
});

test('attachDatavizRendersToPage should render svg for Chinese chart labels', async () => {
  const page = {
    summary: 'Mall footfall',
    charts: [
      {
        title: '商场分区客流',
        items: [
          { label: 'A区', value: 2180 },
          { label: 'B区', value: 1650 },
          { label: 'C区', value: 1000 },
        ],
      },
    ],
  };

  const rendered = await attachDatavizRendersToPage(page);
  const venvAvailable = existsSync(PYTHON_VENV_WINDOWS) || existsSync(PYTHON_VENV_POSIX);

  assert.equal(Array.isArray(rendered?.charts), true);
  assert.equal(rendered?.charts?.[0]?.render?.renderer, venvAvailable ? 'python-dataviz' : 'builtin-svg');
  assert.match(rendered?.charts?.[0]?.render?.svg || '', /<svg/i);
  assert.match(rendered?.charts?.[0]?.render?.alt || '', /商场分区客流/i);
});

test('attachDatavizRendersToPage should fall back to builtin svg when python renderer is disabled', async () => {
  process.env.AI_DATA_PLATFORM_DISABLE_PYTHON_DATAVIZ = '1';
  const { attachDatavizRendersToPage: attachWithBuiltinFallback } =
    await importFresh<typeof import('../src/lib/report-dataviz.js')>(
      '../src/lib/report-dataviz.js',
    );

  const rendered = await attachWithBuiltinFallback({
    summary: 'fallback chart',
    charts: [
      {
        title: '商场分区客流贡献',
        items: [
          { label: 'A区', value: 2180 },
          { label: 'B区', value: 1650 },
        ],
      },
    ],
  });

  delete process.env.AI_DATA_PLATFORM_DISABLE_PYTHON_DATAVIZ;
  assert.equal(rendered?.charts?.[0]?.render?.renderer, 'builtin-svg');
  assert.match(rendered?.charts?.[0]?.render?.svg || '', /<svg/i);
  assert.match(rendered?.charts?.[0]?.render?.svg || '', /商场分区客流贡献/);
});
