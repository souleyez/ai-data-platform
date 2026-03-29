import type { ParsedDocument } from './document-parser.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import type { ReportPlan } from './report-planner.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';

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
}) {
  return {
    requestText: sanitizeText(input.requestText, 240),
    envelope: input.envelope ? {
      title: sanitizeText(input.envelope.title, 120),
      outputHint: sanitizeText(input.envelope.outputHint, 240),
      pageSections: input.envelope.pageSections || [],
    } : null,
    plan: input.reportPlan ? {
      objective: sanitizeText(input.reportPlan.objective, 240),
      stylePriorities: input.reportPlan.stylePriorities || [],
      evidenceRules: input.reportPlan.evidenceRules || [],
      completionRules: input.reportPlan.completionRules || [],
      cards: (input.reportPlan.cards || []).map((item) => ({
        label: sanitizeText(item.label, 80),
        purpose: sanitizeText(item.purpose, 160),
      })),
      charts: (input.reportPlan.charts || []).map((item) => ({
        title: sanitizeText(item.title, 80),
        purpose: sanitizeText(item.purpose, 160),
      })),
      sections: (input.reportPlan.sections || []).map((item) => ({
        title: sanitizeText(item.title, 80),
        purpose: sanitizeText(item.purpose, 160),
        evidenceFocus: sanitizeText(item.evidenceFocus, 160),
        completionMode: item.completionMode,
      })),
      knowledgeScope: input.reportPlan.knowledgeScope,
    } : null,
    profiles: input.displayProfiles.map((profile) => ({
      sourcePath: sanitizeText(profile.sourcePath, 320),
      sourceName: sanitizeText(profile.sourceName, 160),
      displayName: sanitizeText(profile.displayName, 80),
      displayCompany: sanitizeText(profile.displayCompany, 160),
      displayProjects: profile.displayProjects || [],
      displaySkills: profile.displaySkills || [],
      displaySummary: sanitizeText(profile.displaySummary, 240),
    })),
    supportingDocuments: input.documents
      .filter((item) => item.schemaType === 'resume')
      .slice(0, 10)
      .map((item) => ({
        path: sanitizeText(item.path, 320),
        name: sanitizeText(item.name, 160),
        title: sanitizeText(item.title, 120),
        summary: sanitizeText(item.summary, 240),
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

export async function runResumePageComposer(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
  displayProfiles: ResumeDisplayProfile[];
  sessionUser?: string;
}) {
  if (!isOpenClawGatewayConfigured() || !input.displayProfiles.length) return null;

  const systemPrompt = await buildSystemPrompt();
  const prompt = [
    `Request: ${sanitizeText(input.requestText, 240)}`,
    'Compose one final resume page from the following curated display profiles and plan context.',
    JSON.stringify(buildComposerContext(input), null, 2),
  ].join('\n\n');

  try {
    const result = await runOpenClawChat({
      prompt,
      systemPrompt,
      sessionUser: input.sessionUser,
    });
    return result.content;
  } catch {
    return null;
  }
}
