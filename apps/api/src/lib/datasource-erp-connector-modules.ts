import type { DatasourceRunSummaryItem } from './datasource-definitions.js';
import type {
  ErpBootstrapMode,
  ErpBootstrapRequest,
  ErpExecutionPlan,
  ErpModulePlan,
  ErpReadonlyGuard,
  ErpTransport,
} from './datasource-erp-connector-types.js';

function inferPurpose(module: string) {
  switch (module) {
    case 'orders':
      return 'Read order headers, items and order status';
    case 'complaints':
      return 'Read complaints and after-sales feedback';
    case 'inventory':
      return 'Read inventory, replenishment and stock exceptions';
    case 'customers':
      return 'Read customer profiles and segment summaries';
    case 'payments':
      return 'Read payment and collection status';
    case 'products':
      return 'Read product, SKU and category data';
    case 'service_tickets':
      return 'Read service tickets and fulfilment records';
    case 'deliveries':
      return 'Read shipping and delivery milestones';
    default:
      return 'Read the default ERP business scope';
  }
}

function buildResourceHints(module: string, transport: ErpTransport) {
  if (transport === 'api') return [`/api/${module}`, `/openapi/${module}`, `/v1/${module}`];
  if (transport === 'session') return [`/portal/${module}`, `/report/${module}`, `/export/${module}`];
  return [`${module}:snapshot`, `${module}:list`];
}

function buildStrategy(transport: ErpTransport): ErpModulePlan['strategy'] {
  if (transport === 'api') return 'list_then_detail';
  if (transport === 'session') return 'portal_export';
  return 'dashboard_snapshot';
}

export function buildModulePlans(modules: string[], transport: ErpTransport) {
  return modules.map((module) => ({
    module,
    transport,
    resourceHints: buildResourceHints(module, transport),
    strategy: buildStrategy(transport),
    purpose: inferPurpose(module),
  }));
}

export function buildBootstrapRequests(mode: ErpBootstrapMode, modules: string[], transport: ErpTransport) {
  const primaryModule = modules[0] || 'default_erp_scope';

  if (mode === 'api_base') {
    return [
      {
        label: 'api-health',
        method: 'GET',
        path: '/openapi/ping',
        purpose: 'Verify API reachability before readonly extraction',
        requiresAuth: false,
      },
      {
        label: 'api-sample',
        method: 'GET',
        path: `/api/${primaryModule}?page=1&pageSize=50`,
        purpose: 'Validate readonly list access for the primary module',
        requiresAuth: true,
      },
    ] satisfies ErpBootstrapRequest[];
  }

  if (mode === 'portal_login') {
    return [
      {
        label: 'portal-login-page',
        method: 'GET',
        path: '/portal/login',
        purpose: 'Load login form and capture session cookies',
        requiresAuth: false,
      },
      {
        label: 'portal-session-check',
        method: 'GET',
        path: `/portal/${primaryModule}`,
        purpose: 'Validate readonly portal access for the primary module',
        requiresAuth: true,
      },
    ] satisfies ErpBootstrapRequest[];
  }

  return [
    {
      label: 'generic-entry',
      method: 'GET',
      path: '/',
      purpose: 'Verify the ERP entrypoint is reachable',
      requiresAuth: false,
    },
    {
      label: 'generic-snapshot',
      method: 'GET',
      path: `/snapshot/${primaryModule}`,
      purpose: 'Validate readonly snapshot access for the primary module',
      requiresAuth: true,
    },
  ] satisfies ErpBootstrapRequest[];
}

export function buildReadonlyGuards(transport: ErpTransport) {
  return [
    {
      label: 'no-write-endpoints',
      rule: transport === 'api'
        ? 'Allow GET/list/detail endpoints only; block POST, PUT, PATCH and DELETE.'
        : 'Allow export/report/list pages only; block form submission and workflow actions.',
    },
    {
      label: 'library-scoped-ingest',
      rule: 'Only ingest records that match the requested modules and target libraries.',
    },
  ] satisfies ErpReadonlyGuard[];
}

export function buildExecutionSteps(plan: Pick<ErpExecutionPlan, 'systemLabel' | 'endpointTarget' | 'preferredTransport' | 'bootstrapMode' | 'executionReadiness' | 'bootstrapRequests' | 'readonlyGuards' | 'modulePlans'>) {
  return [
    {
      id: `erp:${plan.systemLabel}:bootstrap`,
      label: 'bootstrap',
      summary: `target ${plan.endpointTarget} | transport ${plan.preferredTransport} | mode ${plan.bootstrapMode} | readiness ${plan.executionReadiness}`,
    },
    ...plan.bootstrapRequests.slice(0, 2).map((item) => ({
      id: `erp:${plan.systemLabel}:request:${item.label}`,
      label: `request:${item.label}`,
      summary: `${item.purpose} | ${item.method} ${item.path}`,
    })),
    ...plan.readonlyGuards.slice(0, 2).map((item) => ({
      id: `erp:${plan.systemLabel}:guard:${item.label}`,
      label: `guard:${item.label}`,
      summary: item.rule,
    })),
    ...plan.modulePlans.slice(0, 8).map((item) => ({
      id: `erp:${plan.systemLabel}:${item.module}`,
      label: item.module,
      summary: `${item.purpose} | ${item.transport} | ${item.strategy} | ${item.resourceHints.join(', ')}`,
    })),
  ] satisfies DatasourceRunSummaryItem[];
}
