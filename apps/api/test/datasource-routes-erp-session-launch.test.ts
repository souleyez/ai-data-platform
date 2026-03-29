import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-erp-session-launch-'));
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
const appModule = await importFresh<typeof import('../src/app.js')>(
  '../src/app.js',
);
const app = appModule.createApp();

test.after(async () => {
  await app.close();
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('datasource session-launch route should return readonly launch contract for ERP portal sources', async () => {
  await datasourceCredentials.upsertDatasourceCredential({
    id: 'cred-erp-portal',
    kind: 'credential',
    label: 'ERP portal',
    secret: {
      username: 'portal.user',
      password: 'portal-secret',
    },
  });

  await datasourceDefinitions.upsertDatasourceDefinition({
    id: 'ds-erp-portal',
    name: 'ERP portal datasource',
    kind: 'erp',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: 'Orders', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'credential',
    credentialRef: { id: 'cred-erp-portal', kind: 'credential', label: 'ERP portal' },
    config: {
      url: 'https://erp.example.com/portal/login',
      focus: 'orders payments delivery',
    },
    notes: 'portal readonly capture',
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/datasources/definitions/ds-erp-portal/session-launch',
    payload: {},
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.status, 'prepared');
  assert.equal(payload.item.transport, 'session');
  assert.equal(payload.item.startUrl, 'https://erp.example.com/portal/login');
  assert.deepEqual(payload.item.credentialSummary.missingCredentials, []);
  assert.match(payload.item.commandPreview, /mcporter call autoglm-browser-agent\.browser_subagent/i);
  assert.ok(Array.isArray(payload.item.steps) && payload.item.steps.length >= 4);
});

test('datasource session-launch route should reject non-session ERP sources', async () => {
  await datasourceDefinitions.upsertDatasourceDefinition({
    id: 'ds-erp-api-only',
    name: 'ERP api datasource',
    kind: 'erp',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: 'Orders', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'api_token',
    config: {
      url: 'https://erp.example.com/openapi',
      focus: 'orders',
    },
    notes: '',
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/datasources/definitions/ds-erp-api-only/session-launch',
    payload: {},
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.json().error || '', /session transport/i);
});
