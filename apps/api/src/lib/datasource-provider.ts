import type {
  DatasourceDefinition,
  DatasourceKind,
  DatasourceRun,
  DatasourceScheduleKind,
  DatasourceStatus,
  DatasourceTargetLibrary,
} from './datasource-definitions.js';

export type DatasourceCapability =
  | 'discover'
  | 'extract'
  | 'ingest'
  | 'login'
  | 'database-read'
  | 'erp-sync'
  | 'schedule';

export type DatasourceProviderRuntime = {
  datasourceId: string;
  kind: DatasourceKind;
  status: DatasourceStatus;
  lastRunAt?: string;
  nextRunAt?: string;
  lastStatus?: DatasourceRun['status'] | 'idle';
  lastSummary?: string;
  discoveredCount?: number;
  capturedCount?: number;
  ingestedCount?: number;
  documentIds?: string[];
  documentLabels?: string[];
};

export type DatasourceProviderSummary = {
  id: string;
  name: string;
  kind: DatasourceKind;
  status: DatasourceStatus;
  schedule: DatasourceScheduleKind;
  targetLibraries: DatasourceTargetLibrary[];
  capabilities: DatasourceCapability[];
  notes?: string;
  executionHints?: string[];
  runtime?: DatasourceProviderRuntime | null;
};

export type DatasourceProvider = {
  kind: DatasourceKind;
  capabilities: DatasourceCapability[];
  supports(definition: DatasourceDefinition): boolean;
  summarize(definition: DatasourceDefinition, runs: DatasourceRun[]): Promise<DatasourceProviderSummary>;
};
