import { loadWorkspaceSkillBundle } from './workspace-skills.js';
import { buildComposerContext, sanitizeText } from './resume-page-composer-support.js';
import type { ComposerPromptMode, ResumePageComposerInput } from './resume-page-composer-types.js';

export async function buildResumePageComposerSystemPrompt() {
  const skillInstruction = await loadWorkspaceSkillBundle('resume-page-composer', [
    'references/output-schema.md',
  ]);

  return [
    'You are a resume visual-report page composer for a private enterprise knowledge-report system.',
    'Return strict JSON only. No markdown. No explanation.',
    'Your task is to compose a final client-facing static page from the supplied report plan and resume display profiles.',
    'Treat the output as a customer shortlist page or proposal page, not a generic resume digest.',
    'Treat display profiles as the primary evidence layer for names, companies, projects, skills, and summaries.',
    'Avoid honorific-only masked names such as 某先生 or 某女士 when stronger names exist in the supplied profiles.',
    'If a profile is ambiguous, skip it instead of copying weak file-name fragments or raw resume noise.',
    'For representative candidates and representative projects, prefer the strongest shortlist-worthy evidence and keep the project showcase diversified across candidates when possible.',
    'Keep match suggestions concrete and customer-facing. Avoid generic HR filler and avoid untranslated placeholders such as availability.',
    'Keep the page readable, presentation-ready, and structurally aligned with the supplied envelope.',
    skillInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildResumePageComposerPrompt(input: ResumePageComposerInput, mode: ComposerPromptMode) {
  const modeInstruction = mode === 'compact'
    ? 'Retry in compact mode. Use only the clearest profiles, keep the page concise, and still preserve a shortlist-style customer proposal structure.'
    : 'Compose one final resume page from the following curated display profiles and plan context. Make it read like a shortlist-ready customer report.';
  return [
    `Request: ${sanitizeText(input.requestText, 240)}`,
    modeInstruction,
    JSON.stringify(buildComposerContext(input, mode), null, 2),
  ].join('\n\n');
}
