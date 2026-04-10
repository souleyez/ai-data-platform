import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAutomaticLibraryGroups } from '../src/lib/document-route-services.js';
import type { DocumentLibrary } from '../src/lib/document-libraries.js';

const libraries: DocumentLibrary[] = [
  {
    key: 'ungrouped',
    label: '未分组',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    key: 'order',
    label: '订单分析',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    key: 'resume',
    label: '简历',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

test('resolveAutomaticLibraryGroups falls back to ungrouped when no explicit group or library suggestion exists', () => {
  const groups = resolveAutomaticLibraryGroups({
    bizCategory: 'order',
    category: 'general',
    parseStatus: 'parsed',
  }, libraries);

  assert.deepEqual(groups, ['ungrouped']);
});

test('resolveAutomaticLibraryGroups falls back to ungrouped for unresolved general documents', () => {
  const groups = resolveAutomaticLibraryGroups({
    bizCategory: 'general',
    category: 'general',
    parseStatus: 'parsed',
  }, libraries);

  assert.deepEqual(groups, ['ungrouped']);
});

test('resolveAutomaticLibraryGroups keeps resume-like material discoverable via explicit library groups', () => {
  const groups = resolveAutomaticLibraryGroups({
    bizCategory: 'general',
    category: 'resume',
    schemaType: 'resume',
    parseStatus: 'parsed',
    title: '夏天宇简历',
    summary: '候选人，工作经历，目标岗位',
  }, libraries as any);

  assert.deepEqual(groups, ['resume']);
});

test('resolveAutomaticLibraryGroups falls back to ungrouped when parsing fails', () => {
  const groups = resolveAutomaticLibraryGroups({
    bizCategory: 'order',
    category: 'general',
    parseStatus: 'error',
  }, libraries);

  assert.deepEqual(groups, ['ungrouped']);
});

test('resolveAutomaticLibraryGroups leaves already grouped documents unchanged', () => {
  const groups = resolveAutomaticLibraryGroups({
    bizCategory: 'general',
    category: 'general',
    parseStatus: 'parsed',
    groups: ['order'],
    confirmedGroups: [],
  }, libraries);

  assert.deepEqual(groups, []);
});
