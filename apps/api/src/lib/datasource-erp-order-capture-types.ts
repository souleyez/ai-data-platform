import type { ErpTransport } from './datasource-erp-connector.js';

export type ErpOrderCaptureProviderMode =
  | 'disabled'
  | 'openclaw-chat'
  | 'openclaw-skill';

export type ErpOrderCaptureProvider =
  | 'deterministic'
  | 'openclaw-chat'
  | 'openclaw-skill';

export type ErpOrderCaptureMode =
  | 'list_then_detail'
  | 'portal_export'
  | 'hybrid';

export type ErpOrderCapturePlan = {
  transport: ErpTransport;
  captureMode: ErpOrderCaptureMode;
  objective: string;
  readonlyGuards: string[];
  login: {
    entryPath: string;
    successSignals: string[];
    requiredCredentials: string[];
  };
  listCapture: {
    pathHints: string[];
    filterHints: string[];
    columns: string[];
    paginationHints: string[];
  };
  detailCapture: {
    pathHints: string[];
    fields: string[];
    lineItemFields: string[];
  };
  incrementalSync: {
    cursorCandidates: string[];
    dedupeKeys: string[];
    watermarkPolicy: string;
  };
  warnings: string[];
};

export type ErpOrderCaptureResolution = {
  plan: ErpOrderCapturePlan;
  provider: ErpOrderCaptureProvider;
  model: string;
  usedFallback: boolean;
};
