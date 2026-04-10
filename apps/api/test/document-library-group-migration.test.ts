import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveExplicitLibraryGroups,
  resolveLegacyCategoryLibraryGroup,
  resolveMigratedLibraryGroups,
} from '../src/lib/document-library-group-migration.js';

const libraries = [
  { key: 'ungrouped' },
  { key: 'contract' },
  { key: 'order' },
  { key: 'resume' },
];

test('resolveExplicitLibraryGroups keeps only valid explicit groups', () => {
  const groups = resolveExplicitLibraryGroups({
    confirmedGroups: ['resume'],
    groups: ['missing', 'order'],
  }, libraries);

  assert.deepEqual(groups, ['resume', 'order']);
});

test('resolveLegacyCategoryLibraryGroup maps legacy category to same-key library', () => {
  const group = resolveLegacyCategoryLibraryGroup({
    bizCategory: 'contract',
  }, libraries);

  assert.equal(group, 'contract');
});

test('resolveMigratedLibraryGroups falls back to ungrouped when no explicit or legacy match exists', () => {
  const groups = resolveMigratedLibraryGroups({
    bizCategory: 'general',
    groups: [],
  }, libraries, 'ungrouped');

  assert.deepEqual(groups, ['ungrouped']);
});
