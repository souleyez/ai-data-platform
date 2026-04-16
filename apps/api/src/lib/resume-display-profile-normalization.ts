import { canonicalizeResumeFields } from './resume-canonicalizer.js';
import { selectResumeDisplayCompany } from './resume-display-company.js';
import {
  collectResumeDisplayProjects,
  resolveResumeDisplayName,
  sanitizeStringArray,
  sanitizeText,
} from './resume-display-profile-text.js';
import type { ResumeDisplayProfile, ResumeDisplayProfileResolution } from './resume-display-profile-types.js';

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

function normalizeProfile(raw: unknown) {
  if (!isObject(raw)) return null;
  const sourcePath = sanitizeText(raw.sourcePath, 320);
  const sourceName = sanitizeText(raw.sourceName, 160);
  if (!sourcePath && !sourceName) return null;
  const displayProjects = collectResumeDisplayProjects(
    sanitizeStringArray(raw.displayProjects, 80),
    [raw.displaySummary, raw.summary, raw.title, sourceName],
    4,
  );
  const displaySkills = sanitizeStringArray(raw.displaySkills, 40).slice(0, 6);
  const displaySummary = sanitizeText(raw.displaySummary, 240);
  const displayCompany = selectResumeDisplayCompany([
    raw.displayCompany,
    ...(Array.isArray(raw.companies) ? raw.companies : []),
    raw.displaySummary,
    raw.summary,
  ], 160);

  const canonical = canonicalizeResumeFields({
    candidateName: sanitizeText(raw.displayName, 80),
    latestCompany: displayCompany,
    companies: displayCompany ? [displayCompany] : [],
    skills: displaySkills,
  }, {
    sourceName,
    summary: displaySummary,
  });

  return {
    sourcePath,
    sourceName,
    displayName: resolveResumeDisplayName(canonical?.candidateName, [
      sourceName,
      raw.title,
      raw.summary,
      displaySummary,
    ]),
    displayCompany: selectResumeDisplayCompany([
      canonical?.latestCompany,
      ...(canonical?.companies || []),
      displayCompany,
    ], 120),
    displayProjects: displayProjects.length
      ? displayProjects
      : collectResumeDisplayProjects(canonical?.projectHighlights || [], [displaySummary, raw.summary, raw.title], 4),
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
