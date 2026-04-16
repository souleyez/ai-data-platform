import { buildFocusedFieldPayload, createFieldDetail } from './document-schema-field-details.js';
import { isLikelyResumePersonName } from './document-schema-heuristics.js';
import type { BuildStructuredProfileInput } from './document-schema-profile-types.js';
import type { StructuredProfileBaseParts } from './document-schema-profile-core.js';

export function buildContractStructuredProfile(input: BuildStructuredProfileInput, parts: StructuredProfileBaseParts) {
  const { base, contractFields } = parts;
  const fieldDetails = {
    ...base.fieldDetails,
    ...(createFieldDetail(contractFields?.contractNo, 0.94, 'rule', input.evidenceChunks) ? { contractNo: createFieldDetail(contractFields?.contractNo, 0.94, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(contractFields?.partyA, 0.88, 'rule', input.evidenceChunks) ? { partyA: createFieldDetail(contractFields?.partyA, 0.88, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(contractFields?.partyB, 0.88, 'rule', input.evidenceChunks) ? { partyB: createFieldDetail(contractFields?.partyB, 0.88, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(contractFields?.amount, 0.86, 'rule', input.evidenceChunks) ? { amount: createFieldDetail(contractFields?.amount, 0.86, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(contractFields?.signDate, 0.82, 'rule', input.evidenceChunks) ? { signDate: createFieldDetail(contractFields?.signDate, 0.82, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(contractFields?.effectiveDate, 0.8, 'rule', input.evidenceChunks) ? { effectiveDate: createFieldDetail(contractFields?.effectiveDate, 0.8, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(contractFields?.paymentTerms, 0.78, 'rule', input.evidenceChunks) ? { paymentTerms: createFieldDetail(contractFields?.paymentTerms, 0.78, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(contractFields?.duration, 0.76, 'rule', input.evidenceChunks) ? { duration: createFieldDetail(contractFields?.duration, 0.76, 'rule', input.evidenceChunks)! } : {}),
  };

  return {
    ...base,
    contractNo: contractFields?.contractNo || '',
    partyA: contractFields?.partyA || '',
    partyB: contractFields?.partyB || '',
    amount: contractFields?.amount || '',
    signDate: contractFields?.signDate || '',
    effectiveDate: contractFields?.effectiveDate || '',
    paymentTerms: contractFields?.paymentTerms || '',
    duration: contractFields?.duration || '',
    fieldDetails,
    ...buildFocusedFieldPayload(fieldDetails, input.extractionProfile),
  };
}

export function buildResumeStructuredProfile(input: BuildStructuredProfileInput, parts: StructuredProfileBaseParts) {
  const { base, resumeFields } = parts;
  const highlights = resumeFields?.highlights || [];
  const existingProjects = resumeFields?.projectHighlights || [];
  const existingItProjects = resumeFields?.itProjectHighlights || [];
  const fallbackProjects = existingProjects.length
    ? existingProjects
    : highlights.filter((entry) => /(项目|project|系统|platform|api|实施|开发|架构|技术)/i.test(String(entry || ''))).slice(0, 8);
  const fallbackItProjects = existingItProjects.length
    ? existingItProjects
    : fallbackProjects.filter((entry) => /(it|系统|platform|api|接口|开发|实施|架构|技术)/i.test(String(entry || ''))).slice(0, 8);
  const companies = resumeFields?.companies?.length
    ? resumeFields.companies
    : resumeFields?.latestCompany
      ? [resumeFields.latestCompany]
      : [];
  const fieldDetails = {
    ...base.fieldDetails,
    ...(createFieldDetail(resumeFields?.candidateName, isLikelyResumePersonName(String(resumeFields?.candidateName || '')) ? 0.9 : 0.68, 'rule', input.evidenceChunks) ? { candidateName: createFieldDetail(resumeFields?.candidateName, isLikelyResumePersonName(String(resumeFields?.candidateName || '')) ? 0.9 : 0.68, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(resumeFields?.targetRole, 0.82, 'rule', input.evidenceChunks) ? { targetRole: createFieldDetail(resumeFields?.targetRole, 0.82, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(resumeFields?.currentRole, 0.82, 'rule', input.evidenceChunks) ? { currentRole: createFieldDetail(resumeFields?.currentRole, 0.82, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(resumeFields?.yearsOfExperience, 0.78, 'rule', input.evidenceChunks) ? { yearsOfExperience: createFieldDetail(resumeFields?.yearsOfExperience, 0.78, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(resumeFields?.education, 0.84, 'rule', input.evidenceChunks) ? { education: createFieldDetail(resumeFields?.education, 0.84, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(resumeFields?.major, 0.8, 'rule', input.evidenceChunks) ? { major: createFieldDetail(resumeFields?.major, 0.8, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(resumeFields?.expectedCity, 0.76, 'rule', input.evidenceChunks) ? { expectedCity: createFieldDetail(resumeFields?.expectedCity, 0.76, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(resumeFields?.expectedSalary, 0.74, 'rule', input.evidenceChunks) ? { expectedSalary: createFieldDetail(resumeFields?.expectedSalary, 0.74, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(resumeFields?.latestCompany, 0.84, 'rule', input.evidenceChunks) ? { latestCompany: createFieldDetail(resumeFields?.latestCompany, 0.84, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(companies, 0.76, 'derived', input.evidenceChunks) ? { companies: createFieldDetail(companies, 0.76, 'derived', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(resumeFields?.skills || [], 0.74, 'derived', input.evidenceChunks) ? { skills: createFieldDetail(resumeFields?.skills || [], 0.74, 'derived', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(highlights, 0.68, 'derived', input.evidenceChunks) ? { highlights: createFieldDetail(highlights, 0.68, 'derived', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(fallbackProjects, 0.66, 'derived', input.evidenceChunks) ? { projectHighlights: createFieldDetail(fallbackProjects, 0.66, 'derived', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(fallbackItProjects, 0.64, 'derived', input.evidenceChunks) ? { itProjectHighlights: createFieldDetail(fallbackItProjects, 0.64, 'derived', input.evidenceChunks)! } : {}),
  };

  return {
    ...base,
    candidateName: resumeFields?.candidateName || '',
    targetRole: resumeFields?.targetRole || '',
    currentRole: resumeFields?.currentRole || '',
    yearsOfExperience: resumeFields?.yearsOfExperience || '',
    education: resumeFields?.education || '',
    major: resumeFields?.major || '',
    expectedCity: resumeFields?.expectedCity || '',
    expectedSalary: resumeFields?.expectedSalary || '',
    latestCompany: resumeFields?.latestCompany || '',
    companies,
    skills: resumeFields?.skills || [],
    highlights,
    projectHighlights: fallbackProjects,
    itProjectHighlights: fallbackItProjects,
    fieldDetails,
    ...buildFocusedFieldPayload(fieldDetails, input.extractionProfile),
  };
}
