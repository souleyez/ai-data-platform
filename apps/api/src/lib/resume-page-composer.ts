import type { ParsedDocument } from './document-parser.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import type { ReportPlan } from './report-planner.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import {
  buildResumePageComposerPrompt,
  buildResumePageComposerSystemPrompt,
} from './resume-page-composer-prompts.js';
import { sanitizeText } from './resume-page-composer-support.js';
import type {
  ComposerPromptMode,
  ResumePageComposerExecution,
  ResumePageComposerInput,
} from './resume-page-composer-types.js';

export type { ResumePageComposerExecution } from './resume-page-composer-types.js';

export async function runResumePageComposerDetailed(input: ResumePageComposerInput): Promise<ResumePageComposerExecution> {
  if (!isOpenClawGatewayConfigured()) {
    return {
      content: null,
      error: 'Cloud gateway is not configured',
      attemptMode: '',
      attemptedModes: [],
    };
  }
  if (!input.displayProfiles.length) {
    return {
      content: null,
      error: 'No resume display profiles available for composer',
      attemptMode: '',
      attemptedModes: [],
    };
  }

  const systemPrompt = await buildResumePageComposerSystemPrompt();
  const attemptedModes: ComposerPromptMode[] = [];
  let lastError = '';

  for (const mode of ['rich', 'compact'] as const) {
    attemptedModes.push(mode);
    try {
      const result = await runOpenClawChat({
        prompt: buildResumePageComposerPrompt(input, mode),
        systemPrompt,
        sessionUser: input.sessionUser,
      });
      if (sanitizeText(result.content, 120)) {
        return {
          content: result.content,
          error: '',
          attemptMode: mode,
          attemptedModes,
        };
      }
      lastError = `Composer returned empty content in ${mode} mode`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error || '');
    }
  }

  return {
    content: null,
    error: lastError || 'Composer returned empty content',
    attemptMode: '',
    attemptedModes,
  };
}

export async function runResumePageComposer(input: ResumePageComposerInput) {
  const result = await runResumePageComposerDetailed(input);
  return result.content;
}
