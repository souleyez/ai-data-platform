import test from 'node:test';
import assert from 'node:assert/strict';
import { orderLibrariesWithSelectedFirst } from './home-dataset-rail-order.mjs';

test('orderLibrariesWithSelectedFirst should move selected libraries to the front while preserving relative order', () => {
  const libraries = [
    { key: 'contracts', label: '合同库' },
    { key: 'resume', label: '简历库' },
    { key: 'orders', label: '订单库' },
    { key: 'papers', label: '论文库' },
  ];

  const ordered = orderLibrariesWithSelectedFirst(libraries, ['orders', 'resume']);

  assert.deepEqual(
    ordered.map((item) => item.key),
    ['resume', 'orders', 'contracts', 'papers'],
  );
});

test('orderLibrariesWithSelectedFirst should keep original order when there is no selection', () => {
  const libraries = [
    { key: 'contracts', label: '合同库' },
    { key: 'resume', label: '简历库' },
  ];

  const ordered = orderLibrariesWithSelectedFirst(libraries, []);

  assert.deepEqual(ordered.map((item) => item.key), ['contracts', 'resume']);
});
