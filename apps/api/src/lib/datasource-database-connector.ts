import type { DatasourceRunSummaryItem } from './datasource-definitions.js';
import type { DatabaseExecutionPlan, DatabaseExecutionPlanOptions } from './datasource-database-connector-types.js';
import { buildDatabaseExecutionPlanSupport } from './datasource-database-connector-support.js';

export type {
  DatabaseConnectionMode,
  DatabaseConnectionProbeCheck,
  DatabaseCredentialSource,
  DatabaseDialect,
  DatabaseExecutionPlan,
  DatabaseExecutionPlanOptions,
  DatabaseExecutionReadiness,
  DatabaseQueryPlan,
  DatabaseQueryScope,
  DatabaseReadonlyGuard,
  DatabaseTargetKind,
} from './datasource-database-connector-types.js';

export function buildDatabaseExecutionPlan(
  definition: Parameters<typeof buildDatabaseExecutionPlanSupport>[0],
  options: DatabaseExecutionPlanOptions = {},
): DatabaseExecutionPlan {
  return buildDatabaseExecutionPlanSupport(definition, options);
}

export function buildDatabaseRunSummaryItems(plan: DatabaseExecutionPlan): DatasourceRunSummaryItem[] {
  return plan.executionSteps;
}
