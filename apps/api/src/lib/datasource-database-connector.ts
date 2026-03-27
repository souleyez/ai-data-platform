import type { DatasourceDefinition } from './datasource-definitions.js';

export type DatabaseDialect = 'postgres' | 'mysql' | 'sqlserver' | 'oracle' | 'sqlite' | 'unknown';

export type DatabaseExecutionPlan = {
  connectionLabel: string;
  dialect: DatabaseDialect;
  databaseName: string;
  queryTargets: string[];
  queryScopes: string[];
  connectionMode: 'url' | 'credential_ref' | 'hybrid' | 'missing';
  validationWarnings: string[];
  summary: string;
};

function splitHints(value: unknown) {
  return String(value || '')
    .split(/[,\n;/]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function detectDialect(url: string): DatabaseDialect {
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
  const explicitTables = Array.isArray(definition.config?.tables) ? definition.config.tables.map(String) : [];
  const explicitViews = Array.isArray(definition.config?.views) ? definition.config.views.map(String) : [];
  const raw = [
    ...keywords.map(String),
    ...siteHints.map(String),
    ...explicitTables,
    ...explicitViews,
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

  for (const table of explicitTables) normalized.add(table);
  for (const view of explicitViews) normalized.add(view);
  if (!normalized.size) normalized.add('default_query_scope');
  return Array.from(normalized).slice(0, 12);
}

function inferQueryScopes(definition: DatasourceDefinition) {
  const scopes = new Set<string>();
  const text = [
    ...splitHints(definition.config?.focus),
    ...splitHints(definition.notes),
    ...((Array.isArray(definition.config?.keywords) ? definition.config.keywords : []).map(String)),
  ]
    .join(' ')
    .toLowerCase();

  if (/增量|incremental|最近|近30天/.test(text)) scopes.add('incremental_window');
  if (/全量|full/.test(text)) scopes.add('full_sync');
  if (/按日|daily/.test(text)) scopes.add('daily_partition');
  if (/按月|monthly/.test(text)) scopes.add('monthly_partition');
  if (!scopes.size) scopes.add('default_window');
  return Array.from(scopes);
}

function detectConnectionMode(definition: DatasourceDefinition, url: string): DatabaseExecutionPlan['connectionMode'] {
  const hasUrl = Boolean(url);
  const hasCredentialRef = Boolean(definition.credentialRef?.id);
  if (hasUrl && hasCredentialRef) return 'hybrid';
  if (hasUrl) return 'url';
  if (hasCredentialRef) return 'credential_ref';
  return 'missing';
}

function buildValidationWarnings(
  definition: DatasourceDefinition,
  dialect: DatabaseDialect,
  queryTargets: string[],
  connectionMode: DatabaseExecutionPlan['connectionMode'],
) {
  const warnings: string[] = [];
  if (connectionMode === 'missing') warnings.push('缺少数据库连接信息');
  if (dialect === 'unknown') warnings.push('尚未识别数据库类型');
  if (!queryTargets.length || (queryTargets.length === 1 && queryTargets[0] === 'default_query_scope')) {
    warnings.push('尚未识别明确的抽取对象');
  }
  if (definition.authMode !== 'database_password') {
    warnings.push('数据库数据源通常建议使用数据库认证方式');
  }
  return warnings;
}

export function buildDatabaseExecutionPlan(definition: DatasourceDefinition): DatabaseExecutionPlan {
  const url = String(definition.config?.url || '');
  const dialect = detectDialect(url);
  const databaseName = detectDatabaseName(url);
  const queryTargets = inferTargets(definition);
  const queryScopes = inferQueryScopes(definition);
  const connectionLabel = definition.credentialRef?.label || definition.name;
  const connectionMode = detectConnectionMode(definition, url);
  const validationWarnings = buildValidationWarnings(definition, dialect, queryTargets, connectionMode);
  const summary = validationWarnings.length
    ? `数据库连接骨架已建立，识别到 ${queryTargets.length} 个抽取对象，但仍有 ${validationWarnings.length} 项待确认：${validationWarnings.join('、')}。`
    : `数据库连接骨架已就绪，已识别 ${queryTargets.length} 个抽取对象：${queryTargets.join('、')}。待真实连接器接入后将按这些对象执行只读抽取。`;

  return {
    connectionLabel,
    dialect,
    databaseName,
    queryTargets,
    queryScopes,
    connectionMode,
    validationWarnings,
    summary,
  };
}
