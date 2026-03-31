import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeDiscoveryCandidates,
  parseOpenClawDiscoverySuggestions,
} from '../src/lib/openclaw-file-discovery.js';

test('parseOpenClawDiscoverySuggestions should extract strict json arrays and sanitize paths', () => {
  const items = parseOpenClawDiscoverySuggestions([
    'Here is the result:',
    '[',
    '  {"path":"C:/Users/demo/Documents/Projects","label":"Projects","reason":"Likely working documents"},',
    '  {"path":"C:/Users/demo/Documents/Projects","label":"Duplicate","reason":"duplicate"}',
    ']',
  ].join('\n'));

  assert.equal(items.length, 1);
  assert.equal(items[0]?.path, 'C:\\Users\\demo\\Documents\\Projects');
  assert.equal(items[0]?.label, 'Projects');
  assert.equal(items[0]?.discoverySource, 'openclaw');
});

test('mergeDiscoveryCandidates should prefer OpenClaw suggestions over seed duplicates and keep seed fallback', () => {
  const merged = mergeDiscoveryCandidates(
    [
      { key: 'documents', label: 'Documents', reason: 'seed', path: 'C:\\Users\\demo\\Documents' },
      { key: 'downloads', label: 'Downloads', reason: 'seed', path: 'C:\\Users\\demo\\Downloads' },
    ],
    [
      {
        key: 'openclaw-1',
        label: 'Contracts',
        reason: 'OpenClaw spotted a likely business folder',
        path: 'C:\\Users\\demo\\Documents',
        discoverySource: 'openclaw',
      },
    ],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.label, 'Contracts');
  assert.equal(merged[1]?.label, 'Downloads');
});
