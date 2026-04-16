import type { ParsedDocument, ResumeFields } from './document-parser.js';
import { canonicalizeResumeFields, isWeakResumeCandidateName } from './resume-canonicalizer.js';
import { selectResumeDisplayCompany } from './resume-display-company.js';
import {
  buildProfileKey,
  buildSeedSummary,
  collectResumeDisplayProjects,
  resolveResumeDisplayName,
  sanitizeStringArray,
  sanitizeText,
} from './resume-display-profile-text.js';
import type { ResumeDisplayProfile, ResumeDisplayProfileResolution } from './resume-display-profile-types.js';

export function shouldAttemptModelRefinement(seedProfiles: ResumeDisplayProfile[]) {
  if (!seedProfiles.length) return false;
  const weakNameCount = seedProfiles.filter((profile) => isWeakResumeCandidateName(profile.displayName)).length;
  const projectRichProfiles = seedProfiles.filter((profile) => (profile.displayProjects || []).length > 0).length;
  return weakNameCount > 0 || projectRichProfiles < Math.min(3, seedProfiles.length);
}

export function buildResumeDisplayDocumentContext(item: ParsedDocument) {
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

  const displayName = resolveResumeDisplayName(canonical?.candidateName, [
    item.title,
    item.summary,
    item.excerpt,
    item.name,
    item.fullText,
  ]);
  const displayCompany = selectResumeDisplayCompany([
    canonical?.latestCompany,
    ...(canonical?.companies || []),
    profile.latestCompany,
    ...(Array.isArray(profile.companies) ? profile.companies : []),
    item.summary,
    item.excerpt,
    item.fullText,
    item.title,
  ], 120);
  const displayProjects = collectResumeDisplayProjects(
    canonical?.itProjectHighlights?.length ? canonical.itProjectHighlights : (canonical?.projectHighlights || []),
    [item.summary, item.excerpt, item.fullText, item.title],
    3,
  );
  const displaySkills = sanitizeStringArray(canonical?.skills, 40).slice(0, 6);
  const displaySummary = buildSeedSummary({
    currentRole: canonical?.currentRole,
    yearsOfExperience: canonical?.yearsOfExperience,
    education: canonical?.education,
    displayCompany,
    displaySkills,
    displayProjects,
  });

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

export function mergeResumeDisplayProfiles(primary: ResumeDisplayProfile[], fallback: ResumeDisplayProfile[]) {
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
      displayProjects: collectResumeDisplayProjects(
        [...(profile.displayProjects || []), ...(previous?.displayProjects || [])],
        [],
        4,
      ),
      displaySkills: profile.displaySkills?.length ? profile.displaySkills : (previous?.displaySkills || []),
      displaySummary: profile.displaySummary || previous?.displaySummary || '',
    });
  }

  return [...merged.values()].filter((profile) =>
    profile.displayName || profile.displayCompany || profile.displayProjects.length || profile.displaySkills.length || profile.displaySummary,
  );
}
