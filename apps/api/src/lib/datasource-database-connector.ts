import type { DatasourceDefinition } from './datasource-definitions.js';

export type DatabaseExecutionPlan = {
  connectionLabel: string;
  dialect: 'postgres' | 'mysql' | 'sqlserver' | 'oracle' | 'sqlite' | 'unknown';
  databaseName: string;
  queryTargets: string[];
  summary: string;
};

function splitHints(value: unknown) {
  return String(value || '')
    .split(/[,\n，]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function detectDialect(url: string): DatabaseExecutionPlan['dialect'] {
  const lowered = url.toLowerCase();
  if (lowered.startsWith('postgres://') || lowered.startsWith('postgresql://')) return 'postgres';
  if (lowered.startsWith('mysql://')) return 'mysql';
  if (lowered.startsWith('sqlserver://') || lowered.includes('server=')) return 'sqlserver';
  if (lowered.startsWith('oracle://')) return 'oracle';
  if (lowered.startsWith('sqlite://') || lowered.endsWith('.db')) return 'sqlite';
  return 'unknown';
}

function detectDatabaseName(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/+/, '') || 'default';
  } catch {
    return 'default';
  }
}

function inferTargets(definition: DatasourceDefinition) {
  const keywords = Array.isArray(definition.config?.keywords) ? definition.config.keywords : [];
  const siteHints = Array.isArray(definition.config?.siteHints) ? definition.config.siteHints : [];
  const raw = [
    ...keywords.map(String),
    ...siteHints.map(String),
    ...splitHints(definition.config?.focus),
    ...splitHints(definition.notes),
  ];

  const normalized = new Set<string>();
  for (const entry of raw) {
    const lowered = entry.toLowerCase();
    if (/order|订单/.test(lowered)) normalized.add('orders');
    if (/complaint|客诉|售后/.test(lowered)) normalized.add('complaints');
    if (/inventory|库存|备货/.test(lowered)) normalized.add('inventory');
    if (/refund|退款|退货/.test(lowered)) normalized.add('refunds');
    if (/customer|客户/.test(lowered)) normalized.add('customers');
    if (/payment|回款|收款/.test(lowered)) normalized.add('payments');
    if (/invoice|发票/.test(lowered)) normalized.add('invoices');
    if (/product|商品|sku/.test(lowered)) normalized.add('products');
  }

  if (!normalized.size) normalized.add('default_query_scope');
  return Array.from(normalized).slice(0, 8);
}

export function buildDatabaseExecutionPlan(definition: DatasourceDefinition): DatabaseExecutionPlan {
  const url = String(definition.config?.url || '');
  const dialect = detectDialect(url);
  const databaseName = detectDatabaseName(url);
  const queryTargets = inferTargets(definition);
  const connectionLabel = definition.credentialRef?.label || definition.name;
  const summary = `数据库连接骨架已就绪，已识别 ${queryTargets.length} 个抽取对象：${queryTargets.join('、')}。待连接器接入后将按这些对象执行真实抽取。`;

  return {
    connectionLabel,
    dialect,
    databaseName,
    queryTargets,
    summary,
  };
}
