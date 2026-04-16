import type { DatasourceDefinition, DatasourceRunSummaryItem } from './datasource-definitions.js';
import type {
  DatabaseConnectionProbeCheck,
  DatabaseDialect,
  DatabaseQueryPlan,
  DatabaseQueryScope,
  DatabaseReadonlyGuard,
  DatabaseTargetKind,
} from './datasource-database-connector-types.js';

export function compactSqlPreview(sql: string) {
  return String(sql || '').replace(/\s+/g, ' ').trim().slice(0, 220);
}

function splitHints(value: unknown) {
  return String(value || '')
    .split(/[,\n;/]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function detectDialect(url: string): DatabaseDialect {
  const lowered = url.toLowerCase();
  if (lowered.startsWith('postgres://') || lowered.startsWith('postgresql://')) return 'postgres';
  if (lowered.startsWith('mysql://')) return 'mysql';
  if (lowered.startsWith('sqlserver://') || lowered.startsWith('mssql://') || lowered.includes('server=')) return 'sqlserver';
  if (lowered.startsWith('oracle://')) return 'oracle';
  if (lowered.startsWith('sqlite://') || lowered.endsWith('.db')) return 'sqlite';
  return 'unknown';
}

export function detectDatabaseName(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/+/, '') || 'default';
  } catch {
    return 'default';
  }
}

export function detectConnectionTarget(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    const dbName = parsed.pathname.replace(/^\/+/, '') || 'default';
    return `${host}/${dbName}`;
  } catch {
    if (url.endsWith('.db')) return url;
    return 'unresolved';
  }
}

