import type { BotDefinition } from './bot-definitions.js';
import type { ResolvedChannelAccess } from './channel-access-resolver.js';
import type { ReportOutputRecord } from './report-center.js';

export type ChatBackgroundJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type ChatBackgroundJobRequest = {
  prompt: string;
  sessionUser?: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode?: 'general' | 'knowledge_output';
  conversationState?: unknown;
  systemConstraints?: string;
  botId?: string;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
  confirmedAction?: 'openclaw_action' | 'dataset_static_page';
};

export type ChatBackgroundJob = {
  id: string;
  reportOutputId: string;
  status: ChatBackgroundJobStatus;
  attemptCount: number;
  prompt: string;
  promptPreview: string;
  request: ChatBackgroundJobRequest;
  libraries: Array<{ key?: string; label?: string }>;
  latestDocumentPath: string;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  error: string;
};

export type ChatBackgroundJobExecutionResult = {
  content: string;
  title?: string;
  summary?: string;
  kind?: ReportOutputRecord['kind'];
  format?: string;
  libraries?: Array<{ key?: string; label?: string }>;
  downloadUrl?: string;
};

export type ChatBackgroundJobState = {
  items: ChatBackgroundJob[];
};

export type LoggerLike = {
  info?: (payload: unknown, message?: string) => void;
  warn?: (payload: unknown, message?: string) => void;
  error?: (payload: unknown, message?: string) => void;
};

export type TimedOutChatHandoffInput = {
  prompt: string;
  sessionUser?: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemConstraints?: string;
  botId?: string;
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
  preferredDocumentPath?: string;
  conversationState?: unknown;
};
