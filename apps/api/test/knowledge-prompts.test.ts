import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnowledgeAnswerPrompt,
  buildKnowledgeConceptPagePrompt,
  buildKnowledgeDetailFetchPrompt,
  buildKnowledgeOutputPrompt,
} from '../src/lib/knowledge-prompts.js';

test('buildKnowledgeAnswerPrompt should support direct answers from catalog and optional live detail', () => {
  const prompt = buildKnowledgeAnswerPrompt(
    'Workspace skill: knowledge-detail-fetch',
  );

  assert.match(prompt, /knowledge-backed answers/i);
  assert.match(prompt, /catalog snapshot, memory-selected document cards, and optional live document detail/i);
  assert.match(prompt, /Answer directly instead of discussing routing/i);
  assert.match(prompt, /When live detail is supplied, treat it as the strongest evidence/i);
  assert.match(prompt, /When only catalog snapshot or document cards are supplied/i);
  assert.match(prompt, /Workspace skill: knowledge-detail-fetch/i);
});

test('buildKnowledgeConceptPagePrompt should treat template options as optional for concept pages', () => {
  const prompt = buildKnowledgeConceptPagePrompt(
    'Workspace skill: knowledge-report-supply',
    'Output a static page.',
  );

  assert.match(prompt, /concept page structure/i);
  assert.match(prompt, /If relevant template options are supplied/i);
  assert.match(prompt, /optional planning layer/i);
  assert.match(prompt, /directly derivable from the supplied evidence/i);
  assert.doesNotMatch(prompt, /Do not force a shared template skeleton unless/i);
});

test('buildKnowledgeOutputPrompt should make template use optional instead of pre-committed', () => {
  const prompt = buildKnowledgeOutputPrompt(
    'Workspace skill: knowledge-report-supply',
    'Output a table.',
  );

  assert.match(prompt, /optional template catalog context/i);
  assert.match(prompt, /Decide yourself whether the result should stay direct/i);
  assert.match(prompt, /Use a template only when it clearly fits/i);
  assert.match(prompt, /planning hints as optional support/i);
  assert.match(prompt, /directly derivable from the supplied evidence/i);
  assert.doesNotMatch(prompt, /Follow the shared template envelope closely/i);
});

test('buildKnowledgeDetailFetchPrompt should enforce live-detail honesty', () => {
  const prompt = buildKnowledgeDetailFetchPrompt(
    'Workspace skill: knowledge-detail-fetch',
  );

  assert.match(prompt, /live document-detail answers/i);
  assert.match(prompt, /supplied live document detail and evidence/i);
  assert.match(prompt, /Do not imply that you checked file content beyond the supplied detail context/i);
  assert.match(prompt, /do not extrapolate quarter totals, full rankings, or exact cross-channel conclusions/i);
  assert.match(prompt, /Prefer representative examples and explicit uncertainty/i);
  assert.match(prompt, /Workspace skill: knowledge-detail-fetch/i);
});
