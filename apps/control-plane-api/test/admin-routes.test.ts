import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-control-plane-admin-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;
process.env.CONTROL_PLANE_ADMIN_TOKEN = 'test-admin-token';

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const appModule = await importFresh<typeof import('../src/app.js')>('../src/app.js');

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
  delete process.env.CONTROL_PLANE_ADMIN_TOKEN;
});

const adminHeaders = {
  'x-control-plane-admin-token': 'test-admin-token',
};

test('admin routes should reject requests without the configured admin token', async () => {
  const app = appModule.createApp({ logger: false });

  const response = await app.inject({
    method: 'GET',
    url: '/api/admin/users',
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().code, 'ADMIN_TOKEN_REQUIRED');

  await app.close();
});

test('admin routes should create users, releases, and provider keys', async () => {
  const app = appModule.createApp({ logger: false });

  const userResponse = await app.inject({
    method: 'POST',
    url: '/api/admin/users',
    headers: adminHeaders,
    payload: {
      phone: '13700137000',
      note: 'Pilot customer',
    },
  });
  assert.equal(userResponse.statusCode, 200);
  assert.equal(userResponse.json().item.phone, '13700137000');

  const releaseResponse = await app.inject({
    method: 'POST',
    url: '/api/admin/releases',
    headers: adminHeaders,
    payload: {
      channel: 'stable',
      version: '2026.04.12+001',
      artifactUrl: 'https://example.com/releases/2026.04.12+001.zip',
      artifactSha256: 'sha-001',
      artifactSize: 2048,
      minSupportedVersion: '2026.04.10+001',
      releaseNotes: 'Control plane MVP release',
    },
  });
  assert.equal(releaseResponse.statusCode, 200);
  const releaseId = releaseResponse.json().item.id as string;

  const publishResponse = await app.inject({
    method: 'POST',
    url: `/api/admin/releases/${releaseId}/publish`,
    headers: adminHeaders,
  });
  assert.equal(publishResponse.statusCode, 200);
  assert.equal(publishResponse.json().item.status, 'published');

  const providerResponse = await app.inject({
    method: 'POST',
    url: '/api/admin/model-provider-keys',
    headers: adminHeaders,
    payload: {
      provider: 'moonshot',
      region: 'cn',
      label: 'Primary pool',
      apiKey: 'sk-test-1234567890',
    },
  });
  assert.equal(providerResponse.statusCode, 200);
  assert.match(providerResponse.json().item.apiKeyMasked, /^sk-t\.\.\./);

  const bootstrapResponse = await app.inject({
    method: 'POST',
    url: '/api/client/bootstrap/auth',
    payload: {
      phone: '13700137000',
      deviceFingerprint: 'cp-admin-device-001',
      deviceName: 'Pilot desktop',
      osVersion: 'Windows 11',
      clientVersion: '2026.04.12+001',
      openclawVersion: '2026.04.12',
    },
  });
  assert.equal(bootstrapResponse.statusCode, 200);
  const sessionToken = bootstrapResponse.json().session.token as string;

  const policyList = await app.inject({
    method: 'GET',
    url: '/api/admin/policies',
    headers: adminHeaders,
  });
  assert.equal(policyList.statusCode, 200);
  const globalPolicy = policyList.json().items.find((item: { scopeType: string }) => item.scopeType === 'global');
  assert.ok(globalPolicy);

  const patchPolicy = await app.inject({
    method: 'PATCH',
    url: `/api/admin/policies/${globalPolicy.id}`,
    headers: adminHeaders,
    payload: {
      forceUpgrade: true,
      allowSelfRegister: false,
      providerScopes: ['moonshot', 'glm'],
    },
  });
  assert.equal(patchPolicy.statusCode, 200);
  assert.equal(patchPolicy.json().item.forceUpgrade, true);
  assert.equal(patchPolicy.json().item.allowSelfRegister, false);
  assert.deepEqual(patchPolicy.json().item.providerScopes, ['moonshot', 'glm']);

  const leaseResponse = await app.inject({
    method: 'POST',
    url: '/api/client/model-lease',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    payload: {
      providerScope: 'moonshot',
    },
  });
  assert.equal(leaseResponse.statusCode, 200);
  assert.equal(typeof leaseResponse.json().lease.token, 'string');

  const usersList = await app.inject({
    method: 'GET',
    url: '/api/admin/users',
    headers: adminHeaders,
  });
  assert.equal(usersList.statusCode, 200);
  assert.equal(usersList.json().items.length, 1);

  const releasesList = await app.inject({
    method: 'GET',
    url: '/api/admin/releases',
    headers: adminHeaders,
  });
  assert.equal(releasesList.statusCode, 200);
  assert.equal(releasesList.json().items[0].status, 'published');

  const providerList = await app.inject({
    method: 'GET',
    url: '/api/admin/model-provider-keys',
    headers: adminHeaders,
  });
  assert.equal(providerList.statusCode, 200);
  assert.equal(providerList.json().items[0].provider, 'moonshot');

  const devicesList = await app.inject({
    method: 'GET',
    url: '/api/admin/devices',
    headers: adminHeaders,
  });
  assert.equal(devicesList.statusCode, 200);
  assert.equal(devicesList.json().items[0].deviceFingerprint, 'cp-admin-device-001');
  assert.equal(devicesList.json().items[0].userPhone, '13700137000');

  const sessionsList = await app.inject({
    method: 'GET',
    url: '/api/admin/sessions',
    headers: adminHeaders,
  });
  assert.equal(sessionsList.statusCode, 200);
  assert.equal(sessionsList.json().items[0].userPhone, '13700137000');
  assert.equal(sessionsList.json().items[0].active, true);

  const leasesList = await app.inject({
    method: 'GET',
    url: '/api/admin/model-leases',
    headers: adminHeaders,
  });
  assert.equal(leasesList.statusCode, 200);
  assert.equal(leasesList.json().items[0].providerScope, 'moonshot');
  assert.equal(leasesList.json().items[0].active, true);

  await app.close();
});
