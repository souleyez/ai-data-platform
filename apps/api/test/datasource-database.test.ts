import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDatabaseExecutionPlan } from '../src/lib/datasource-database-connector.js';

test('buildDatabaseExecutionPlan should create readonly postgres plans for business targets', () => {
  const plan = buildDatabaseExecutionPlan({
    id: 'ds-db-postgres',
    name: 'Order warehouse',
    kind: 'database',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: '订单分析', mode: 'primary' }],
    schedule: { kind: 'daily' },
    authMode: 'database_password',
    config: {
      url: 'postgresql://demo:secret@localhost:5432/ops_dw',
      focus: '最近30天订单 客诉 库存',
    },
    notes: '按日增量拉取',
    createdAt: '2026-03-28T00:00:00.000Z',
    updatedAt: '2026-03-28T00:00:00.000Z',
  });

  assert.equal(plan.dialect, 'postgres');
  assert.equal(plan.databaseName, 'ops_dw');
  assert.equal(plan.executionReadiness, 'ready');
  assert.equal(plan.supportsReadonlyExecution, true);
  assert.ok(plan.executionSteps.length >= 4);
  assert.ok(plan.queryTargets.includes('orders'));
  assert.ok(plan.queryTargets.includes('complaints'));
  assert.ok(plan.queryTargets.includes('inventory'));
  assert.ok(plan.queryScopes.includes('incremental_window'));
  assert.ok(plan.queryPlans.every((item) => item.sqlPreview.startsWith('SELECT')));
  assert.ok(plan.queryPlans.every((item) => item.limit === 200));
  assert.ok(plan.connectionProbeChecks.some((item) => item.label === 'ping'));
  assert.ok(plan.readonlyGuards.some((item) => item.label === 'transaction_readonly'));
});

test('buildDatabaseExecutionPlan should preserve explicit mysql tables and views in readonly templates', () => {
  const plan = buildDatabaseExecutionPlan({
    id: 'ds-db-mysql',
    name: 'Sales database',
    kind: 'database',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: '订单分析', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'database_password',
    config: {
      url: 'mysql://demo:secret@localhost:3306/sales',
      tables: ['sales_orders'],
      views: ['business_view'],
      focus: '全量订单和经营视图',
    },
    notes: '',
    createdAt: '2026-03-28T00:00:00.000Z',
    updatedAt: '2026-03-28T00:00:00.000Z',
  });

  assert.equal(plan.dialect, 'mysql');
  assert.equal(plan.executionReadiness, 'ready');
  assert.ok(plan.queryTargets.includes('sales_orders'));
  assert.ok(plan.queryTargets.includes('business_view'));
  assert.ok(plan.queryPlans.some((item) => item.sqlPreview.includes('`sales_orders`')));
  assert.ok(plan.queryPlans.some((item) => item.kind === 'view'));
  assert.ok(plan.readonlyGuards.some((item) => item.sqlPreview.includes('READ ONLY')));
});

test('buildDatabaseExecutionPlan should warn when auth and targets are incomplete', () => {
  const plan = buildDatabaseExecutionPlan({
    id: 'ds-db-warning',
    name: 'Pending database',
    kind: 'database',
    status: 'draft',
    targetLibraries: [{ key: 'ungrouped', label: '未分组', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'none',
    config: {},
    notes: '',
    createdAt: '2026-03-28T00:00:00.000Z',
    updatedAt: '2026-03-28T00:00:00.000Z',
  });

  assert.equal(plan.executionReadiness, 'needs_connection');
  assert.ok(plan.validationWarnings.some((item) => item.includes('Missing database connection information')));
  assert.ok(plan.validationWarnings.some((item) => item.includes('Database dialect could not be identified')));
  assert.ok(plan.validationWarnings.some((item) => item.includes('No concrete readonly extraction targets were identified')));
  assert.ok(plan.validationWarnings.some((item) => item.includes('database_password auth mode')));
});

test('buildDatabaseExecutionPlan should infer dialect from credential connection string when config url is absent', () => {
  const plan = buildDatabaseExecutionPlan(
    {
      id: 'ds-db-credential',
      name: 'Credential-backed database',
      kind: 'database',
      status: 'active',
      targetLibraries: [{ key: 'orders', label: '订单分析', mode: 'primary' }],
      schedule: { kind: 'manual' },
      authMode: 'database_password',
      credentialRef: { id: 'cred-db', kind: 'database_password', label: '业务库连接串' },
      config: {
        focus: '订单 商品',
      },
      notes: '',
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:00.000Z',
    },
    {
      connectionString: 'postgresql://demo:secret@localhost:5432/warehouse',
    },
  );

  assert.equal(plan.connectionMode, 'hybrid');
  assert.equal(plan.credentialSource, 'credential_secret');
  assert.equal(plan.dialect, 'postgres');
  assert.equal(plan.databaseName, 'warehouse');
  assert.equal(plan.executionReadiness, 'ready');
  assert.equal(plan.connectionTarget, 'localhost:5432/warehouse');
});
