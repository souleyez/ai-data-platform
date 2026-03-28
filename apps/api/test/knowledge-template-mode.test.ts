import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseConceptPageMode } from '../src/lib/knowledge-template.js';

test('shouldUseConceptPageMode should default page outputs to concept mode when no explicit template is provided', () => {
  assert.equal(shouldUseConceptPageMode('page', ''), true);
  assert.equal(shouldUseConceptPageMode('page', undefined), true);
});

test('shouldUseConceptPageMode should keep explicit template page requests in template mode', () => {
  assert.equal(shouldUseConceptPageMode('page', 'template-123'), false);
});

test('shouldUseConceptPageMode should not affect table, ppt, or pdf outputs', () => {
  assert.equal(shouldUseConceptPageMode('table', ''), false);
  assert.equal(shouldUseConceptPageMode('ppt', ''), false);
  assert.equal(shouldUseConceptPageMode('pdf', ''), false);
});
