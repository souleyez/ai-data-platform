import type { DatasourceDefinition, DatasourceRunSummaryItem } from './datasource-definitions.js';

export type ErpTransport = 'api' | 'session' | 'generic';
export type ErpBootstrapMode = 'api_base' | 'portal_login' | 'generic_entry';
export type ErpExecutionReadiness = 'ready' | 'needs_auth' | 'needs_scope';

export type ErpBootstrapRequest = {
  label: string;
  method: 'GET' | 'POST';
  path: string;
  purpose: string;
  requiresAuth: boolean;
};

export type ErpReadonlyGuard = {
  label: string;
  rule: string;
};

export type ErpModulePlan = {
  module: string;
  transport: ErpTransport;
  resourceHints: string[];
  strategy: 'list_then_detail' | 'portal_export' | 'dashboard_snapshot';
  purpose: string;
};

export type ErpExecutionPlan = {
  systemLabel: string;
  endpointTarget: string;
  modules: string[];
  authKind: 'credential' | 'manual_session' | 'api_token' | 'none';
  endpointHints: string[];
  preferredTransport: ErpTransport;
  bootstrapMode: ErpBootstrapMode;
  bootstrapRequests: ErpBootstrapRequest[];
  readonlyGuards: ErpReadonlyGuard[];
  modulePlans: ErpModulePlan[];
  executionReadiness: ErpExecutionReadiness;
  supportsReadonlyExecution: boolean;
  executionSteps: DatasourceRunSummaryItem[];
  validationWarnings: string[];
  summary: string;
};

