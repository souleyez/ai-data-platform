import assert from 'node:assert/strict';
import test from 'node:test';
import { diffOpenClawMemoryState, type OpenClawMemoryState } from '../src/lib/openclaw-memory-changes.js';

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
      {
        id: 'doc-1',
        libraryKeys: ['resume'],
        title: '夏天宇简历',
        summary: 'AIGC 与座舱方向候选人。',
        availability: 'available',
        updatedAt: '2026-03-30T09:00:00.000Z',
        fingerprint: 'fp-1',
      },
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
      'doc-1': {
        id: 'doc-1',
        libraryKeys: ['resume'],
        title: '候选人A',
        summary: '最初可用。',
        availability: 'available',
        updatedAt: '2026-03-30T09:00:00.000Z',
        fingerprint: 'fp-1',
      },
    },
  });

  const excluded = diffOpenClawMemoryState({
    previous,
    generatedAt: '2026-03-30T10:00:00.000Z',
    nextDocuments: [
      {
        id: 'doc-1',
        libraryKeys: ['resume'],
        title: '候选人A',
        summary: '被排除。',
        availability: 'audit-excluded',
        updatedAt: '2026-03-30T10:00:00.000Z',
        fingerprint: 'fp-2',
      },
    ],
  });

  assert.equal(excluded.recentChanges[0]?.type, 'audit-excluded');

  const restored = diffOpenClawMemoryState({
    previous: excluded,
    generatedAt: '2026-03-30T11:00:00.000Z',
    nextDocuments: [
      {
        id: 'doc-1',
        libraryKeys: ['resume'],
        title: '候选人A',
        summary: '恢复可用。',
        availability: 'available',
        updatedAt: '2026-03-30T11:00:00.000Z',
        fingerprint: 'fp-3',
      },
    ],
  });

  assert.equal(restored.recentChanges[0]?.type, 'audit-restored');
});

test('diffOpenClawMemoryState should keep updated and deleted records in recent changes', () => {
  const previous = makeState({
    documents: {
      'doc-1': {
        id: 'doc-1',
        libraryKeys: ['iot'],
        title: 'IOT 方案 A',
        summary: '初始摘要。',
        availability: 'available',
        updatedAt: '2026-03-30T08:00:00.000Z',
        fingerprint: 'fp-1',
      },
      'doc-2': {
        id: 'doc-2',
        libraryKeys: ['iot'],
        title: 'IOT 方案 B',
        summary: '即将删除。',
        availability: 'available',
        updatedAt: '2026-03-30T08:30:00.000Z',
        fingerprint: 'fp-2',
      },
    },
  });

  const next = diffOpenClawMemoryState({
    previous,
    generatedAt: '2026-03-30T12:00:00.000Z',
    nextDocuments: [
      {
        id: 'doc-1',
        libraryKeys: ['iot'],
        title: 'IOT 方案 A',
        summary: '摘要已更新。',
        availability: 'available',
        updatedAt: '2026-03-30T12:00:00.000Z',
        fingerprint: 'fp-3',
      },
    ],
  });

  assert.deepEqual(
    next.recentChanges.slice(0, 2).map((item) => item.type),
    ['updated', 'deleted'],
  );
});
