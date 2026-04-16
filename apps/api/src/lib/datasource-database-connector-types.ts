import type { DatasourceRunSummaryItem } from './datasource-definitions.js';

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
