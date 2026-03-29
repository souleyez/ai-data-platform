import type { ParsedDocument } from './document-parser.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import type { ReportPlan } from './report-planner.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';

type ComposerPromptMode = 'rich' | 'compact';

export type ResumePageComposerExecution = {
  content: string | null;
  error: string;
  attemptMode: ComposerPromptMode | '';
  attemptedModes: ComposerPromptMode[];
};

function sanitizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function buildComposerContext(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
  displayProfiles: ResumeDisplayProfile[];
}, mode: ComposerPromptMode) {
  const isCompact = mode === 'compact';
  return {
    requestText: sanitizeText(input.requestText, 240),
    envelope: input.envelope ? {
      title: sanitizeText(input.envelope.title, 120),
      outputHint: sanitizeText(input.envelope.outputHint, isCompact ? 120 : 240),
      pageSections: input.envelope.pageSections || [],
    } : null,
    plan: input.reportPlan ? {
      objective: sanitizeText(input.reportPlan.objective, isCompact ? 160 : 240),
      stylePriorities: (input.reportPlan.stylePriorities || []).slice(0, isCompact ? 3 : 4),
      cards: (input.reportPlan.cards || []).slice(0, isCompact ? 3 : 4).map((item) => ({
        label: sanitizeText(item.label, 80),
      })),
      charts: (input.reportPlan.charts || []).slice(0, isCompact ? 1 : 2).map((item) => ({
        title: sanitizeText(item.title, 80),
      })),
      sections: (input.reportPlan.sections || []).slice(0, isCompact ? 4 : 8).map((item) => ({
        title: sanitizeText(item.title, 80),
        purpose: sanitizeText(item.purpose, isCompact ? 100 : 160),
        evidenceFocus: sanitizeText(item.evidenceFocus, isCompact ? 80 : 120),
      })),
    } : null,
    profiles: input.displayProfiles.slice(0, isCompact ? 4 : 6).map((profile) => ({
      sourcePath: isCompact ? '' : sanitizeText(profile.sourcePath, 320),
      sourceName: isCompact ? '' : sanitizeText(profile.sourceName, 160),
      displayName: sanitizeText(profile.displayName, 80),
      displayCompany: sanitizeText(profile.displayCompany, 160),
      displayProjects: (profile.displayProjects || []).slice(0, isCompact ? 1 : 2),
      displaySkills: (profile.displaySkills || []).slice(0, isCompact ? 3 : 4),
      displaySummary: sanitizeText(profile.displaySummary, isCompact ? 80 : 120),
    })),
    supportingDocuments: isCompact
      ? []
      : input.documents
      .filter((item) => item.schemaType === 'resume')
      .slice(0, 4)
      .map((item) => ({
        name: sanitizeText(item.name, 160),
        title: sanitizeText(item.title, 120),
      })),
  };
}

async function buildSystemPrompt() {
  const skillInstruction = await loadWorkspaceSkillBundle('resume-page-composer', [
    'references/output-schema.md',
  ]);

  return [
    'You are a resume visual-report page composer for a private enterprise knowledge-report system.',
    'Return strict JSON only. No markdown. No explanation.',
    'Your task is to compose a final client-facing static page from the supplied report plan and resume display profiles.',
    'Treat display profiles as the primary evidence layer for names, companies, projects, skills, and summaries.',
    'If a profile is ambiguous, skip it instead of copying weak file-name fragments or raw resume noise.',
    'Keep the page readable, presentation-ready, and structurally aligned with the supplied envelope.',
    skillInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildComposerPrompt(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
  displayProfiles: ResumeDisplayProfile[];
  sessionUser?: string;
}, mode: ComposerPromptMode) {
  const modeInstruction = mode === 'compact'
    ? 'Retry in compact mode. Use only the clearest profiles, keep the page concise, and prefer stable cards/charts over exhaustive detail.'
    : 'Compose one final resume page from the following curated display profiles and plan context.';
  return [
    `Request: ${sanitizeText(input.requestText, 240)}`,
    modeInstruction,
    JSON.stringify(buildComposerContext(input, mode), null, 2),
  ].join('\n\n');
}

export async function runResumePageComposerDetailed(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
  displayProfiles: ResumeDisplayProfile[];
  sessionUser?: string;
}): Promise<ResumePageComposerExecution> {
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

  const systemPrompt = await buildSystemPrompt();
  const attemptedModes: ComposerPromptMode[] = [];
  let lastError = '';

  for (const mode of ['rich', 'compact'] as const) {
    attemptedModes.push(mode);
    try {
      const result = await runOpenClawChat({
        prompt: buildComposerPrompt(input, mode),
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

export async function runResumePageComposer(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
  displayProfiles: ResumeDisplayProfile[];
  sessionUser?: string;
}) {
  const result = await runResumePageComposerDetailed(input);
  return result.content;
}
