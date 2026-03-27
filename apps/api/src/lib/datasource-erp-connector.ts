import type { DatasourceDefinition } from './datasource-definitions.js';

export type ErpExecutionPlan = {
  systemLabel: string;
  modules: string[];
  authKind: 'credential' | 'manual_session' | 'api_token' | 'none';
  endpointHints: string[];
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
  ];

  const modules = new Set<string>();
  for (const entry of raw) {
    const lowered = entry.toLowerCase();
    if (/order|订单/.test(lowered)) modules.add('orders');
    if (/complaint|客诉|售后/.test(lowered)) modules.add('complaints');
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
  if (/金蝶|kingdee/.test(text)) hints.add('kingdee');
  if (/用友|yonyou|u8|nc/.test(text)) hints.add('yonyou');
  if (!hints.size) hints.add('generic_erp');
  return Array.from(hints);
}

function buildValidationWarnings(definition: DatasourceDefinition, modules: string[], authKind: ErpExecutionPlan['authKind']) {
  const warnings: string[] = [];
  if (authKind === 'none') warnings.push('缺少 ERP 认证方式');
  if (!definition.credentialRef?.id && authKind === 'credential') warnings.push('尚未绑定 ERP 凭据');
  if (!modules.length || (modules.length === 1 && modules[0] === 'default_erp_scope')) {
    warnings.push('尚未识别明确的业务模块');
  }
  return warnings;
}

export function buildErpExecutionPlan(definition: DatasourceDefinition): ErpExecutionPlan {
  const modules = inferModules(definition);
  const endpointHints = inferEndpointHints(definition);
  const systemLabel = definition.name;
  const authKind =
    definition.authMode === 'credential' || definition.authMode === 'manual_session' || definition.authMode === 'api_token'
      ? definition.authMode
      : 'none';
  const validationWarnings = buildValidationWarnings(definition, modules, authKind);
  const summary = validationWarnings.length
    ? `ERP 连接骨架已建立，识别到 ${modules.length} 个业务模块，但仍有 ${validationWarnings.length} 项待确认：${validationWarnings.join('、')}。`
    : `ERP 连接骨架已就绪，已识别 ${modules.length} 个业务模块：${modules.join('、')}。待真实连接器接入后将按这些模块执行同步。`;

  return {
    systemLabel,
    modules,
    authKind,
    endpointHints,
    validationWarnings,
    summary,
  };
}
