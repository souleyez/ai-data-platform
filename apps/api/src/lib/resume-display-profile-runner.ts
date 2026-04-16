import type { ParsedDocument } from './document-parser.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import {
  buildResumeDisplayDocumentContext,
  buildResumeDisplaySeedProfiles,
  mergeResumeDisplayProfiles,
  parseResumeDisplayProfileResponse,
  shouldAttemptModelRefinement,
} from './resume-display-profile-support.js';
import type { ResumeDisplayProfileResolution } from './resume-display-profile-types.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';

function sanitizeRequestText(value: string, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

async function buildSystemPrompt() {
  const skillInstruction = await loadWorkspaceSkillBundle('resume-display-profile', [
    'references/output-schema.md',
  ]);

  return [
    'You are a resume display-profile resolver for a private enterprise knowledge-report system.',
    'Return strict JSON only. No markdown. No explanation.',
    'Your task is to transform noisy resume retrieval inputs into display-ready profile slots for report generation.',
    'Prefer real human names, stable organization labels, concise project nouns, and reusable skill labels.',
    'Avoid honorific-only masked names such as 某先生 or 某女士 when stronger real names exist in the document context.',
    'For displayCompany, prefer enterprise employer labels. Reject associations, alumni groups, research institutes, universities, and similar non-enterprise organizations unless they are explicitly part of a company name.',
    'Reject placeholders, sample slugs, generic labels, role-only titles, file-name fragments, long responsibility sentences, and malformed organization text.',
    skillInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function runResumeDisplayProfileResolver(input: {
  requestText: string;
  documents: ParsedDocument[];
  sessionUser?: string;
}): Promise<ResumeDisplayProfileResolution | null> {
  const documents = input.documents.filter((item) => item.schemaType === 'resume').slice(0, 8);
  const seedProfiles = buildResumeDisplaySeedProfiles(documents);
  if (!documents.length) return null;
  if (seedProfiles.length >= 4 && !shouldAttemptModelRefinement(seedProfiles)) {
    return { profiles: seedProfiles };
  }
  if (!isOpenClawGatewayConfigured()) {
    return seedProfiles.length ? { profiles: seedProfiles } : null;
  }

  const systemPrompt = await buildSystemPrompt();
  const prompt = [
    `Request: ${sanitizeRequestText(input.requestText, 240)}`,
    'Resolve display-ready resume profiles for the following matched documents.',
    JSON.stringify({
      profiles: documents.slice(0, 6).map((item) => buildResumeDisplayDocumentContext(item)),
    }, null, 2),
  ].join('\n\n');

  try {
    const result = await runOpenClawChat({
      prompt,
      systemPrompt,
      sessionUser: input.sessionUser,
    });
    const parsed = parseResumeDisplayProfileResponse(result.content);
    if (!parsed?.profiles?.length) {
      return seedProfiles.length ? { profiles: seedProfiles } : null;
    }
    return {
      profiles: mergeResumeDisplayProfiles(parsed.profiles, seedProfiles),
    };
  } catch {
    return seedProfiles.length ? { profiles: seedProfiles } : null;
  }
}
