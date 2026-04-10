import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { mergeDocumentCategoryConfig, normalizeConfiguredScanRoot, type DocumentCategoryConfig } from '../src/lib/document-config.js';

test('normalizeConfiguredScanRoot rejects foreign absolute paths for current platform', () => {
  if (process.platform === 'win32') {
    assert.equal(normalizeConfiguredScanRoot('/srv/ai-data-platform/storage/files', 'win32'), '');
    assert.ok(normalizeConfiguredScanRoot('C:\\workspace\\storage\\files', 'win32'));
    return;
  }

  assert.equal(normalizeConfiguredScanRoot('C:\\Users\\demo\\Documents', 'linux'), '');
  assert.equal(normalizeConfiguredScanRoot('/srv/app/C:\\Users\\demo\\Documents', 'linux'), '');
  assert.ok(normalizeConfiguredScanRoot('/srv/ai-data-platform/storage/files', 'linux'));
});

test('normalizeConfiguredScanRoot resolves relative scan roots within repo', () => {
  const normalized = normalizeConfiguredScanRoot('storage/files', process.platform);
  assert.ok(path.isAbsolute(normalized));
  assert.match(normalized, /storage[\\/]+files$/);
});

test('mergeDocumentCategoryConfig overlays runtime overrides on repo defaults', () => {
  const defaults: DocumentCategoryConfig = {
    scanRoot: 'C:\\repo\\storage\\files',
    scanRoots: ['C:\\repo\\storage\\files'],
    updatedAt: '2026-04-06T00:00:00.000Z',
    categories: {
      paper: { label: 'Paper', folders: ['paper'] },
      contract: { label: 'Contract', folders: ['contract'] },
      daily: { label: 'Daily', folders: ['daily'] },
      invoice: { label: 'Invoice', folders: ['invoice'] },
      order: { label: 'Order', folders: ['order'] },
      service: { label: 'Service', folders: ['service'] },
      inventory: { label: 'Inventory', folders: ['inventory'] },
    },
  };

  const merged = mergeDocumentCategoryConfig(defaults, {
    scanRoots: ['C:\\repo\\storage\\files', 'C:\\repo\\extra'],
    categories: {
      contract: { label: 'Contracts', folders: ['contracts'] },
    },
  }, defaults.scanRoot);

  assert.deepEqual(merged.scanRoots, ['C:\\repo\\storage\\files', 'C:\\repo\\extra']);
  assert.equal(merged.categories.contract.label, 'Contracts');
  assert.deepEqual(merged.categories.contract.folders, ['contracts']);
});
