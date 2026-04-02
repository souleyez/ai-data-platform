import type {
  DatasourceDefinition,
  DatasourceKind,
  DatasourceRun,
  DatasourceRunSummaryItem,
  DatasourceScheduleKind,
  DatasourceStatus,
  DatasourceTargetLibrary,
} from './datasource-definitions.js';

export type DatasourceCapability =
  | 'discover'
  | 'extract'
  | 'ingest'
  | 'upload-submit'
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
  skippedCount?: number;
  unsupportedCount?: number;
  failedCount?: number;
  groupedCount?: number;
  ungroupedCount?: number;
  libraryKeys?: string[];
  libraryLabels?: string[];
  documentIds?: string[];
  documentLabels?: string[];
  documentSummaries?: Array<{
    id: string;
    label: string;
    summary: string;
  }>;
  resultSummaries?: DatasourceRunSummaryItem[];
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
  publicPath?: string;
  runtime?: DatasourceProviderRuntime | null;
};

export type DatasourceProvider = {
  kind: DatasourceKind;
  capabilities: DatasourceCapability[];
  supports(definition: DatasourceDefinition): boolean;
  summarize(definition: DatasourceDefinition, runs: DatasourceRun[]): Promise<DatasourceProviderSummary>;
};
