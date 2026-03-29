import type { ParsedDocument, ResumeFields } from './document-parser.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import { canonicalizeResumeFields } from './resume-canonicalizer.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';

export type ResumeDisplayProfile = {
  sourcePath: string;
  sourceName: string;
  displayName: string;
  displayCompany: string;
  displayProjects: string[];
  displaySkills: string[];
  displaySummary: string;
};

export type ResumeDisplayProfileResolution = {
  profiles: ResumeDisplayProfile[];
};

function buildProfileKey(profile: Pick<ResumeDisplayProfile, 'sourcePath' | 'sourceName'>) {
  return `${sanitizeText(profile.sourcePath, 320)}::${sanitizeText(profile.sourceName, 160)}`;
}

function sanitizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function sanitizeStringArray(value: unknown, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractJsonObject(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildDocumentContext(item: ParsedDocument) {
  const profile = (item.resumeFields || item.structuredProfile || {}) as ResumeFields;
  const canonical = canonicalizeResumeFields(profile, {
    title: item.title,
    sourceName: item.name,
    summary: item.summary,
    excerpt: item.excerpt,
    fullText: item.fullText,
  });

  return {
    sourcePath: item.path,
    sourceName: item.name,
    title: sanitizeText(item.title, 120),
    summary: sanitizeText(item.summary, 280),
    excerpt: sanitizeText(item.excerpt, 220),
    canonicalResumeFields: canonical || {},
    rawResumeFields: profile,
  };
}

function buildSeedProfileFromDocument(item: ParsedDocument) {
  const profile = (item.resumeFields || item.structuredProfile || {}) as ResumeFields;
  const canonical = canonicalizeResumeFields(profile, {
    title: item.title,
    sourceName: item.name,
    summary: item.summary,
    excerpt: item.excerpt,
    fullText: item.fullText,
  });

  const displayName = sanitizeText(canonical?.candidateName, 60);
  const displayCompany = sanitizeText(canonical?.latestCompany || canonical?.companies?.[0], 120);
  const displayProjects = sanitizeStringArray(
    canonical?.itProjectHighlights?.length ? canonical.itProjectHighlights : canonical?.projectHighlights,
    80,
  ).slice(0, 4);
  const displaySkills = sanitizeStringArray(canonical?.skills, 40).slice(0, 6);
  const displaySummary = sanitizeText(
    canonical?.highlights?.[0]
      || [canonical?.currentRole, canonical?.yearsOfExperience, canonical?.education, displayCompany].filter(Boolean).join(' | ')
      || item.summary,
    240,
  );

  if (!displayName && !displayCompany && !displayProjects.length && !displaySkills.length && !displaySummary) {
    return null;
  }

  return {
    sourcePath: item.path,
    sourceName: item.name,
    displayName,
    displayCompany,
    displayProjects,
    displaySkills,
    displaySummary,
  } satisfies ResumeDisplayProfile;
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
    'Reject placeholders, sample slugs, generic labels, role-only titles, file-name fragments, long responsibility sentences, and malformed organization text.',
    skillInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function normalizeProfile(raw: unknown) {
  if (!isObject(raw)) return null;
  const sourcePath = sanitizeText(raw.sourcePath, 320);
  const sourceName = sanitizeText(raw.sourceName, 160);
  if (!sourcePath && !sourceName) return null;
  const displayProjects = sanitizeStringArray(raw.displayProjects, 80).slice(0, 4);
  const displaySkills = sanitizeStringArray(raw.displaySkills, 40).slice(0, 6);
  const displaySummary = sanitizeText(raw.displaySummary, 240);

  const canonical = canonicalizeResumeFields({
    candidateName: sanitizeText(raw.displayName, 80),
    latestCompany: sanitizeText(raw.displayCompany, 160),
    companies: sanitizeStringArray(raw.displayCompany ? [raw.displayCompany] : [], 160),
    skills: displaySkills,
  }, {
    sourceName,
    summary: displaySummary,
  });

  return {
    sourcePath,
    sourceName,
    displayName: sanitizeText(canonical?.candidateName, 60),
    displayCompany: sanitizeText(canonical?.latestCompany || canonical?.companies?.[0], 120),
    displayProjects: displayProjects.length ? displayProjects : sanitizeStringArray(canonical?.projectHighlights, 80).slice(0, 4),
    displaySkills: displaySkills.length ? displaySkills : sanitizeStringArray(canonical?.skills, 40).slice(0, 6),
    displaySummary,
  } satisfies ResumeDisplayProfile;
}

export function parseResumeDisplayProfileResponse(rawContent: string): ResumeDisplayProfileResolution | null {
  const root = extractJsonObject(rawContent);
  if (!root) return null;

  const payload = isObject(root.output) ? root.output : root;
  const profiles = (Array.isArray(payload.profiles) ? payload.profiles : [])
    .map((item) => normalizeProfile(item))
    .filter(Boolean) as ResumeDisplayProfile[];

  if (!profiles.length) return null;
  return { profiles };
}

export function buildResumeDisplayProfileContextBlock(resolution: ResumeDisplayProfileResolution | null) {
  if (!resolution?.profiles?.length) return '';
  return [
    'Resume display profiles:',
    'Use these profiles as stronger display labels than raw filenames, weak summaries, or noisy fallback extraction.',
    JSON.stringify({
      profiles: resolution.profiles.map((profile) => ({
        sourcePath: profile.sourcePath,
        sourceName: profile.sourceName,
        displayName: profile.displayName,
        displayCompany: profile.displayCompany,
        displayProjects: profile.displayProjects,
        displaySkills: profile.displaySkills,
        displaySummary: profile.displaySummary,
      })),
    }, null, 2),
  ].join('\n\n');
}

export function buildResumeDisplaySeedProfiles(documents: ParsedDocument[]) {
  return documents
    .filter((item) => item.schemaType === 'resume')
    .slice(0, 8)
    .map((item) => buildSeedProfileFromDocument(item))
    .filter(Boolean) as ResumeDisplayProfile[];
}

function mergeResumeDisplayProfiles(primary: ResumeDisplayProfile[], fallback: ResumeDisplayProfile[]) {
  const merged = new Map<string, ResumeDisplayProfile>();

  for (const profile of fallback) {
    merged.set(buildProfileKey(profile), profile);
  }

  for (const profile of primary) {
    const key = buildProfileKey(profile);
    const previous = merged.get(key);
    merged.set(key, {
      sourcePath: profile.sourcePath || previous?.sourcePath || '',
      sourceName: profile.sourceName || previous?.sourceName || '',
      displayName: profile.displayName || previous?.displayName || '',
      displayCompany: profile.displayCompany || previous?.displayCompany || '',
      displayProjects: profile.displayProjects?.length ? profile.displayProjects : (previous?.displayProjects || []),
      displaySkills: profile.displaySkills?.length ? profile.displaySkills : (previous?.displaySkills || []),
      displaySummary: profile.displaySummary || previous?.displaySummary || '',
    });
  }

  return [...merged.values()].filter((profile) => profile.displayName || profile.displayCompany || profile.displayProjects.length || profile.displaySkills.length || profile.displaySummary);
}

export async function runResumeDisplayProfileResolver(input: {
  requestText: string;
  documents: ParsedDocument[];
  sessionUser?: string;
}): Promise<ResumeDisplayProfileResolution | null> {
  const documents = input.documents.filter((item) => item.schemaType === 'resume').slice(0, 8);
  const seedProfiles = buildResumeDisplaySeedProfiles(documents);
  if (!documents.length) return null;
  if (seedProfiles.length >= 4) {
    return { profiles: seedProfiles };
  }
  if (!isOpenClawGatewayConfigured()) {
    return seedProfiles.length ? { profiles: seedProfiles } : null;
  }

  const systemPrompt = await buildSystemPrompt();
  const prompt = [
    `Request: ${sanitizeText(input.requestText, 240)}`,
    'Resolve display-ready resume profiles for the following matched documents.',
    JSON.stringify({
      profiles: documents.slice(0, 6).map((item) => buildDocumentContext(item)),
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