export function inferTargets(definition: DatasourceDefinition) {
  const explicitTables = Array.isArray(definition.config?.tables) ? definition.config.tables.map(String) : [];
  const explicitViews = Array.isArray(definition.config?.views) ? definition.config.views.map(String) : [];
  const raw = [
    ...((Array.isArray(definition.config?.keywords) ? definition.config.keywords : []).map(String)),
    ...((Array.isArray(definition.config?.siteHints) ? definition.config.siteHints : []).map(String)),
    ...explicitTables,
    ...explicitViews,
    ...splitHints(definition.config?.focus),
    ...splitHints(definition.notes),
  ];

  const normalized = new Set<string>();
  for (const entry of raw) {
    const lowered = entry.toLowerCase();
    if (/order|订单/.test(lowered)) normalized.add('orders');
    if (/complaint|客诉|投诉|售后/.test(lowered)) normalized.add('complaints');
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

export function inferQueryScopes(definition: DatasourceDefinition) {
  const scopes = new Set<DatabaseQueryScope>();
  const text = [
    ...splitHints(definition.config?.focus),
    ...splitHints(definition.notes),
    ...((Array.isArray(definition.config?.keywords) ? definition.config.keywords : []).map(String)),
  ]
    .join(' ')
    .toLowerCase();

  if (/增量|incremental|最近|last ?30 ?days/.test(text)) scopes.add('incremental_window');
  if (/全量|full/.test(text)) scopes.add('full_sync');
  if (/按日|daily/.test(text)) scopes.add('daily_partition');
  if (/按月|monthly/.test(text)) scopes.add('monthly_partition');
  if (!scopes.size) scopes.add('default_window');
  return Array.from(scopes);
}

function quoteIdentifier(dialect: DatabaseDialect, value: string) {
  if (dialect === 'sqlserver') return `[${value}]`;
  if (dialect === 'mysql') return `\`${value}\``;
  return `"${value}"`;
}

export function inferTargetKind(target: string): DatabaseTargetKind {
  if (target === 'default_query_scope') return 'scope';
  if (/view$/i.test(target) || target.includes('view')) return 'view';
  return 'table';
}

function buildWhereClause(scope: DatabaseQueryScope, dialect: DatabaseDialect) {
  switch (scope) {
    case 'incremental_window':
      if (dialect === 'mysql') return 'WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
      if (dialect === 'sqlserver') return 'WHERE updated_at >= DATEADD(day, -30, GETDATE())';
      if (dialect === 'oracle') return 'WHERE updated_at >= SYSDATE - 30';
      return 'WHERE updated_at >= CURRENT_TIMESTAMP - INTERVAL \'30 days\'';
    case 'daily_partition':
      if (dialect === 'mysql') return 'WHERE DATE(updated_at) = CURRENT_DATE';
      if (dialect === 'sqlserver') return 'WHERE CAST(updated_at AS date) = CAST(GETDATE() AS date)';
      if (dialect === 'oracle') return 'WHERE TRUNC(updated_at) = TRUNC(SYSDATE)';
      return 'WHERE DATE(updated_at) = CURRENT_DATE';
    case 'monthly_partition':
      if (dialect === 'mysql') return 'WHERE DATE_FORMAT(updated_at, \'%Y-%m\') = DATE_FORMAT(CURRENT_DATE, \'%Y-%m\')';
      if (dialect === 'sqlserver') return 'WHERE FORMAT(updated_at, \'yyyy-MM\') = FORMAT(GETDATE(), \'yyyy-MM\')';
      if (dialect === 'oracle') return 'WHERE TO_CHAR(updated_at, \'YYYY-MM\') = TO_CHAR(SYSDATE, \'YYYY-MM\')';
      return 'WHERE DATE_TRUNC(\'month\', updated_at) = DATE_TRUNC(\'month\', CURRENT_TIMESTAMP)';
    case 'full_sync':
    case 'default_window':
    default:
      return '';
  }
}

export function buildReadonlySqlPreview(dialect: DatabaseDialect, target: string, scope: DatabaseQueryScope, limit: number) {
  const identifier = quoteIdentifier(dialect, target === 'default_query_scope' ? 'business_snapshot' : target);
  const whereClause = buildWhereClause(scope, dialect);
  if (dialect === 'sqlserver') {
    return `SELECT TOP ${limit} * FROM ${identifier} ${whereClause}`.trim();
  }
  return `SELECT * FROM ${identifier} ${whereClause} LIMIT ${limit}`.trim();
}

export function buildConnectionProbeChecks(dialect: DatabaseDialect, connectionTarget: string) {
  const checks: DatabaseConnectionProbeCheck[] = [
    { label: 'ping', sqlPreview: 'SELECT 1', purpose: `Verify readonly connectivity for ${connectionTarget}` },
  ];
  if (dialect === 'mysql') {
    checks.push({
      label: 'identity',
      sqlPreview: 'SELECT DATABASE() AS current_database, CURRENT_USER() AS current_user',
      purpose: 'Confirm current database and login identity',
    });
  } else if (dialect === 'sqlserver') {
    checks.push({
      label: 'identity',
      sqlPreview: 'SELECT DB_NAME() AS current_database, SUSER_SNAME() AS current_user',
      purpose: 'Confirm current database and login identity',
    });
  } else if (dialect === 'oracle') {
    checks.push({
      label: 'identity',
      sqlPreview: 'SELECT SYS_CONTEXT(\'USERENV\', \'DB_NAME\') AS current_database FROM dual',
      purpose: 'Confirm current database context',
    });
  } else {
    checks.push({
      label: 'identity',
      sqlPreview: 'SELECT current_database() AS current_database, current_user AS current_user',
      purpose: 'Confirm current database and login identity',
    });
  }
  return checks;
}

export function buildReadonlyGuards(dialect: DatabaseDialect) {
  if (dialect === 'mysql') {
    return [
      { label: 'transaction_readonly', sqlPreview: 'SET SESSION TRANSACTION READ ONLY', purpose: 'Enforce readonly session before extraction' },
      { label: 'mutation_block', sqlPreview: 'SELECT @@transaction_read_only AS transaction_read_only', purpose: 'Verify writes are disabled for the session' },
    ] satisfies DatabaseReadonlyGuard[];
  }
  if (dialect === 'sqlserver') {
    return [
      { label: 'snapshot_guard', sqlPreview: 'SET TRANSACTION ISOLATION LEVEL SNAPSHOT', purpose: 'Use non-mutating snapshot isolation for reads' },
      { label: 'updateability_check', sqlPreview: 'SELECT DATABASEPROPERTYEX(DB_NAME(), \'Updateability\') AS updateability', purpose: 'Verify database access mode before extraction' },
    ] satisfies DatabaseReadonlyGuard[];
  }
  if (dialect === 'oracle') {
    return [
      { label: 'transaction_readonly', sqlPreview: 'SET TRANSACTION READ ONLY', purpose: 'Enforce readonly transaction before extraction' },
      { label: 'open_mode_check', sqlPreview: 'SELECT open_mode FROM v$database', purpose: 'Verify database mode before extraction' },
    ] satisfies DatabaseReadonlyGuard[];
  }
  return [
    { label: 'transaction_readonly', sqlPreview: 'SET TRANSACTION READ ONLY', purpose: 'Enforce readonly transaction before extraction' },
    { label: 'mutation_block', sqlPreview: 'SHOW transaction_read_only', purpose: 'Verify writes are disabled for the session' },
  ] satisfies DatabaseReadonlyGuard[];
}

export function inferPurpose(target: string) {
  switch (target) {
    case 'orders': return 'Read the order fact tables and status history';
    case 'complaints': return 'Read complaints, tickets and after-sales issues';
    case 'inventory': return 'Read inventory, replenishment and stock risk data';
    case 'refunds': return 'Read refund and return records';
    case 'customers': return 'Read customer master data and segments';
    case 'payments': return 'Read payment and collection status';
    case 'invoices': return 'Read invoice and billing status';
    case 'products': return 'Read product, SKU and category data';
    default: return 'Read the default business snapshot scope';
  }
}

export function buildExecutionStepsSummaryItems(items: {
  databaseName: string;
  connectionTarget: string;
  dialect: DatabaseDialect;
  connectionMode: string;
  credentialSource: string;
  executionReadiness: string;
  connectionProbeChecks: DatabaseConnectionProbeCheck[];
  readonlyGuards: DatabaseReadonlyGuard[];
  queryPlans: DatabaseQueryPlan[];
}) {
  return [
    {
      id: `db:${items.databaseName}:connection`,
      label: 'connection',
      summary: `target ${items.connectionTarget} | dialect ${items.dialect} | connection ${items.connectionMode} | credential ${items.credentialSource} | readiness ${items.executionReadiness}`,
    },
    ...items.connectionProbeChecks.slice(0, 2).map((item) => ({
      id: `db:${items.databaseName}:probe:${item.label}`,
      label: `probe:${item.label}`,
      summary: `${item.purpose} | ${compactSqlPreview(item.sqlPreview)}`,
    })),
    ...items.readonlyGuards.slice(0, 2).map((item) => ({
      id: `db:${items.databaseName}:guard:${item.label}`,
      label: `guard:${item.label}`,
      summary: `${item.purpose} | ${compactSqlPreview(item.sqlPreview)}`,
    })),
    ...items.queryPlans.slice(0, 8).map((item) => ({
      id: `db:${items.databaseName}:${item.target}`,
      label: item.target,
      summary: `${item.purpose} | ${item.filterMode} | ${compactSqlPreview(item.sqlPreview)}`,
    })),
  ] satisfies DatasourceRunSummaryItem[];
}
