import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-datasource-session-controls-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const datasourceDefinitions = await importFresh<typeof import('../src/lib/datasource-definitions.js')>(
  '../src/lib/datasource-definitions.js',
);
const datasourceCredentials = await importFresh<typeof import('../src/lib/datasource-credentials.js')>(
  '../src/lib/datasource-credentials.js',
);
const webCaptureCredentials = await importFresh<typeof import('../src/lib/web-capture-credentials.js')>(
  '../src/lib/web-capture-credentials.js',
);
const appModule = await importFresh<typeof import('../src/app.js')>(
  '../src/app.js',
);
const app = appModule.createApp();

test.after(async () => {
  await app.close();
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('managed datasource route should expose stored session state for web definitions', async () => {
  const url = 'https://orders.example.com/login';

  await datasourceCredentials.upsertDatasourceCredential({
    id: 'cred-orders',
    kind: 'credential',
    label: '订单后台',
    secret: {
      username: 'orders.user',
      password: 'secret',
      cookies: 'session=credential-session',
    },
  });
  await webCaptureCredentials.saveWebCaptureCredential({
    url,
    username: 'orders.user',
    password: 'secret',
  });
  await webCaptureCredentials.saveWebCaptureSession({
    url,
    sessionCookies: {
      'orders.example.com': {
        session: 'legacy-session',
      },
    },
  });

  await datasourceDefinitions.upsertDatasourceDefinition({
    id: 'ds-orders-web',
    name: '订单后台登录采集',
    kind: 'web_login',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: '订单分析', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'credential',
    credentialRef: { id: 'cred-orders', kind: 'credential', label: '订单后台' },
    config: { url },
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/datasources/managed',
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  const item = payload.items.find((entry: { id: string }) => entry.id === 'ds-orders-web');
  assert.ok(item);
  assert.equal(item.accessState.supportsSessionReuse, true);
  assert.equal(item.accessState.hasStoredCredential, true);
  assert.equal(item.accessState.hasStoredSession, true);
  assert.equal(item.accessState.source, 'web-capture');
  assert.equal(item.accessState.canForceRelogin, true);
});

test('clear-session route should clear cached web and credential sessions', async () => {
  const url = 'https://portal.example.com/login';

  await datasourceCredentials.upsertDatasourceCredential({
    id: 'cred-portal',
    kind: 'credential',
    label: '门户账号',
    secret: {
      username: 'portal.user',
      password: 'secret',
      cookies: 'session=credential-session',
      headers: {
        Cookie: 'session=credential-session',
      },
    },
  });
  await webCaptureCredentials.saveWebCaptureCredential({
    url,
    username: 'portal.user',
    password: 'secret',
  });
  await webCaptureCredentials.saveWebCaptureSession({
    url,
    sessionCookies: {
      'portal.example.com': {
        session: 'legacy-session',
      },
    },
  });

  await datasourceDefinitions.upsertDatasourceDefinition({
    id: 'ds-portal-web',
    name: '门户登录采集',
    kind: 'web_login',
    status: 'active',
    targetLibraries: [{ key: 'ops', label: '运营分析', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'credential',
    credentialRef: { id: 'cred-portal', kind: 'credential', label: '门户账号' },
    config: { url },
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/datasources/definitions/ds-portal-web/clear-session',
    payload: {},
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, 'cleared');

  const webCredential = await webCaptureCredentials.loadWebCaptureCredential(url);
  const datasourceSecret = await datasourceCredentials.getDatasourceCredentialSecret('cred-portal');

  assert.deepEqual(webCredential?.sessionCookies || {}, {});
  assert.equal(webCredential?.sessionUpdatedAt || '', '');
  assert.equal(datasourceSecret?.cookies || '', '');
  assert.deepEqual(datasourceSecret?.headers || {}, {});
});

test('force-relogin route should reject non-credential web definitions', async () => {
  await datasourceDefinitions.upsertDatasourceDefinition({
    id: 'ds-manual-session-web',
    name: '手动会话采集',
    kind: 'web_login',
    status: 'active',
    targetLibraries: [{ key: 'ops', label: '运营分析', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'manual_session',
    config: { url: 'https://manual.example.com/login' },
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/datasources/definitions/ds-manual-session-web/force-relogin',
    payload: {},
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.json().error || '', /credential-based/i);
});
