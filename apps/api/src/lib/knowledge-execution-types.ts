import type { BotDefinition } from './bot-definitions.js';
import type { ChatOutput } from './knowledge-output.js';

export type KnowledgeExecutionInput = {
  prompt: string;
  confirmedRequest?: string;
  preferredLibraries?: Array<{ key: string; label: string }>;
  preferredTemplateKey?: string;
  timeRange?: string;
  contentFocus?: string;
  sessionUser?: string;
  debugResumePage?: boolean;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  forceGlobalMemorySelection?: boolean;
};

export type ResumePageDebugTrace = {
  requestText: string;
  templateMode: 'concept-page' | 'shared-template';
  envelope: {
    title: string;
    pageSections: string[];
    outputHint: string;
  } | null;
  reportPlan: {
    objective: string;
    sections: string[];
    cards: string[];
    charts: string[];
    datavizSlots?: string[];
  } | null;
  displayProfiles: Array<{
    sourcePath: string;
    sourceName: string;
    displayName: string;
    displayCompany: string;
    displayProjects: string[];
    displaySkills: string[];
    displaySummary: string;
  }>;
  initialModelContent: string;
  initialOutput: ChatOutput | null;
  initialNeedsFallback: boolean;
  composerAttempted: boolean;
  composerAttemptModes: string[];
  composerSelectedAttempt: string;
  composerModelContent: string;
  composerOutput: ChatOutput | null;
  composerNeedsFallback: boolean | null;
  composerErrorMessage: string;
  errorStage: string;
  errorMessage: string;
  finalStage: 'initial-output' | 'composer-output' | 'fallback-output' | 'catch-fallback-output';
};

export type KnowledgeExecutionResult = {
  libraries: Array<{ key: string; label: string }>;
  output: ChatOutput;
  content: string;
  intent: 'report';
  mode: 'openclaw';
  reportTemplate?: { key: string; label: string; type: string } | null;
  debug?: {
    resumePage?: ResumePageDebugTrace;
  } | null;
};

export type KnowledgeAnswerInput = {
  prompt: string;
  preferredLibraries?: Array<{ key: string; label: string }>;
  timeRange?: string;
  contentFocus?: string;
  sessionUser?: string;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  answerMode?: 'catalog_memory' | 'live_detail';
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  forceGlobalMemorySelection?: boolean;
};

export type KnowledgeAnswerResult = {
  libraries: Array<{ key: string; label: string }>;
  output: ChatOutput;
  content: string;
  intent: 'general';
  mode: 'openclaw';
};
