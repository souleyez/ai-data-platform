import type { DatasourceDefinition, DatasourceRunSummaryItem } from './datasource-definitions.js';
import {
  buildBootstrapRequests,
  buildExecutionSteps,
  buildModulePlans,
  buildReadonlyGuards,
} from './datasource-erp-connector-modules.js';
import {
  buildValidationWarnings,
  detectEndpointTarget,
  detectExecutionReadiness,
  inferBootstrapMode,
  inferEndpointHints,
  inferModules,
  inferTransport,
} from './datasource-erp-connector-support.js';
import type { ErpExecutionPlan } from './datasource-erp-connector-types.js';
export type {
  ErpBootstrapMode,
  ErpBootstrapRequest,
  ErpExecutionPlan,
  ErpExecutionReadiness,
  ErpModulePlan,
  ErpReadonlyGuard,
  ErpTransport,
} from './datasource-erp-connector-types.js';

export function buildErpExecutionPlan(definition: DatasourceDefinition): ErpExecutionPlan {
  const modules = inferModules(definition);
  const endpointHints = inferEndpointHints(definition);
  const systemLabel = definition.name;
  const endpointTarget = detectEndpointTarget(String(definition.config?.url || ''));
  const authKind =
    definition.authMode === 'credential' || definition.authMode === 'manual_session' || definition.authMode === 'api_token'
      ? definition.authMode
      : 'none';
  const preferredTransport = inferTransport(endpointHints, authKind);
  const bootstrapMode = inferBootstrapMode(endpointHints, preferredTransport);
  const modulePlans = buildModulePlans(modules, preferredTransport);
  const bootstrapRequests = buildBootstrapRequests(bootstrapMode, modules, preferredTransport);
  const readonlyGuards = buildReadonlyGuards(preferredTransport);
  const validationWarnings = buildValidationWarnings(definition, modules, authKind);
  const executionReadiness = detectExecutionReadiness(modules, authKind);
  const executionSteps = buildExecutionSteps({
    systemLabel,
    endpointTarget,
    preferredTransport,
    bootstrapMode,
    executionReadiness,
    bootstrapRequests,
    readonlyGuards,
    modulePlans,
  });
  const summary = validationWarnings.length
    ? `Readonly ERP execution plan created for ${endpointTarget}, but ${validationWarnings.length} checks still need attention.`
    : `Readonly ERP execution plan is ready for ${endpointTarget}; bootstrap ${bootstrapRequests.length} requests, apply ${readonlyGuards.length} guards, then read ${modules.join(', ')}.`;

  return {
    systemLabel,
    endpointTarget,
    modules,
    authKind,
    endpointHints,
    preferredTransport,
    bootstrapMode,
    bootstrapRequests,
    readonlyGuards,
    modulePlans,
    executionReadiness,
    supportsReadonlyExecution: true,
    executionSteps,
    validationWarnings,
    summary,
  };
}

export function buildErpRunSummaryItems(plan: ErpExecutionPlan): DatasourceRunSummaryItem[] {
  return plan.executionSteps;
}
