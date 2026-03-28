import type { DatasourceDefinition, DatasourceRunSummaryItem } from './datasource-definitions.js';

export type DatabaseDialect = 'postgres' | 'mysql' | 'sqlserver' | 'oracle' | 'sqlite' | 'unknown';
export type DatabaseConnectionMode = 'url' | 'credential_ref' | 'hybrid' | 'missing';
export type DatabaseCredentialSource = 'config_url' | 'credential_secret' | 'hybrid' | 'missing';
export type DatabaseQueryScope =
  | 'incremental_window'
  | 'full_sync'
  | 'daily_partition'
  | 'monthly_partition'
  | 'default_window';
export type DatabaseTargetKind = 'table' | 'view' | 'scope';
export type DatabaseExecutionReadiness = 'ready' | 'needs_connection' | 'needs_scope' | 'needs_auth';

export type DatabaseConnectionProbeCheck = {
  label: string;
  sqlPreview: string;
  purpose: string;
};

export type DatabaseReadonlyGuard = {
  label: string;
  sqlPreview: string;
  purpose: string;
};

export type DatabaseQueryPlan = {
  target: string;
  kind: DatabaseTargetKind;
  purpose: string;
  filterMode: DatabaseQueryScope;
  limit: number;
  sqlPreview: string;
};

export type DatabaseExecutionPlan = {
  connectionLabel: string;
  connectionTarget: string;
  dialect: DatabaseDialect;
  databaseName: string;
  queryTargets: string[];
  queryScopes: DatabaseQueryScope[];
  queryPlans: DatabaseQueryPlan[];
  connectionMode: DatabaseConnectionMode;
  credentialSource: DatabaseCredentialSource;
  executionReadiness: DatabaseExecutionReadiness;
  connectionProbeChecks: DatabaseConnectionProbeCheck[];
  readonlyGuards: DatabaseReadonlyGuard[];
  supportsReadonlyExecution: boolean;
  executionSteps: DatasourceRunSummaryItem[];
  validationWarnings: string[];
  summary: string;
};

export type DatabaseExecutionPlanOptions = {
  connectionString?: string;
};

function compactSqlPreview(sql: string) {
  return String(sql || '').replace(/\s+/g, ' ').trim().slice(0, 220);
}

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
  if (lowered.startsWith('sqlserver://') || lowered.startsWith('mssql://') || lowered.includes('server=')) return 'sqlserver';
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

