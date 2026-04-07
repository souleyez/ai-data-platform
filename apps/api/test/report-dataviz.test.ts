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
  if (!venvAvailable) {
    assert.equal(rendered?.charts?.[0]?.render, undefined);
    return;
  }

  assert.equal(rendered?.charts?.[0]?.render?.renderer, 'python-dataviz');
  assert.match(rendered?.charts?.[0]?.render?.svg || '', /<svg/i);
  assert.match(rendered?.charts?.[0]?.render?.alt || '', /Channel contribution/i);
});
