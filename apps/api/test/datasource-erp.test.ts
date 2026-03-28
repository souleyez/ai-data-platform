import test from 'node:test';
import assert from 'node:assert/strict';
import { buildErpExecutionPlan } from '../src/lib/datasource-erp-connector.js';

test('buildErpExecutionPlan should prefer api transport for api-token ERP sources', () => {
  const plan = buildErpExecutionPlan({
    id: 'ds-erp-api',
    name: 'ERP API order sync',
    kind: 'erp',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: '订单分析', mode: 'primary' }],
    schedule: { kind: 'daily' },
    authMode: 'api_token',
    config: {
      url: 'https://erp.example.com/openapi',
      focus: '订单 客诉 库存',
    },
    notes: '',
    createdAt: '2026-03-28T00:00:00.000Z',
    updatedAt: '2026-03-28T00:00:00.000Z',
  });

  assert.equal(plan.preferredTransport, 'api');
  assert.equal(plan.bootstrapMode, 'api_base');
  assert.equal(plan.executionReadiness, 'ready');
  assert.ok(plan.endpointHints.includes('api'));
  assert.ok(plan.modules.includes('orders'));
  assert.ok(plan.modules.includes('complaints'));
  assert.ok(plan.modules.includes('inventory'));
  assert.ok(plan.modulePlans.every((item) => item.strategy === 'list_then_detail'));
  assert.ok(plan.modulePlans.every((item) => item.resourceHints[0]?.startsWith('/api/')));
  assert.ok(plan.bootstrapRequests.some((item) => item.label === 'api-health'));
  assert.ok(plan.readonlyGuards.some((item) => item.label === 'no-write-endpoints'));
});

test('buildErpExecutionPlan should prefer session transport for portal-style ERP sources', () => {
  const plan = buildErpExecutionPlan({
    id: 'ds-erp-session',
    name: 'ERP portal collector',
    kind: 'erp',
    status: 'active',
    targetLibraries: [{ key: 'service', label: '客服采集', mode: 'primary' }],
    schedule: { kind: 'weekly' },
    authMode: 'manual_session',
    config: {
      url: 'https://erp.example.com/portal/login',
      focus: '订单 客诉 工单',
    },
    notes: '需要登录后查看工单与售后页面',
    createdAt: '2026-03-28T00:00:00.000Z',
    updatedAt: '2026-03-28T00:00:00.000Z',
  });

  assert.equal(plan.preferredTransport, 'session');
  assert.equal(plan.bootstrapMode, 'portal_login');
  assert.equal(plan.executionReadiness, 'ready');
  assert.ok(plan.endpointHints.includes('session'));
  assert.ok(plan.modules.includes('orders'));
  assert.ok(plan.modules.includes('complaints'));
  assert.ok(plan.modules.includes('service_tickets'));
  assert.ok(plan.modulePlans.every((item) => item.strategy === 'portal_export'));
  assert.ok(plan.modulePlans.every((item) => item.resourceHints[0]?.startsWith('/portal/')));
  assert.ok(plan.bootstrapRequests.some((item) => item.label === 'portal-login-page'));
});

test('buildErpExecutionPlan should warn when auth or module scope is incomplete', () => {
  const plan = buildErpExecutionPlan({
    id: 'ds-erp-warning',
    name: 'Pending ERP',
    kind: 'erp',
    status: 'draft',
    targetLibraries: [{ key: 'ungrouped', label: '未分组', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'none',
    config: {},
    notes: '',
    createdAt: '2026-03-28T00:00:00.000Z',
    updatedAt: '2026-03-28T00:00:00.000Z',
  });

  assert.equal(plan.executionReadiness, 'needs_auth');
  assert.ok(plan.validationWarnings.some((item) => item.includes('Missing ERP authentication mode')));
  assert.ok(plan.validationWarnings.some((item) => item.includes('No concrete ERP business modules were identified')));
  assert.equal(plan.supportsReadonlyExecution, true);
});
