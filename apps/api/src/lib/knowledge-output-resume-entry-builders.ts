import type { ParsedDocument, ResumeFields } from './document-parser.js';
import { sanitizeResumeDisplayCompany } from './resume-display-company.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import { mergeResumeFields } from './resume-canonicalizer.js';
import type { ResumePageEntry } from './knowledge-output-resume-types.js';
import {
  buildResumeFileBaseName,
  extractResumeCompanyFromText,
  normalizeText,
  normalizeUniqueStrings,
  pickResumeDisplayName,
  sanitizeResumeCandidateName,
  sanitizeResumeCompany,
  sanitizeResumeHighlightText,
  sanitizeResumeProjectHighlightStrict,
  sanitizeText,
  toStringArray,
} from './knowledge-output-resume-shared.js';

function getResumeProfile(item: ParsedDocument) {
  return (item.structuredProfile || {}) as Record<string, unknown>;
}

function buildResumeDisplayProfileMap(displayProfiles: ResumeDisplayProfile[] = []) {
  const profileMap = new Map<string, ResumeDisplayProfile>();
  for (const profile of displayProfiles) {
    const pathKey = normalizeText(profile.sourcePath);
    const nameKey = normalizeText(profile.sourceName);
    if (pathKey) profileMap.set(pathKey, profile);
    if (nameKey) profileMap.set(nameKey, profile);
  }
  return profileMap;
}

function getCanonicalResumeFields(item: ParsedDocument) {
  const profile = getResumeProfile(item) as ResumeFields;
  const resumeFields = item.resumeFields || {};
  return mergeResumeFields(
    [
      {
        ...resumeFields,
        candidateName: sanitizeResumeCandidateName(resumeFields.candidateName),
        latestCompany: sanitizeResumeCompany(resumeFields.latestCompany),
        companies: toStringArray(resumeFields.companies).map((entry) => sanitizeResumeCompany(entry)).filter(Boolean),
      },
      {
        ...profile,
        candidateName: sanitizeResumeCandidateName(profile.candidateName),
        latestCompany: sanitizeResumeCompany(profile.latestCompany),
        companies: toStringArray(profile.companies).map((entry) => sanitizeResumeCompany(entry)).filter(Boolean),
      },
    ],
    {
      title: item.title,
      sourceName: item.name,
      summary: item.summary,
      excerpt: item.excerpt,
      fullText: item.fullText,
    },
  );
}

export function buildResumePageEntries(documents: ParsedDocument[], displayProfiles: ResumeDisplayProfile[] = []) {
  const displayProfileMap = buildResumeDisplayProfileMap(displayProfiles);
  return documents
    .filter((item) => item.schemaType === 'resume')
    .map((item) => {
      const profile = getResumeProfile(item) as ResumeFields;
      const resumeFields = item.resumeFields || {};
      const canonicalFields = getCanonicalResumeFields(item);
      const displayProfile = displayProfileMap.get(normalizeText(item.path)) || displayProfileMap.get(normalizeText(item.name));
      const candidateName = pickResumeDisplayName([
        displayProfile?.displayName,
        canonicalFields?.candidateName,
        resumeFields.candidateName,
        profile.candidateName,
        item.title,
        buildResumeFileBaseName(item.name),
        displayProfile?.displaySummary,
        item.summary,
      ]);
      const companies = normalizeUniqueStrings([
        sanitizeResumeDisplayCompany(displayProfile?.displayCompany),
        ...(canonicalFields?.companies || []).map((entry) => sanitizeResumeDisplayCompany(sanitizeResumeCompany(entry))),
        sanitizeResumeDisplayCompany(sanitizeResumeCompany(canonicalFields?.latestCompany)),
        ...toStringArray(resumeFields.companies).map((entry) => sanitizeResumeDisplayCompany(sanitizeResumeCompany(entry))),
        sanitizeResumeDisplayCompany(sanitizeResumeCompany(resumeFields.latestCompany)),
        ...toStringArray(profile.companies).map((entry) => sanitizeResumeDisplayCompany(sanitizeResumeCompany(entry))),
        sanitizeResumeDisplayCompany(sanitizeResumeCompany(profile.latestCompany)),
        sanitizeResumeDisplayCompany(extractResumeCompanyFromText(item.summary)),
        sanitizeResumeDisplayCompany(extractResumeCompanyFromText(item.title)),
      ], 4);
      const latestCompany = companies[0] || '';
      const projectHighlights = normalizeUniqueStrings(
        displayProfile?.displayProjects?.length
          ? displayProfile.displayProjects.map((entry) => sanitizeResumeProjectHighlightStrict(entry))
          : (canonicalFields?.projectHighlights || []).map((entry) => sanitizeResumeProjectHighlightStrict(entry)),
        6,
      );
      const itProjectHighlights = normalizeUniqueStrings(
        displayProfile?.displayProjects?.length
          ? displayProfile.displayProjects.map((entry) => sanitizeResumeProjectHighlightStrict(entry))
          : [
              ...(canonicalFields?.itProjectHighlights || []).map((entry) => sanitizeResumeProjectHighlightStrict(entry)),
              ...(canonicalFields?.projectHighlights || []).map((entry) => sanitizeResumeProjectHighlightStrict(entry)),
            ],
        6,
      );
      const skills = normalizeUniqueStrings(
        displayProfile?.displaySkills?.length
          ? displayProfile.displaySkills
          : (canonicalFields?.skills || []),
        8,
      );
      const education = sanitizeText(canonicalFields?.education);
      const yearsOfExperience = sanitizeText(canonicalFields?.yearsOfExperience);

      return {
        candidateName,
        education,
        latestCompany,
        yearsOfExperience,
        skills,
        projectHighlights,
        itProjectHighlights,
        highlights: normalizeUniqueStrings(
          displayProfile?.displaySummary
            ? [sanitizeResumeHighlightText(displayProfile.displaySummary)]
            : (canonicalFields?.highlights || []).map((entry) => sanitizeResumeHighlightText(entry)),
          8,
        ),
        expectedCity: sanitizeText(canonicalFields?.expectedCity),
        expectedSalary: sanitizeText(canonicalFields?.expectedSalary),
        sourceName: item.name,
        sourceTitle: item.title,
        summary: sanitizeText(sanitizeResumeHighlightText(displayProfile?.displaySummary || item.summary)),
      };
    })
    .filter((entry) => (
      entry.candidateName
      || entry.latestCompany
      || entry.skills.length
      || entry.projectHighlights.length
      || entry.itProjectHighlights.length
      || entry.highlights.length
    ));
}
