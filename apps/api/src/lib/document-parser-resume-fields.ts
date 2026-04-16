import type { DocumentExtractionProfile } from './document-extraction-governance.js';
import { isLikelyResumePersonName } from './document-schema.js';
import {
  collectResumeCompanies,
  extractResumeItProjectHighlights,
  extractResumeProjectHighlights,
} from './document-parser-resume-field-companies.js';
import {
  collectResumeSkills,
  cutOffNextResumeLabel,
  extractResumeLabelMap,
  extractResumeHighlights,
  extractResumeValue,
  inferResumeNameFromTitle,
  normalizeResumeTextValue,
} from './document-parser-resume-field-support.js';
import { canonicalizeResumeFields } from './resume-canonicalizer.js';

export const RESUME_HINTS = [
  '简历',
  '履历',
  '候选人',
  '应聘',
  '求职',
  '教育经历',
  '工作经历',
  '项目经历',
  '期望薪资',
  '目标岗位',
  'resume',
  'curriculum vitae',
  'cv',
];

export type StructuredEntity = {
  text: string;
  type: 'ingredient' | 'strain' | 'audience' | 'benefit' | 'dose' | 'organization' | 'metric' | 'identifier' | 'term';
  source: 'rule' | 'uie';
  confidence: number;
  evidenceChunkId?: string;
};

export type StructuredClaim = {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  evidenceChunkId?: string;
};

export type ResumeFields = {
  candidateName?: string;
  targetRole?: string;
  currentRole?: string;
  yearsOfExperience?: string;
  education?: string;
  major?: string;
  expectedCity?: string;
  expectedSalary?: string;
  latestCompany?: string;
  companies?: string[];
  skills?: string[];
  highlights?: string[];
  projectHighlights?: string[];
  itProjectHighlights?: string[];
};

export function extractResumeFields(
  text: string,
  title: string,
  entities: StructuredEntity[] = [],
  claims: StructuredClaim[] = [],
  options?: { force?: boolean },
): ResumeFields | undefined {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const titleText = String(title || '').trim();
  const evidence = `${titleText} ${normalized}`.toLowerCase();
  const looksLikeResume = RESUME_HINTS.some((hint) => evidence.includes(hint.toLowerCase()));
  if (!looksLikeResume && options?.force !== true) return undefined;
  const labelMap = extractResumeLabelMap(text);
  const byLabel = (...labels: string[]) => {
    for (const label of labels) {
      const value = labelMap.get(label);
      if (value) return value;
    }
    return '';
  };

  const skillsFromEntities = entities
    .filter((item) => item.type === 'ingredient' || item.type === 'term')
    .map((item) => normalizeResumeTextValue(item.text))
    .filter(Boolean);
  const highlightsFromClaims = claims
    .map((claim) => `${claim.subject} ${claim.predicate} ${claim.object}`.trim())
    .filter(Boolean);

  const skills = [...new Set([...collectResumeSkills(normalized), ...skillsFromEntities])].slice(0, 8);
  const latestCompany = byLabel('最近工作经历', '最近公司', '现任公司', '就职公司') || extractResumeValue(normalized, [
    /(?:最近工作经历|最近公司|现任公司|就职公司)[:：]?\s*([^，。；;\n]{2,60})/i,
  ]);
  const projectHighlights = extractResumeProjectHighlights(text);
  const itProjectHighlights = extractResumeItProjectHighlights(text, skills);

  const fields: ResumeFields = {
    candidateName: byLabel('姓名', 'Name', '候选人') || extractResumeValue(normalized, [
      /(?:姓名|name)[:：]?\s*([A-Za-z\u4e00-\u9fff·]{2,20})/i,
      /(?:候选人)[:：]?\s*([A-Za-z\u4e00-\u9fff·]{2,20})/i,
    ]) || inferResumeNameFromTitle(titleText),
    targetRole: byLabel('应聘岗位', '目标岗位', '求职方向') || extractResumeValue(normalized, [
      /(?:应聘岗位|目标岗位|求职方向)[:：]?\s*([^，。；;\n]{2,40})/i,
    ]),
    currentRole: byLabel('当前职位', '现任职位'),
    yearsOfExperience: byLabel('工作经验') || extractResumeValue(normalized, [
      /(\d{1,2}\+?\s*年(?:工作经验)?)/i,
      /(工作经验[^，。；;\n]{0,12}\d{1,2}\+?\s*年)/i,
    ]),
    education: byLabel('学历') || extractResumeValue(normalized, [
      /(博士|硕士|本科|大专|中专|MBA|EMBA|研究生)/i,
    ]),
    major: byLabel('专业') || extractResumeValue(normalized, [
      /(?:专业)[:：]?\s*([^，。；;\n]{2,40})/i,
    ]),
    expectedCity: byLabel('期望城市', '意向城市', '工作城市', '地点') || extractResumeValue(normalized, [
      /(?:期望城市|意向城市|工作城市|地点)[:：]?\s*([^，。；;\n]{2,30})/i,
    ]),
    expectedSalary: byLabel('期望薪资', '薪资要求', '期望工资') || extractResumeValue(normalized, [
      /(?:期望薪资|薪资要求|期望工资)[:：]?\s*([^，。；;\n]{2,30})/i,
    ]),
    latestCompany,
    companies: collectResumeCompanies(text, latestCompany),
    skills,
    highlights: [...new Set([...highlightsFromClaims, ...extractResumeHighlights(text)])].slice(0, 4),
    projectHighlights,
    itProjectHighlights,
  };

  const hasAnyValue = Object.values(fields).some((value) => Array.isArray(value) ? value.length : Boolean(value));
  if (fields.candidateName && !isLikelyResumePersonName(fields.candidateName)) {
    fields.candidateName = inferResumeNameFromTitle(titleText);
  }
  return hasAnyValue
    ? canonicalizeResumeFields(fields, {
      title,
      sourceName: title,
      fullText: text,
    })
    : undefined;
}
