import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-control-plane-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const appModule = await importFresh<typeof import('../src/app.js')>('../src/app.js');
const repositoryModule = await importFresh<typeof import('../src/lib/control-plane-state-repository.js')>(
  '../src/lib/control-plane-state-repository.js',
);

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('bootstrap auth should self-register unknown phone, create a session, and require upgrade when a newer release exists', async () => {
  await repositoryModule.mutateControlPlaneState((state) => {
    state.releases.push({
      id: 'release-stable-1',
      channel: 'stable',
      version: '2026.04.10+003',
      status: 'published',
      artifactUrl: 'https://example.com/releases/2026.04.10+003.zip',
      artifactSha256: 'abc123',
      artifactSize: 1024,
      openclawVersion: '2026.04.10',
      installerVersion: '2026.04.10',
      minSupportedVersion: '2026.04.05+001',
      releaseNotes: 'Latest stable release.',
      publishedAt: '2026-04-10T00:00:00.000Z',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-10T00:00:00.000Z',
    });
  });

  const app = appModule.createApp({ logger: false });
  const bootstrap = await app.inject({
    method: 'POST',
    url: '/api/client/bootstrap/auth',
    payload: {
      phone: '138-0013-8000',
      deviceFingerprint: 'win-device-1',
      deviceName: 'DESKTOP-001',
      osVersion: 'Windows 11 24H2',
      clientVersion: '2026.04.02+001',
      openclawVersion: '2026.04.02',
    },
  });

  assert.equal(bootstrap.statusCode, 200);
  const bootstrapBody = bootstrap.json();
  assert.equal(bootstrapBody.status, 'ok');
  assert.equal(bootstrapBody.user.phone, '13800138000');
  assert.equal(bootstrapBody.user.source, 'self_registered');
  assert.equal(bootstrapBody.upgrade.state, 'force_upgrade_required');
  assert.equal(typeof bootstrapBody.session.token, 'string');

  const sessionToken = bootstrapBody.session.token as string;
  const latestRelease = await app.inject({
    method: 'GET',
    url: '/api/client/releases/latest',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  assert.equal(latestRelease.statusCode, 200);
  assert.equal(latestRelease.json().release.version, '2026.04.10+003');

  const lease = await app.inject({
    method: 'POST',
    url: '/api/client/model-lease',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    payload: {
      providerScope: 'moonshot',
    },
  });

  assert.equal(lease.statusCode, 200);
  assert.equal(typeof lease.json().lease.token, 'string');

  await app.close();
});

test('bootstrap auth should reject unknown phone when self registration is disabled', async () => {
  await repositoryModule.mutateControlPlaneState((state) => {
    const globalPolicy = state.policies.find((item) => item.scopeType === 'global');
    if (!globalPolicy) {
      throw new Error('Missing global policy');
    }
    globalPolicy.allowSelfRegister = false;
  });

  const app = appModule.createApp({ logger: false });
  const response = await app.inject({
    method: 'POST',
    url: '/api/client/bootstrap/auth',
    payload: {
      phone: '13900139000',
      deviceFingerprint: 'win-device-2',
      clientVersion: '2026.04.10+003',
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'SELF_REGISTER_DISABLED');

  await app.close();
});
