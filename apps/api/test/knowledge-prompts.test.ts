import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnowledgeConceptPagePrompt,
  buildKnowledgeOutputPrompt,
} from '../src/lib/knowledge-prompts.js';

test('buildKnowledgeConceptPagePrompt should emphasize concept-page generation without shared template lock-in', () => {
  const prompt = buildKnowledgeConceptPagePrompt(
    'Workspace skill: knowledge-report-supply',
    'Output a static page.',
  );

  assert.match(prompt, /concept page structure/i);
  assert.match(prompt, /Do not force a shared template skeleton/i);
  assert.match(prompt, /evidence and planning layer/i);
  assert.doesNotMatch(prompt, /Follow the shared template envelope closely/i);
});

test('buildKnowledgeOutputPrompt should keep template-first behavior for non-page outputs', () => {
  const prompt = buildKnowledgeOutputPrompt(
    'Workspace skill: knowledge-report-supply',
    'Follow template A exactly.',
    'Output a table.',
  );

  assert.match(prompt, /Follow the shared template envelope closely/i);
  assert.match(prompt, /report-planning directives/i);
  assert.match(prompt, /Follow template A exactly\./i);
});