function splitHints(value: unknown) {
  return String(value || '')
    .split(/[,\n;/]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function inferModules(definition: DatasourceDefinition) {
  const raw = [
    ...splitHints(definition.config?.focus),
    ...splitHints(definition.notes),
    ...((Array.isArray(definition.config?.keywords) ? definition.config.keywords : []).map(String)),
    ...((Array.isArray(definition.config?.siteHints) ? definition.config.siteHints : []).map(String)),
    ...((Array.isArray(definition.config?.modules) ? definition.config.modules : []).map(String)),
  ];

  const modules = new Set<string>();
  for (const entry of raw) {
    const lowered = entry.toLowerCase();
    if (/order|订单/.test(lowered)) modules.add('orders');
    if (/complaint|客诉|投诉|售后/.test(lowered)) modules.add('complaints');
    if (/inventory|库存|备货/.test(lowered)) modules.add('inventory');
    if (/customer|客户/.test(lowered)) modules.add('customers');
    if (/payment|回款|收款/.test(lowered)) modules.add('payments');
    if (/product|商品|sku/.test(lowered)) modules.add('products');
    if (/ticket|工单|服务单/.test(lowered)) modules.add('service_tickets');
    if (/delivery|物流|发货/.test(lowered)) modules.add('deliveries');
  }

  if (!modules.size) modules.add('default_erp_scope');
  return Array.from(modules).slice(0, 8);
}

function inferEndpointHints(definition: DatasourceDefinition) {
  const hints = new Set<string>();
  const text = [
    ...splitHints(definition.config?.url),
    ...splitHints(definition.config?.focus),
    ...splitHints(definition.notes),
  ]
    .join(' ')
    .toLowerCase();

  if (/api|openapi|rest/.test(text)) hints.add('api');
  if (/login|session|cookie|portal|web/.test(text)) hints.add('session');
  if (/sap/.test(text)) hints.add('sap');
  if (/kingdee|金蝶/.test(text)) hints.add('kingdee');
  if (/yonyou|u8|nc|用友/.test(text)) hints.add('yonyou');
  if (!hints.size) hints.add('generic_erp');
  return Array.from(hints);
}

function inferTransport(endpointHints: string[], authKind: ErpExecutionPlan['authKind']): ErpTransport {
  if (endpointHints.includes('api') || authKind === 'api_token') return 'api';
  if (endpointHints.includes('session') || authKind === 'manual_session' || authKind === 'credential') return 'session';
  return 'generic';
}

function inferBootstrapMode(endpointHints: string[], preferredTransport: ErpTransport): ErpBootstrapMode {
  if (preferredTransport === 'api' || endpointHints.includes('api')) return 'api_base';
  if (preferredTransport === 'session' || endpointHints.includes('session')) return 'portal_login';
  return 'generic_entry';
}

function detectEndpointTarget(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    return `${host}${parsed.pathname || '/'}`;
  } catch {
    return 'unresolved';
  }
}

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

function buildModulePlans(modules: string[], transport: ErpTransport) {
  return modules.map((module) => ({
    module,
    transport,
    resourceHints: buildResourceHints(module, transport),
    strategy: buildStrategy(transport),
    purpose: inferPurpose(module),
  }));
}

function buildBootstrapRequests(mode: ErpBootstrapMode, modules: string[], transport: ErpTransport) {
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

function buildReadonlyGuards(transport: ErpTransport) {
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

function buildValidationWarnings(
  definition: DatasourceDefinition,
  modules: string[],
  authKind: ErpExecutionPlan['authKind'],
) {
  const warnings: string[] = [];
  if (authKind === 'none') warnings.push('Missing ERP authentication mode');
  if (!definition.credentialRef?.id && authKind === 'credential') warnings.push('Credential auth mode is selected but no credential is bound');
  if (!modules.length || (modules.length === 1 && modules[0] === 'default_erp_scope')) {
    warnings.push('No concrete ERP business modules were identified');
  }
  return warnings;
}

function detectExecutionReadiness(
  modules: string[],
  authKind: ErpExecutionPlan['authKind'],
): ErpExecutionReadiness {
  if (authKind === 'none') return 'needs_auth';
  if (!modules.length || (modules.length === 1 && modules[0] === 'default_erp_scope')) return 'needs_scope';
  return 'ready';
}

function buildExecutionSteps(plan: Pick<ErpExecutionPlan, 'systemLabel' | 'endpointTarget' | 'preferredTransport' | 'bootstrapMode' | 'executionReadiness' | 'bootstrapRequests' | 'readonlyGuards' | 'modulePlans'>) {
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

export function buildErpExecutionPlan(definition: DatasourceDefinition): ErpExecutionPlan {
  const modules = inferModules(definition);
  const endpointHints = inferEndpointHints(definition);
  const systemLabel = definition.name;
  const endpointTarget = detectEndpointTarget(String(definition.config?.url || ''));
  const authKind =
    definition.authMode === 'credential' || definition.authMode === 'manual_session' || definition.authMode === 'api_token'
      ? definition.authMode
      : 'none';
  const preferredTransport = inferTransport(endpointHints, authKind);
  const bootstrapMode = inferBootstrapMode(endpointHints, preferredTransport);
  const modulePlans = buildModulePlans(modules, preferredTransport);
  const bootstrapRequests = buildBootstrapRequests(bootstrapMode, modules, preferredTransport);
  const readonlyGuards = buildReadonlyGuards(preferredTransport);
  const validationWarnings = buildValidationWarnings(definition, modules, authKind);
  const executionReadiness = detectExecutionReadiness(modules, authKind);
  const executionSteps = buildExecutionSteps({
    systemLabel,
    endpointTarget,
    preferredTransport,
    bootstrapMode,
    executionReadiness,
    bootstrapRequests,
    readonlyGuards,
    modulePlans,
  });
  const summary = validationWarnings.length
    ? `Readonly ERP execution plan created for ${endpointTarget}, but ${validationWarnings.length} checks still need attention.`
    : `Readonly ERP execution plan is ready for ${endpointTarget}; bootstrap ${bootstrapRequests.length} requests, apply ${readonlyGuards.length} guards, then read ${modules.join(', ')}.`;

  return {
    systemLabel,
    endpointTarget,
    modules,
    authKind,
    endpointHints,
    preferredTransport,
    bootstrapMode,
    bootstrapRequests,
    readonlyGuards,
    modulePlans,
    executionReadiness,
    supportsReadonlyExecution: true,
    executionSteps,
    validationWarnings,
    summary,
  };
}

export function buildErpRunSummaryItems(plan: ErpExecutionPlan): DatasourceRunSummaryItem[] {
  return plan.executionSteps;
}
