import type { DatasourceDefinition } from './datasource-definitions.js';

export type ErpExecutionPlan = {
  systemLabel: string;
  modules: string[];
  authKind: 'credential' | 'manual_session' | 'api_token' | 'none';
  summary: string;
};

function splitHints(value: unknown) {
  return String(value || '')
    .split(/[,\n，]/)
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

export function buildErpExecutionPlan(definition: DatasourceDefinition): ErpExecutionPlan {
  const modules = inferModules(definition);
  const systemLabel = definition.name;
  const authKind = definition.authMode === 'credential'
    || definition.authMode === 'manual_session'
    || definition.authMode === 'api_token'
    ? definition.authMode
    : 'none';
  const summary = `ERP 连接骨架已就绪，已识别 ${modules.length} 个业务模块：${modules.join('、')}。待连接器接入后将按这些模块执行真实同步。`;

  return {
    systemLabel,
    modules,
    authKind,
    summary,
  };
}
