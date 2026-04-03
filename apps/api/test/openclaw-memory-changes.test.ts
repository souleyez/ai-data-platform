import assert from 'node:assert/strict';
import test from 'node:test';
import { diffOpenClawMemoryState, type OpenClawMemoryState } from '../src/lib/openclaw-memory-changes.js';

function makeDocument(input: {
  id: string;
  libraryKeys: string[];
  title: string;
  summary: string;
  availability: string;
  updatedAt: string;
  fingerprint: string;
  parseStatus?: string;
  parseStage?: string;
  detailParseStatus?: string;
}) {
  return {
    parseStatus: input.parseStatus || 'parsed',
    parseStage: input.parseStage || 'detailed',
    detailParseStatus: input.detailParseStatus || 'succeeded',
    ...input,
  };
}

function makeState(overrides?: Partial<OpenClawMemoryState>): OpenClawMemoryState {
  return {
    version: 1,
    generatedAt: '2026-03-30T00:00:00.000Z',
    documents: {},
    recentChanges: [],
    ...overrides,
  };
}

test('diffOpenClawMemoryState should mark new documents as added', () => {
  const next = diffOpenClawMemoryState({
    previous: null,
    generatedAt: '2026-03-30T10:00:00.000Z',
    nextDocuments: [
      makeDocument({
        id: 'doc-1',
        libraryKeys: ['resume'],
        title: 'Candidate Resume',
        summary: 'Product and AI delivery background.',
        availability: 'available',
        updatedAt: '2026-03-30T09:00:00.000Z',
        fingerprint: 'fp-1',
      }),
    ],
  });

  assert.equal(Object.keys(next.documents).length, 1);
  assert.equal(next.recentChanges.length, 1);
  assert.equal(next.recentChanges[0]?.type, 'added');
  assert.match(next.recentChanges[0]?.note || '', /available/i);
});

test('diffOpenClawMemoryState should classify audit exclusion and restoration transitions', () => {
  const previous = makeState({
    documents: {
      'doc-1': makeDocument({
        id: 'doc-1',
        libraryKeys: ['resume'],
        title: 'Candidate A',
        summary: 'Initially available.',
        availability: 'available',
        updatedAt: '2026-03-30T09:00:00.000Z',
        fingerprint: 'fp-1',
      }),
    },
  });

  const excluded = diffOpenClawMemoryState({
    previous,
    generatedAt: '2026-03-30T10:00:00.000Z',
    nextDocuments: [
      makeDocument({
        id: 'doc-1',
        libraryKeys: ['resume'],
        title: 'Candidate A',
        summary: 'Excluded by audit.',
        availability: 'audit-excluded',
        updatedAt: '2026-03-30T10:00:00.000Z',
        fingerprint: 'fp-2',
      }),
    ],
  });

  assert.equal(excluded.recentChanges[0]?.type, 'audit-excluded');

  const restored = diffOpenClawMemoryState({
    previous: excluded,
    generatedAt: '2026-03-30T11:00:00.000Z',
    nextDocuments: [
      makeDocument({
        id: 'doc-1',
        libraryKeys: ['resume'],
        title: 'Candidate A',
        summary: 'Available again.',
        availability: 'available',
        updatedAt: '2026-03-30T11:00:00.000Z',
        fingerprint: 'fp-3',
      }),
    ],
  });

  assert.equal(restored.recentChanges[0]?.type, 'audit-restored');
});

test('diffOpenClawMemoryState should keep updated and deleted records in recent changes', () => {
  const previous = makeState({
    documents: {
      'doc-1': makeDocument({
        id: 'doc-1',
        libraryKeys: ['iot'],
        title: 'IoT Plan A',
        summary: 'Original summary.',
        availability: 'available',
        updatedAt: '2026-03-30T08:00:00.000Z',
        fingerprint: 'fp-1',
      }),
      'doc-2': makeDocument({
        id: 'doc-2',
        libraryKeys: ['iot'],
        title: 'IoT Plan B',
        summary: 'Will be removed.',
        availability: 'available',
        updatedAt: '2026-03-30T08:30:00.000Z',
        fingerprint: 'fp-2',
      }),
    },
  });

  const next = diffOpenClawMemoryState({
    previous,
    generatedAt: '2026-03-30T12:00:00.000Z',
    nextDocuments: [
      makeDocument({
        id: 'doc-1',
        libraryKeys: ['iot'],
        title: 'IoT Plan A',
        summary: 'Updated summary.',
        availability: 'available',
        updatedAt: '2026-03-30T12:00:00.000Z',
        fingerprint: 'fp-3',
      }),
    ],
  });

  assert.deepEqual(
    next.recentChanges.slice(0, 2).map((item) => item.type),
    ['updated', 'deleted'],
  );
});
