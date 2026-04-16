import type { DatasourceCredentialSecret } from './datasource-credentials.js';
import type { DatasourceDefinition } from './datasource-definitions.js';
import type { ErpExecutionPlan } from './datasource-erp-connector.js';
import type { ErpOrderCaptureResolution } from './datasource-erp-order-capture.js';

export type ErpSessionBrowserExecutorMode =
  | 'contract'
  | 'mcporter';

export type ErpSessionBrowserLaunchContract = {
  datasourceId: string;
  datasourceName: string;
  endpointTarget: string;
  transport: 'session';
  captureMode: 'portal_export' | 'hybrid';
  startUrl: string;
  taskPrompt: string;
  commandPreview: string;
  timeoutMs: number;
  readonlyGuards: string[];
  listPathHints: string[];
  detailPathHints: string[];
  incrementalSync: {
    cursorCandidates: string[];
    dedupeKeys: string[];
    watermarkPolicy: string;
  };
  credentialSummary: {
    requiredCredentials: string[];
    satisfiedCredentials: string[];
    missingCredentials: string[];
    maskedUsername: string;
    hasCookies: boolean;
  };
  steps: string[];
  warnings: string[];
  execution: {
    requested: boolean;
    mode: ErpSessionBrowserExecutorMode;
    status: 'not_requested' | 'completed' | 'unavailable' | 'failed';
    outputPreview: string;
    errorMessage: string;
  };
};

export type ErpSessionLaunchContractInput = {
  definition: DatasourceDefinition;
  executionPlan: ErpExecutionPlan;
  captureResolution: ErpOrderCaptureResolution;
  credentialSecret?: DatasourceCredentialSecret | null;
  requestedExecution?: boolean;
};

export type ErpSessionLaunchRunnerInput = {
  definition: DatasourceDefinition;
  executionPlan: ErpExecutionPlan;
  captureResolution: ErpOrderCaptureResolution;
  credentialSecret?: DatasourceCredentialSecret | null;
  execute?: boolean;
  executorMode?: ErpSessionBrowserExecutorMode;
};
