export type AuditLog = {
  id: string;
  time: string;
  actor: 'system' | 'user';
  action: string;
  target: string;
  result: 'success' | 'skipped' | 'failed';
  note: string;
};

export type AuditState = {
  logs?: AuditLog[];
};

export type AuditDocumentItem = {
  id: string;
  name: string;
  path: string;
  sourceType: 'upload' | 'capture' | 'other';
  createdAt: string;
  ageDays: number;
  parseMethod?: string;
  libraries: string[];
  reportReferenceCount: number;
  answerReferenceCount: number;
  referenceCount: number;
  referencedByReports: boolean;
  referencedByAnswers: boolean;
  relatedCaptureTaskId?: string;
  storageState: 'live' | 'structured-only';
  similarityGroupKey?: string;
  similarDocumentCount: number;
  similarityCleanupRecommended: boolean;
  cleanupRecommended: boolean;
  autoCleanupEligible: boolean;
  hardDeleteRecommended: boolean;
};

export type AuditCaptureItem = {
  id: string;
  name: string;
  url: string;
  captureStatus: 'active' | 'paused';
  createdAt: string;
  lastRunAt?: string;
  ageDays: number;
  reportReferenceCount: number;
  answerReferenceCount: number;
  referenceCount: number;
  referencedByReports: boolean;
  referencedByAnswers: boolean;
  documentPath?: string;
  rawDocumentPath?: string;
  storageState: 'live' | 'structured-only' | 'none';
  cleanupRecommended: boolean;
  autoCleanupEligible: boolean;
  hardDeleteRecommended: boolean;
};
