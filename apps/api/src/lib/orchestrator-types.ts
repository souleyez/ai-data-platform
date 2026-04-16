import type { ResolvedChannelAccess } from './channel-access-resolver.js';

export type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type ChatRequestInput = {
  prompt: string;
  sessionUser?: string;
  chatHistory?: ChatHistoryItem[];
  mode?: 'general' | 'knowledge_output';
  debugResumePage?: boolean;
  confirmedRequest?: string;
  preferredLibraries?: Array<{ key: string; label: string }>;
  conversationState?: unknown;
  systemConstraints?: string;
  confirmedAction?: 'openclaw_action' | 'dataset_static_page';
  botId?: string;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
  cloudTimeoutMs?: number;
  backgroundContinuation?: boolean;
  preferredDocumentPath?: string;
};
