import type { DatasourceDefinition } from './datasource-definitions.js';
import type {
  DatabaseConnectionMode,
  DatabaseCredentialSource,
  DatabaseDialect,
  DatabaseExecutionPlan,
  DatabaseExecutionPlanOptions,
  DatabaseExecutionReadiness,
  DatabaseQueryPlan,
  DatabaseQueryScope,
} from './datasource-database-connector-types.js';
import {
  buildConnectionProbeChecks,
  buildExecutionStepsSummaryItems,
  buildReadonlyGuards,
  buildReadonlySqlPreview,
  detectConnectionTarget,
  detectDatabaseName,
  detectDialect,
  inferPurpose,
  inferQueryScopes,
  inferTargetKind,
  inferTargets,
} from './datasource-database-connector-targets.js';

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
  if (definition.authMode !== 'database_password') warnings.push('Readonly database execution expects database_password auth mode');
  if (definition.config?.rawSql) warnings.push('Raw SQL was detected; the connector only emits readonly templates and does not run raw SQL');
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

export function buildDatabaseExecutionPlanSupport(
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
  const executionSteps = buildExecutionStepsSummaryItems({
    databaseName,
    connectionTarget,
    dialect,
    connectionMode,
    credentialSource,
    executionReadiness,
    connectionProbeChecks,
    readonlyGuards,
    queryPlans,
  });
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
