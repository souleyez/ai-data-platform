import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildErpSessionBrowserLaunchContract,
  runErpSessionBrowserLaunch,
} from '../src/lib/datasource-erp-session-launch.js';
import { buildErpExecutionPlan } from '../src/lib/datasource-erp-connector.js';
import { buildFallbackErpOrderCapturePlan } from '../src/lib/datasource-erp-order-capture.js';

test('buildErpSessionBrowserLaunchContract should prepare readonly portal launch contract', () => {
  const definition = {
    id: 'ds-erp-session',
    name: 'ERP portal collector',
    kind: 'erp',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: 'Orders', mode: 'primary' }],
    schedule: { kind: 'weekly' },
    authMode: 'credential',
    credentialRef: { id: 'cred-erp', kind: 'credential', label: 'ERP account' },
    config: {
      url: 'https://erp.example.com/portal/login',
      focus: 'orders payments delivery',
    },
    notes: 'readonly portal export',
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as const;

  const executionPlan = buildErpExecutionPlan(definition);
  const capturePlan = buildFallbackErpOrderCapturePlan(definition, executionPlan);
  const contract = buildErpSessionBrowserLaunchContract({
    definition,
    executionPlan,
    captureResolution: {
      plan: capturePlan,
      provider: 'deterministic',
      model: 'deterministic',
      usedFallback: true,
    },
    credentialSecret: {
      username: 'demo.user',
      password: 'secret-pass',
    },
  });

  assert.equal(contract.transport, 'session');
  assert.equal(contract.captureMode, 'portal_export');
  assert.equal(contract.startUrl, 'https://erp.example.com/portal/login');
  assert.deepEqual(contract.credentialSummary.missingCredentials, []);
  assert.equal(contract.credentialSummary.maskedUsername, 'de***r');
  assert.match(contract.taskPrompt, /Read-only ERP portal order capture task/i);
  assert.match(contract.taskPrompt, /Do not create, approve, edit, delete/i);
  assert.ok(!/secret-pass/.test(contract.taskPrompt));
  assert.match(contract.commandPreview, /mcporter call autoglm-browser-agent\.browser_subagent/i);
});

test('runErpSessionBrowserLaunch should stay contract-only by default and surface missing credentials', async () => {
  const definition = {
    id: 'ds-erp-session-missing',
    name: 'ERP portal collector',
    kind: 'erp',
    status: 'active',
    targetLibraries: [{ key: 'orders', label: 'Orders', mode: 'primary' }],
    schedule: { kind: 'manual' },
    authMode: 'manual_session',
    config: {
      url: 'https://erp.example.com/portal/login',
      focus: 'orders delivery',
    },
    notes: '',
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as const;

  const executionPlan = buildErpExecutionPlan(definition);
  const capturePlan = buildFallbackErpOrderCapturePlan(definition, executionPlan);
  const result = await runErpSessionBrowserLaunch({
    definition,
    executionPlan,
    captureResolution: {
      plan: capturePlan,
      provider: 'deterministic',
      model: 'deterministic',
      usedFallback: true,
    },
  });

  assert.equal(result.execution.status, 'not_requested');
  assert.ok(result.warnings.some((item) => /Missing credential material/i.test(item)));
  assert.ok(result.steps.some((item) => /readonly ERP session/i.test(item)));
});