function detectConnectionTarget(url: string) {
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

function inferTargets(definition: DatasourceDefinition) {
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

function inferQueryScopes(definition: DatasourceDefinition) {
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

function detectConnectionMode(definition: DatasourceDefinition, url: string): DatabaseConnectionMode {
  const hasUrl = Boolean(url);
  const hasCredentialRef = Boolean(definition.credentialRef?.id);
  if (hasUrl && hasCredentialRef) return 'hybrid';
  if (hasUrl) return 'url';
  if (hasCredentialRef) return 'credential_ref';
  return 'missing';
}

function detectCredentialSource(definition: DatasourceDefinition, connectionString: string): DatabaseCredentialSource {
  const hasConfigUrl = Boolean(definition.config?.url);
  const hasCredentialSecret = Boolean(connectionString);
  if (hasConfigUrl && hasCredentialSecret) return 'hybrid';
  if (hasCredentialSecret) return 'credential_secret';
  if (hasConfigUrl) return 'config_url';
  return 'missing';
}

function quoteIdentifier(dialect: DatabaseDialect, value: string) {
  if (dialect === 'sqlserver') return `[${value}]`;
  if (dialect === 'mysql') return `\`${value}\``;
  return `"${value}"`;
}

function inferTargetKind(target: string): DatabaseTargetKind {
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

function buildReadonlySqlPreview(dialect: DatabaseDialect, target: string, scope: DatabaseQueryScope, limit: number) {
  const identifier = quoteIdentifier(dialect, target === 'default_query_scope' ? 'business_snapshot' : target);
  const whereClause = buildWhereClause(scope, dialect);

  if (dialect === 'sqlserver') {
    return `SELECT TOP ${limit} * FROM ${identifier} ${whereClause}`.trim();
  }
  return `SELECT * FROM ${identifier} ${whereClause} LIMIT ${limit}`.trim();
}

function buildConnectionProbeChecks(dialect: DatabaseDialect, connectionTarget: string) {
  const checks: DatabaseConnectionProbeCheck[] = [
    {
      label: 'ping',
      sqlPreview: 'SELECT 1',
      purpose: `Verify readonly connectivity for ${connectionTarget}`,
    },
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

function buildReadonlyGuards(dialect: DatabaseDialect) {
  if (dialect === 'mysql') {
    return [
      {
        label: 'transaction_readonly',
        sqlPreview: 'SET SESSION TRANSACTION READ ONLY',
        purpose: 'Enforce readonly session before extraction',
      },
      {
        label: 'mutation_block',
        sqlPreview: 'SELECT @@transaction_read_only AS transaction_read_only',
        purpose: 'Verify writes are disabled for the session',
      },
    ] satisfies DatabaseReadonlyGuard[];
  }

  if (dialect === 'sqlserver') {
    return [
      {
        label: 'snapshot_guard',
        sqlPreview: 'SET TRANSACTION ISOLATION LEVEL SNAPSHOT',
        purpose: 'Use non-mutating snapshot isolation for reads',
      },
      {
        label: 'updateability_check',
        sqlPreview: 'SELECT DATABASEPROPERTYEX(DB_NAME(), \'Updateability\') AS updateability',
        purpose: 'Verify database access mode before extraction',
      },
    ] satisfies DatabaseReadonlyGuard[];
  }

  if (dialect === 'oracle') {
    return [
      {
        label: 'transaction_readonly',
        sqlPreview: 'SET TRANSACTION READ ONLY',
        purpose: 'Enforce readonly transaction before extraction',
      },
      {
        label: 'open_mode_check',
        sqlPreview: 'SELECT open_mode FROM v$database',
        purpose: 'Verify database mode before extraction',
      },
    ] satisfies DatabaseReadonlyGuard[];
  }

  return [
    {
      label: 'transaction_readonly',
      sqlPreview: 'SET TRANSACTION READ ONLY',
      purpose: 'Enforce readonly transaction before extraction',
    },
    {
      label: 'mutation_block',
      sqlPreview: 'SHOW transaction_read_only',
      purpose: 'Verify writes are disabled for the session',
    },
  ] satisfies DatabaseReadonlyGuard[];
}

function inferPurpose(target: string) {
  switch (target) {
    case 'orders':
      return 'Read the order fact tables and status history';
    case 'complaints':
      return 'Read complaints, tickets and after-sales issues';
    case 'inventory':
      return 'Read inventory, replenishment and stock risk data';
    case 'refunds':
      return 'Read refund and return records';
    case 'customers':
      return 'Read customer master data and segments';
    case 'payments':
      return 'Read payment and collection status';
    case 'invoices':
      return 'Read invoice and billing status';
    case 'products':
      return 'Read product, SKU and category data';
    default:
      return 'Read the default business snapshot scope';
  }
}

function buildQueryPlans(dialect: DatabaseDialect, queryTargets: string[], queryScopes: DatabaseQueryScope[]) {
  const scope = queryScopes[0] || 'default_window';
  return queryTargets.map((target) => ({
    target,
    kind: inferTargetKind(target),
    purpose: inferPurpose(target),
    filterMode: scope,
    limit: 200,
    sqlPreview: buildReadonlySqlPreview(dialect, target, scope, 200),
  })) satisfies DatabaseQueryPlan[];
}

function buildValidationWarnings(
  definition: DatasourceDefinition,
  dialect: DatabaseDialect,
  queryTargets: string[],
  connectionMode: DatabaseConnectionMode,
) {
  const warnings: string[] = [];
  if (connectionMode === 'missing') warnings.push('Missing database connection information');
  if (dialect === 'unknown') warnings.push('Database dialect could not be identified');
  if (!queryTargets.length || (queryTargets.length === 1 && queryTargets[0] === 'default_query_scope')) {
    warnings.push('No concrete readonly extraction targets were identified');
  }
  if (definition.authMode !== 'database_password') {
    warnings.push('Readonly database execution expects database_password auth mode');
  }
  if (definition.config?.rawSql) {
    warnings.push('Raw SQL was detected; the connector only emits readonly templates and does not run raw SQL');
  }
  return warnings;
}

function detectExecutionReadiness(
  queryTargets: string[],
  connectionMode: DatabaseConnectionMode,
  authMode: DatasourceDefinition['authMode'],
): DatabaseExecutionReadiness {
  if (connectionMode === 'missing') return 'needs_connection';
  if (!queryTargets.length || (queryTargets.length === 1 && queryTargets[0] === 'default_query_scope')) return 'needs_scope';
  if (authMode !== 'database_password') return 'needs_auth';
  return 'ready';
}

function buildExecutionSteps(
  databaseName: string,
  connectionTarget: string,
  dialect: DatabaseDialect,
  connectionMode: DatabaseConnectionMode,
  credentialSource: DatabaseCredentialSource,
  executionReadiness: DatabaseExecutionReadiness,
  connectionProbeChecks: DatabaseConnectionProbeCheck[],
  readonlyGuards: DatabaseReadonlyGuard[],
  queryPlans: DatabaseQueryPlan[],
) {
  return [
    {
      id: `db:${databaseName}:connection`,
      label: 'connection',
      summary: `target ${connectionTarget} | dialect ${dialect} | connection ${connectionMode} | credential ${credentialSource} | readiness ${executionReadiness}`,
    },
    ...connectionProbeChecks.slice(0, 2).map((item) => ({
      id: `db:${databaseName}:probe:${item.label}`,
      label: `probe:${item.label}`,
      summary: `${item.purpose} | ${compactSqlPreview(item.sqlPreview)}`,
    })),
    ...readonlyGuards.slice(0, 2).map((item) => ({
      id: `db:${databaseName}:guard:${item.label}`,
      label: `guard:${item.label}`,
      summary: `${item.purpose} | ${compactSqlPreview(item.sqlPreview)}`,
    })),
    ...queryPlans.slice(0, 8).map((item) => ({
      id: `db:${databaseName}:${item.target}`,
      label: item.target,
      summary: `${item.purpose} | ${item.filterMode} | ${compactSqlPreview(item.sqlPreview)}`,
    })),
  ] satisfies DatasourceRunSummaryItem[];
}

export function buildDatabaseExecutionPlan(
  definition: DatasourceDefinition,
  options: DatabaseExecutionPlanOptions = {},
): DatabaseExecutionPlan {
  const connectionString = String(options.connectionString || '').trim();
  const url = String(connectionString || definition.config?.url || '');
  const dialect = detectDialect(url);
  const databaseName = detectDatabaseName(url);
  const connectionTarget = detectConnectionTarget(url);
  const queryTargets = inferTargets(definition);
  const queryScopes = inferQueryScopes(definition);
  const connectionLabel = definition.credentialRef?.label || definition.name;
  const connectionMode = detectConnectionMode(definition, url);
  const credentialSource = detectCredentialSource(definition, connectionString);
  const queryPlans = buildQueryPlans(dialect, queryTargets, queryScopes);
  const connectionProbeChecks = buildConnectionProbeChecks(dialect, connectionTarget);
  const readonlyGuards = buildReadonlyGuards(dialect);
  const validationWarnings = buildValidationWarnings(definition, dialect, queryTargets, connectionMode);
  const executionReadiness = detectExecutionReadiness(queryTargets, connectionMode, definition.authMode);
  const executionSteps = buildExecutionSteps(
    databaseName,
    connectionTarget,
    dialect,
    connectionMode,
    credentialSource,
    executionReadiness,
    connectionProbeChecks,
    readonlyGuards,
    queryPlans,
  );
  const summary = validationWarnings.length
    ? `Readonly database execution plan created for ${connectionTarget}, but ${validationWarnings.length} checks still need attention.`
    : `Readonly database execution plan is ready for ${connectionTarget}; probe ${connectionProbeChecks.length} checks, enforce ${readonlyGuards.length} readonly guards, then extract ${queryTargets.join(', ')}.`;

  return {
    connectionLabel,
    connectionTarget,
    dialect,
    databaseName,
    queryTargets,
    queryScopes,
    queryPlans,
    connectionMode,
    credentialSource,
    executionReadiness,
    connectionProbeChecks,
    readonlyGuards,
    supportsReadonlyExecution: true,
    executionSteps,
    validationWarnings,
    summary,
  };
}

export function buildDatabaseRunSummaryItems(plan: DatabaseExecutionPlan): DatasourceRunSummaryItem[] {
  return plan.executionSteps;
}
