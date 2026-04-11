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

test('attachDatavizRendersToPage should honor planned dataviz slot chart types and titles', async () => {
  process.env.AI_DATA_PLATFORM_DISABLE_PYTHON_DATAVIZ = '1';
  const { attachDatavizRendersToPage: attachWithPlan } =
    await importFresh<typeof import('../src/lib/report-dataviz.js')>(
      '../src/lib/report-dataviz.js',
    );

  const rendered = await attachWithPlan({
    summary: 'planned chart',
    charts: [
      {
        items: [
          { label: '1月', value: 20 },
          { label: '2月', value: 32 },
          { label: '3月', value: 48 },
        ],
      },
    ],
  }, {
    slots: [
      {
        key: 'monthly-gmv',
        title: '月度GMV与库存指数联动',
        purpose: 'Show monthly linkage.',
        preferredChartType: 'line',
        placement: 'hero',
        evidenceFocus: 'Monthly signals',
        minItems: 3,
        maxItems: 6,
      },
    ],
  });

  delete process.env.AI_DATA_PLATFORM_DISABLE_PYTHON_DATAVIZ;
  assert.equal(rendered?.charts?.[0]?.title, '月度GMV与库存指数联动');
  assert.equal(rendered?.charts?.[0]?.render?.chartType, 'line');
  assert.match(rendered?.charts?.[0]?.render?.svg || '', /<svg/i);
});

test('attachDatavizRendersToPage should add planned chart shells when the page output is missing them', async () => {
  process.env.AI_DATA_PLATFORM_DISABLE_PYTHON_DATAVIZ = '1';
  const { attachDatavizRendersToPage: attachWithPlan } =
    await importFresh<typeof import('../src/lib/report-dataviz.js')>(
      '../src/lib/report-dataviz.js',
    );

  const rendered = await attachWithPlan({
    summary: 'planned shells',
    charts: [
      {
        title: '渠道贡献结构',
        items: [
          { label: 'Tmall', value: 42 },
          { label: 'JD', value: 27 },
        ],
      },
    ],
  }, {
    slots: [
      {
        key: 'channel-mix',
        title: '渠道贡献结构',
        purpose: 'Channel mix',
        preferredChartType: 'bar',
        placement: 'hero',
        evidenceFocus: 'Channel evidence',
        minItems: 2,
        maxItems: 6,
      },
      {
        key: 'restock-queue',
        title: '补货优先级队列',
        purpose: 'Restock queue',
        preferredChartType: 'horizontal-bar',
        placement: 'section',
        sectionTitle: '行动建议',
        evidenceFocus: 'Restock evidence',
        minItems: 2,
        maxItems: 8,
      },
    ],
  });

  delete process.env.AI_DATA_PLATFORM_DISABLE_PYTHON_DATAVIZ;
  assert.equal(rendered?.charts?.length, 2);
  assert.equal(rendered?.charts?.[0]?.title, '渠道贡献结构');
  assert.equal(rendered?.charts?.[1]?.title, '补货优先级队列');
  assert.deepEqual(rendered?.charts?.[1]?.items || [], []);
});
