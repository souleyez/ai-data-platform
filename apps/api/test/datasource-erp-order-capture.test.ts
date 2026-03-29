import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildErpOrderCaptureSummaryItems,
  buildFallbackErpOrderCapturePlan,
} from '../src/lib/datasource-erp-order-capture.js';
import { buildErpExecutionPlan } from '../src/lib/datasource-erp-connector.js';

test('buildFallbackErpOrderCapturePlan should create api order capture contract', () => {
  const definition = {
    id: 'ds-erp-api',
    name: 'ERP API order sync',
    kind: 'erp',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: 'Orders', mode: 'primary' }],
    schedule: { kind: 'daily' },
    authMode: 'api_token',
    config: {
      url: 'https://erp.example.com/openapi',
      focus: 'order payment delivery',
    },
    notes: '',
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as const;

  const executionPlan = buildErpExecutionPlan(definition);
  const capturePlan = buildFallbackErpOrderCapturePlan(definition, executionPlan);

  assert.equal(capturePlan.transport, 'api');
  assert.equal(capturePlan.captureMode, 'list_then_detail');
  assert.ok(capturePlan.login.requiredCredentials.includes('api_token'));
  assert.ok(capturePlan.listCapture.pathHints.some((item) => item.startsWith('/api/orders')));
  assert.ok(capturePlan.detailCapture.pathHints.some((item) => item.includes('/detail') || item.includes('{order_id}')));
  assert.ok(capturePlan.incrementalSync.cursorCandidates.includes('updated_at'));
  assert.match(capturePlan.incrementalSync.watermarkPolicy, /updated_at/i);
});

test('buildFallbackErpOrderCapturePlan should create portal capture contract for session ERP', () => {
  const definition = {
    id: 'ds-erp-session',
    name: 'ERP portal collector',
    kind: 'erp',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: 'Orders', mode: 'primary' }],
    schedule: { kind: 'weekly' },
    authMode: 'credential',
    credentialRef: { id: 'cred-1', kind: 'credential', label: 'ERP account' },
    config: {
      url: 'https://erp.example.com/portal/login',
      focus: 'orders complaints delivery',
    },
    notes: 'Portal export preferred',
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as const;

  const executionPlan = buildErpExecutionPlan(definition);
  const capturePlan = buildFallbackErpOrderCapturePlan(definition, executionPlan);

  assert.equal(capturePlan.transport, 'session');
  assert.equal(capturePlan.captureMode, 'portal_export');
  assert.equal(capturePlan.login.entryPath, '/portal/login');
  assert.deepEqual(capturePlan.login.requiredCredentials, ['username', 'password']);
  assert.ok(capturePlan.listCapture.paginationHints.some((item) => /export/i.test(item)));
  assert.ok(capturePlan.detailCapture.pathHints.some((item) => /detail|view|items/i.test(item)));
});

test('buildErpOrderCaptureSummaryItems should emit capture objective and sync hints', () => {
  const definition = {
    id: 'ds-erp-summary',
    name: 'ERP summary',
    kind: 'erp',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: 'Orders', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'api_token',
    config: {
      url: 'https://erp.example.com/openapi',
      focus: 'orders payments',
    },
    notes: '',
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as const;

  const executionPlan = buildErpExecutionPlan(definition);
  const capturePlan = buildFallbackErpOrderCapturePlan(definition, executionPlan);
  const items = buildErpOrderCaptureSummaryItems(executionPlan, {
    plan: capturePlan,
    provider: 'deterministic',
    model: 'deterministic',
    usedFallback: true,
  });

  assert.equal(items.length, 3);
  assert.match(items[0]?.summary || '', /list_then_detail|provider deterministic/i);
  assert.match(items[1]?.summary || '', /credentials api_token/i);
  assert.match(items[2]?.summary || '', /cursor updated_at|dedupe order_no/i);
});
