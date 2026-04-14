export type ChatActionInvalidateDomain =
  | 'documents'
  | 'datasources'
  | 'reports'
  | 'models'
  | 'bots'
  | 'audit';

export type ChatActionResult = {
  domain: ChatActionInvalidateDomain;
  action: string;
  status: 'completed' | 'failed';
  summary: string;
  invalidate: ChatActionInvalidateDomain[];
  entity?: Record<string, unknown> | null;
};

export type ExecutedPlatformChatAction = {
  content: string;
  libraries: Array<{ key: string; label: string }>;
  actionResult: ChatActionResult;
};

export type MatchedChatAction =
  | { kind: 'create-library'; name: string }
  | { kind: 'update-library'; reference: string; nextLabel: string }
  | { kind: 'delete-library'; reference: string }
  | { kind: 'select-model' }
  | { kind: 'datasource-run' | 'datasource-pause' | 'datasource-activate'; reference: string };
