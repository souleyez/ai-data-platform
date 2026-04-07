import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-channel-access-policies-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const policiesModule = await importFresh<typeof import('../src/lib/channel-user-access-policies.js')>(
  '../src/lib/channel-user-access-policies.js',
);

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('channel user access policies should upsert user and group assignments with normalized library keys', async () => {
  const items = await policiesModule.upsertChannelUserAccessPolicies(
    'wecom-directory',
    [
      {
        subjectType: 'user',
        subjectId: 'zhangsan',
        visibleLibraryKeys: ['contract', 'contract', 'ioa', ''],
      },
      {
        subjectType: 'group',
        subjectId: 'risk-team',
        visibleLibraryKeys: ['bid', 'contract'],
      },
    ],
    'tester',
  );

  assert.equal(items.length, 2);
  const user = items.find((item) => item.subjectType === 'user');
  const group = items.find((item) => item.subjectType === 'group');
  assert.deepEqual(user?.visibleLibraryKeys, ['contract', 'ioa']);
  assert.deepEqual(group?.visibleLibraryKeys, ['bid', 'contract']);
  assert.equal(user?.updatedBy, 'tester');
});

test('channel user access policies should update existing subject rows and resolve assigned libraries', async () => {
  await policiesModule.upsertChannelUserAccessPolicies(
    'wecom-directory',
    [
      {
        subjectType: 'user',
        subjectId: 'zhangsan',
        visibleLibraryKeys: ['ioa'],
      },
      {
        subjectType: 'group',
        subjectId: 'risk-team',
        visibleLibraryKeys: ['bid', 'contract'],
      },
      {
        subjectType: 'group',
        subjectId: 'ops-team',
        visibleLibraryKeys: ['ops', 'contract'],
      },
    ],
    'tester-2',
  );

  const items = await policiesModule.listChannelUserAccessPolicies('wecom-directory');
  assert.equal(items.length, 3);
  assert.deepEqual(
    items
      .map((item) => `${item.subjectType}:${item.subjectId}`)
      .sort(),
    ['group:ops-team', 'group:risk-team', 'user:zhangsan'],
  );

  const assigned = await policiesModule.getSubjectAssignedLibraryKeys('wecom-directory', 'zhangsan', [
    'risk-team',
    'ops-team',
    'ops-team',
  ]);

  assert.deepEqual(assigned, ['ioa', 'bid', 'contract', 'ops']);
});
