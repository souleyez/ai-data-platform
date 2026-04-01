import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { normalizeConfiguredScanRoot } from '../src/lib/document-config.js';

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
