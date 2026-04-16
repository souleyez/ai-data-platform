import type { DatasourceRunSummaryItem } from './datasource-definitions.js';

export type ErpTransport = 'api' | 'session' | 'generic';
export type ErpBootstrapMode = 'api_base' | 'portal_login' | 'generic_entry';
export type ErpExecutionReadiness = 'ready' | 'needs_auth' | 'needs_scope';

export type ErpBootstrapRequest = {
  label: string;
  method: 'GET' | 'POST';
  path: string;
  purpose: string;
  requiresAuth: boolean;
};

export type ErpReadonlyGuard = {
  label: string;
  rule: string;
};

export type ErpModulePlan = {
  module: string;
  transport: ErpTransport;
  resourceHints: string[];
  strategy: 'list_then_detail' | 'portal_export' | 'dashboard_snapshot';
  purpose: string;
};

export type ErpExecutionPlan = {
  systemLabel: string;
  endpointTarget: string;
  modules: string[];
  authKind: 'credential' | 'manual_session' | 'api_token' | 'none';
  endpointHints: string[];
  preferredTransport: ErpTransport;
  bootstrapMode: ErpBootstrapMode;
  bootstrapRequests: ErpBootstrapRequest[];
  readonlyGuards: ErpReadonlyGuard[];
  modulePlans: ErpModulePlan[];
  executionReadiness: ErpExecutionReadiness;
  supportsReadonlyExecution: boolean;
  executionSteps: DatasourceRunSummaryItem[];
  validationWarnings: string[];
  summary: string;
};
