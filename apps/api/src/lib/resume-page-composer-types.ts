import type { ParsedDocument } from './document-parser.js';
import type { ReportPlan } from './report-planner.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';

export type ComposerPromptMode = 'rich' | 'compact';

export type ResumePageComposerExecution = {
  content: string | null;
  error: string;
  attemptMode: ComposerPromptMode | '';
  attemptedModes: ComposerPromptMode[];
};

export type ResumePageComposerInput = {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
  displayProfiles: ResumeDisplayProfile[];
  sessionUser?: string;
};
