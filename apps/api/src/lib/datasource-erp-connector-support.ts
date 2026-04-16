import type { DatasourceDefinition } from './datasource-definitions.js';
import type {
  ErpBootstrapMode,
  ErpExecutionPlan,
  ErpExecutionReadiness,
  ErpTransport,
} from './datasource-erp-connector-types.js';

export function splitHints(value: unknown) {
  return String(value || '')
    .split(/[,\n;/]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function inferModules(definition: DatasourceDefinition) {
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

export function inferEndpointHints(definition: DatasourceDefinition) {
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

export function inferTransport(endpointHints: string[], authKind: ErpExecutionPlan['authKind']): ErpTransport {
  if (endpointHints.includes('api') || authKind === 'api_token') return 'api';
  if (endpointHints.includes('session') || authKind === 'manual_session' || authKind === 'credential') return 'session';
  return 'generic';
}

export function inferBootstrapMode(endpointHints: string[], preferredTransport: ErpTransport): ErpBootstrapMode {
  if (preferredTransport === 'api' || endpointHints.includes('api')) return 'api_base';
  if (preferredTransport === 'session' || endpointHints.includes('session')) return 'portal_login';
  return 'generic_entry';
}

export function detectEndpointTarget(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    return `${host}${parsed.pathname || '/'}`;
  } catch {
    return 'unresolved';
  }
}

export function buildValidationWarnings(
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

export function detectExecutionReadiness(
  modules: string[],
  authKind: ErpExecutionPlan['authKind'],
): ErpExecutionReadiness {
  if (authKind === 'none') return 'needs_auth';
  if (!modules.length || (modules.length === 1 && modules[0] === 'default_erp_scope')) return 'needs_scope';
  return 'ready';
}
