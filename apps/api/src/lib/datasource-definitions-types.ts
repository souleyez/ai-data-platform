export const DATASOURCE_KINDS = [
  'web_public',
  'web_login',
  'web_discovery',
  'database',
  'erp',
  'upload_public',
  'local_directory',
] as const;

export type DatasourceKind = typeof DATASOURCE_KINDS[number];
export type DatasourceStatus = 'draft' | 'active' | 'paused' | 'error';
export const DATASOURCE_SCHEDULE_KINDS = ['manual', 'daily', 'weekly'] as const;
export type DatasourceScheduleKind = typeof DATASOURCE_SCHEDULE_KINDS[number];
export const DATASOURCE_AUTH_MODES = ['none', 'credential', 'manual_session', 'database_password', 'api_token'] as const;
export type DatasourceAuthMode = typeof DATASOURCE_AUTH_MODES[number];
export type DatasourceTargetMode = 'primary' | 'secondary';
export type DatasourceRunStatus = 'running' | 'success' | 'partial' | 'failed';

export type DatasourceRunSummaryItem = {
  id: string;
  label: string;
  summary: string;
};

export type DatasourceTargetLibrary = {
  key: string;
  label: string;
  mode: DatasourceTargetMode;
};

export type DatasourceSchedule = {
  kind: DatasourceScheduleKind;
  timezone?: string;
  maxItemsPerRun?: number;
};

export type DatasourceCredentialRef = {
  id: string;
  kind: DatasourceAuthMode;
  label?: string;
  origin?: string;
  updatedAt?: string;
};

export type DatasourceDefinition = {
  id: string;
  name: string;
  kind: DatasourceKind;
  status: DatasourceStatus;
  targetLibraries: DatasourceTargetLibrary[];
  schedule: DatasourceSchedule;
  authMode: DatasourceAuthMode;
  credentialRef?: DatasourceCredentialRef | null;
  config: Record<string, unknown>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  lastStatus?: DatasourceRunStatus;
  lastSummary?: string;
};

export type DatasourceRun = {
  id: string;
  datasourceId: string;
  startedAt: string;
  finishedAt?: string;
  status: DatasourceRunStatus;
  discoveredCount: number;
  capturedCount: number;
  ingestedCount: number;
  skippedCount?: number;
  unsupportedCount?: number;
  failedCount?: number;
  groupedCount?: number;
  ungroupedCount?: number;
  documentIds: string[];
  libraryKeys: string[];
  resultSummaries?: DatasourceRunSummaryItem[];
  summary?: string;
  errorMessage?: string;
};
