import type { ResumeFields } from './document-parser.js';
import {
  canonicalizeCity,
  canonicalizeCompanies,
  canonicalizeEducation,
  canonicalizeHighlights,
  canonicalizeItProjectHighlights,
  canonicalizeProjectHighlights,
  canonicalizeSalary,
  canonicalizeScalar,
  canonicalizeSkills,
  canonicalizeYearsOfExperience,
  hasAnyResumeValues,
} from './resume-canonicalizer-field-normalization.js';
import { isResumeLikeContext, isWeakResumeCandidateName, pickCandidateName } from './resume-canonicalizer-name.js';
import type { ResumeCanonicalizationContext } from './resume-canonicalizer-types.js';
import { ROLE_NOISE_PATTERN, uniqStrings } from './resume-canonicalizer-utils.js';

export type { ResumeCanonicalizationContext } from './resume-canonicalizer-types.js';
export { isWeakResumeCandidateName } from './resume-canonicalizer-name.js';

export function canonicalizeResumeFields(
  fields?: ResumeFields | null,
  context: ResumeCanonicalizationContext = {},
): ResumeFields | undefined {
  if (!fields && !isResumeLikeContext(context)) return undefined;

  const candidateName = pickCandidateName(fields, context);
  const companies = canonicalizeCompanies(fields, context);
  const latestCompany = companies[0] || '';
  const projectHighlights = canonicalizeProjectHighlights(fields);
  const itProjectHighlights = canonicalizeItProjectHighlights(fields, projectHighlights);
  const skills = canonicalizeSkills(fields);

  const canonicalized: ResumeFields = {
    candidateName,
    targetRole: canonicalizeScalar(fields?.targetRole, 40, ROLE_NOISE_PATTERN),
    currentRole: canonicalizeScalar(fields?.currentRole, 40, /项目|职责|教育|学历|电话|邮箱/i),
    yearsOfExperience: canonicalizeYearsOfExperience(fields, context),
    education: canonicalizeEducation(fields, context),
    major: canonicalizeScalar(fields?.major, 30, /项目|职责|电话|邮箱|薪资/i),
    expectedCity: canonicalizeCity(fields?.expectedCity),
    expectedSalary: canonicalizeSalary(fields?.expectedSalary),
    latestCompany,
    companies: uniqStrings([latestCompany, ...companies]).slice(0, 8),
    skills,
    highlights: canonicalizeHighlights(fields, projectHighlights),
    projectHighlights,
    itProjectHighlights,
  };

  return hasAnyResumeValues(canonicalized) ? canonicalized : undefined;
}

export function mergeResumeFields(
  fieldsList: Array<ResumeFields | null | undefined>,
  context: ResumeCanonicalizationContext = {},
) {
  const merged: ResumeFields = {
    candidateName: uniqStrings(fieldsList.map((fields) => fields?.candidateName))[0] || '',
    targetRole: uniqStrings(fieldsList.map((fields) => fields?.targetRole))[0] || '',
    currentRole: uniqStrings(fieldsList.map((fields) => fields?.currentRole))[0] || '',
    yearsOfExperience: uniqStrings(fieldsList.map((fields) => fields?.yearsOfExperience))[0] || '',
    education: uniqStrings(fieldsList.map((fields) => fields?.education))[0] || '',
    major: uniqStrings(fieldsList.map((fields) => fields?.major))[0] || '',
    expectedCity: uniqStrings(fieldsList.map((fields) => fields?.expectedCity))[0] || '',
    expectedSalary: uniqStrings(fieldsList.map((fields) => fields?.expectedSalary))[0] || '',
    latestCompany: uniqStrings(fieldsList.map((fields) => fields?.latestCompany))[0] || '',
    companies: uniqStrings(fieldsList.flatMap((fields) => fields?.companies || [])),
    skills: uniqStrings(fieldsList.flatMap((fields) => fields?.skills || [])),
    highlights: uniqStrings(fieldsList.flatMap((fields) => fields?.highlights || [])),
    projectHighlights: uniqStrings(fieldsList.flatMap((fields) => fields?.projectHighlights || [])),
    itProjectHighlights: uniqStrings(fieldsList.flatMap((fields) => fields?.itProjectHighlights || [])),
  };

  return canonicalizeResumeFields(merged, context);
}
