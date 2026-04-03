import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpenClawMemorySelectionContextBlock,
  selectOpenClawMemoryDocumentCandidatesFromState,
} from '../src/lib/openclaw-memory-selection.js';
import type { OpenClawMemoryState } from '../src/lib/openclaw-memory-changes.js';

function makeState(): OpenClawMemoryState {
  return {
    version: 1,
    generatedAt: '2026-03-30T00:00:00.000Z',
    documents: {
      'doc-1': {
        id: 'doc-1',
        libraryKeys: ['resume'],
        title: 'Latest Resume A',
        summary: 'Candidate A product and smart-campus experience.',
        availability: 'available',
        updatedAt: '2026-03-30T10:00:00.000Z',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        fingerprint: 'fp-1',
      },
      'doc-2': {
        id: 'doc-2',
        libraryKeys: ['resume'],
        title: 'Older Resume B',
        summary: 'Candidate B backend and ERP delivery background.',
        availability: 'available',
        updatedAt: '2026-03-20T10:00:00.000Z',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        fingerprint: 'fp-2',
      },
      'doc-3': {
        id: 'doc-3',
        libraryKeys: ['bids'],
        title: 'Bid Pack A',
        summary: 'Tender material and qualification risk summary.',
        availability: 'available',
        updatedAt: '2026-03-30T09:00:00.000Z',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        fingerprint: 'fp-3',
      },
      'doc-4': {
        id: 'doc-4',
        libraryKeys: ['resume'],
        title: 'Excluded Resume',
        summary: 'Should not be selected.',
        availability: 'audit-excluded',
        updatedAt: '2026-03-30T11:00:00.000Z',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        fingerprint: 'fp-4',
      },
      'doc-5': {
        id: 'doc-5',
        libraryKeys: ['resume'],
        title: 'Failed OCR Resume',
        summary: 'Document OCR failed and needs reparse.',
        availability: 'parse-error',
        updatedAt: '2026-03-30T12:00:00.000Z',
        parseStatus: 'error',
        parseStage: 'detailed',
        detailParseStatus: 'failed',
        fingerprint: 'fp-5',
      },
    },
    recentChanges: [],
  };
}

test('selectOpenClawMemoryDocumentCandidatesFromState should prefer matched and recent library documents', () => {
  const selection = selectOpenClawMemoryDocumentCandidatesFromState({
    state: makeState(),
    requestText: '请基于简历库最新几份做客户汇报静态页',
    libraries: [{ key: 'resume', label: '简历' }],
    limit: 3,
  });

  assert.deepEqual(selection.documentIds.slice(0, 2), ['doc-1', 'doc-2']);
  assert.doesNotMatch(selection.documentIds.join(','), /doc-3|doc-4/);
});

test('buildOpenClawMemorySelectionContextBlock should expose selected ids and titles', () => {
  const selection = selectOpenClawMemoryDocumentCandidatesFromState({
    state: makeState(),
    requestText: '请基于简历库最新几份做客户汇报静态页',
    libraries: [{ key: 'resume', label: '简历' }],
    limit: 2,
  });

  const block = buildOpenClawMemorySelectionContextBlock(selection);
  assert.match(block, /Memory-selected documents:/);
  assert.match(block, /Latest Resume A/);
  assert.match(block, /id=doc-1/);
  assert.match(block, /detail=succeeded/);
});

test('selectOpenClawMemoryDocumentCandidatesFromState should match parse lifecycle metadata', () => {
  const selection = selectOpenClawMemoryDocumentCandidatesFromState({
    state: makeState(),
    requestText: '看看失败的扫描文件',
    limit: 3,
  });

  assert.equal(selection.documentIds[0], 'doc-5');
});

test('selectOpenClawMemoryDocumentCandidatesFromState should treat recent parsed phrasing as a recency signal', () => {
  const selection = selectOpenClawMemoryDocumentCandidatesFromState({
    state: makeState(),
    requestText: 'show the 2 most recently parsed documents',
    libraries: [{ key: 'resume', label: '简历' }],
    limit: 2,
  });

  assert.deepEqual(selection.documentIds, ['doc-1', 'doc-2']);
});
