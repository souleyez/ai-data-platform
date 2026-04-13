import type { ParsedDocument, ResumeFields } from './document-parser.js';
import { isLikelyResumePersonName } from './document-schema.js';
import { sanitizeResumeDisplayCompany } from './resume-display-company.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import { isWeakResumeCandidateName, mergeResumeFields } from './resume-canonicalizer.js';

export type ResumePageEntry = {
  candidateName: string;
  education: string;
  latestCompany: string;
  yearsOfExperience: string;
  skills: string[];
  projectHighlights: string[];
  itProjectHighlights: string[];
  highlights: string[];
  expectedCity: string;
  expectedSalary: string;
  sourceName: string;
  sourceTitle: string;
  summary: string;
};

export type ResumeShowcaseProject = {
  label: string;
  value: number;
  ownerName: string;
  ownerKey: string;
  company: string;
  companyKey: string;
  fit: string;
};

export type ResumePageStats = {
  entries: ResumePageEntry[];
  candidateCount: number;
  companyCount: number;
  projectCount: number;
  skillCount: number;
  companies: Array<{ label: string; value: number }>;
  projects: Array<{ label: string; value: number }>;
  skills: Array<{ label: string; value: number }>;
  educations: Array<{ label: string; value: number }>;
  candidateLines: string[];
  companyLines: string[];
  projectLines: string[];
  skillLines: string[];
  salaryLines: string[];
  showcaseCandidateNames: string[];
  showcaseProjectLabels: string[];
  showcaseProjects: ResumeShowcaseProject[];
};

const STRICT_RESUME_GENERIC_PROJECT_LABELS = new Set([
  '\u5e73\u53f0',
  '\u7cfb\u7edf',
  '\u9879\u76ee',
  '\u65b9\u6848',
  '\u9500\u552e\u65b9\u6848',
  '\u7cfb\u7edf\u642d\u5efa\u4e0e\u4e0a\u7ebf',
  '\u4f18\u5316\u4e86\u5e73\u53f0',
]);
const STRICT_RESUME_SECTION_SPLIT_PATTERN =
  /\u5de5\u4f5c\u7ecf\u5386|\u6838\u5fc3\u80fd\u529b|\u6559\u80b2\u80cc\u666f|\u8054\u7cfb\u65b9\u5f0f/u;
const STRICT_RESUME_PROJECT_KEYWORD_PATTERN =
  /(?:\u9879\u76ee|project|\u7cfb\u7edf|\u5e73\u53f0|\u65b9\u6848|\u667a\u80fd|\u5ea7\u8231|\u6d88\u9632|\u56ed\u533a|aigc|\u7269\u8054\u7f51|\u4ea4\u4ed8|\u6539\u9020|\u8fd0\u8425|\u7535\u5546|\u98ce\u63a7|\u770b\u677f|\u4e2d\u53f0|\u7814\u53d1)/iu;
const STRICT_RESUME_PROJECT_SUFFIX_PATTERN =
  /([\u4e00-\u9fffA-Za-z0-9()（）\-/]{2,24}(?:\u9879\u76ee|project|\u7cfb\u7edf|\u5e73\u53f0|\u4e2d\u53f0|\u5c0f\u7a0b\u5e8f|APP|\u7f51\u7ad9|\u5546\u57ce|ERP|CRM|MES|WMS|SRM|BI|IoT|IOT|AIGC|AI))/iu;
const STRICT_RESUME_ACTION_LEAD_PATTERN =
  /^(?:\u8d1f\u8d23|\u53c2\u4e0e|\u534f\u52a9|\u7ef4\u62a4|\u8ddf\u8fdb|\u5236\u5b9a|\u5b8c\u6210|\u4f18\u5316|\u63a8\u8fdb|\u4e3b\u5bfc|\u5e26\u9886|\u7ba1\u7406|\u6d4b\u8bd5|\u652f\u6301|\u5b9e\u65bd|\u7f16\u5199|\u8bbe\u8ba1|\u5f00\u53d1|\u642d\u5efa|\u4e0a\u7ebf)/u;
const STRICT_RESUME_WEAK_PROJECT_DETAIL_PATTERN =
  /(?:\u5ba2\u6237\u5173\u7cfb|\u9879\u76ee\u8fdb\u5ea6|\u56de\u6b3e\u60c5\u51b5|\u7ed3\u7b97\u60c5\u51b5|\u9500\u552e\u65b9\u6848|\u9879\u76ee\u7acb\u9879|\u4ee3\u7801\u8d28\u91cf\u7ba1\u63a7|\u5f00\u53d1\u8fdb\u5ea6\u628a\u63a7|\u57f9\u8bad\u6280\u672f\u5458|\u6838\u5fc3\u529f\u80fd)/u;
const STRICT_RESUME_NOISY_HIGHLIGHT_PUNCTUATION_PATTERN = /[;；]/u;
const STRICT_RESUME_SENTENCE_END_PATTERN = /[。；;]/u;
const UNKNOWN_COMPANY = '未明确公司';

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item)).filter(Boolean);
}

function normalizeUniqueStrings(values: unknown[], limit = 8) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = sanitizeText(value);
    if (!text) continue;
    const normalized = normalizeText(text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function getResumeProfile(item: ParsedDocument) {
  return (item.structuredProfile || {}) as Record<string, unknown>;
}

function sanitizeResumeCandidateName(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return '';
  if (/^(resume|姓名|年龄|工作经验|年工作经验|邮箱|电话|手机|个人|基本信息)$/i.test(text)) return '';
  if (/^(?:default|sample|test|demo|resume)[a-z0-9-]*$/i.test(text)) return '';
  if (/^[a-z0-9-]{8,}$/i.test(text)) return '';
  if (/^(?:个人简历|候选人简历)$/u.test(text)) return '';
  if (/^(?:\u5728|\u4e8e|\u4ece|\u5bf9|\u5411|\u548c|\u4e0e|\u53ca|\u7531|\u5c06|\u628a|\u6765\u81ea)[\u4e00-\u9fff]{1,3}$/u.test(text)) return '';
  return isLikelyResumePersonName(text) ? text : '';
}

function extractResumeCandidateNameFromText(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return '';
  const tokenScanAllowed = /(?:resume|\u7b80\u5386|\u59d3\u540d|\u5019\u9009\u4eba)/iu.test(text);

  const direct = sanitizeResumeCandidateName(text);
  if (direct) return direct;

  const patterns = [
    /resume\s*[:：-]?\s*([\u4e00-\u9fff·]{2,12})/i,
    /简历\s*[:：-]?\s*([\u4e00-\u9fff·]{2,12})/i,
    /^([\u4e00-\u9fff·]{2,12})(?:[，,\s]|男|女|求职|工作|现居|本科|硕士|研究生|mba|大专|博士)/i,
    /([\u4e00-\u9fff·]{2,12})[，,]\d{1,2}岁/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = sanitizeResumeCandidateName(match?.[1]);
    if (candidate) return candidate;
  }

  const tokenMatches = text.match(/[\u4e00-\u9fff·]{2,12}/gu) || [];
  if (!tokenScanAllowed) return '';
  for (const token of tokenMatches.slice(0, 12)) {
    const candidate = sanitizeResumeCandidateName(token);
    if (candidate) return candidate;
  }

  return '';
}

function extractStrongResumeCandidateName(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return '';
  const tokenScanAllowed = /(?:resume|\u7b80\u5386|\u59d3\u540d|\u5019\u9009\u4eba)/iu.test(text);

  const patterns = [
    /(?:resume|\u7b80\u5386)[:：]?\s*([\u4e00-\u9fff\u00b7]{2,4})/iu,
    /(?:\u59d3\u540d|\u5019\u9009\u4eba)[:：]?\s*([\u4e00-\u9fff\u00b7]{2,4})/u,
    /^([\u4e00-\u9fff\u00b7]{2,4})(?:\u7b80\u5386|，|,|\s|\u7537|\u5973|\u6c42\u804c|\u5de5\u4f5c|\u73b0\u5c45|\u672c\u79d1|\u7855\u58eb|\u7814\u7a76\u751f|MBA|\u5927\u4e13|\u535a\u58eb)/u,
  ];

  for (const pattern of patterns) {
    const candidate = sanitizeResumeCandidateName(text.match(pattern)?.[1]);
    if (!candidate || isWeakResumeCandidateName(candidate)) continue;
    return candidate;
  }

  if (!tokenScanAllowed) return '';
  const tokenMatches = text.match(/[\u4e00-\u9fff\u00b7]{2,4}/gu) || [];
  for (const token of tokenMatches.slice(0, 8)) {
    const candidate = sanitizeResumeCandidateName(token);
    if (!candidate || isWeakResumeCandidateName(candidate)) continue;
    return candidate;
  }

  return '';
}

function pickResumeDisplayName(values: unknown[]) {
  const strongCandidates: string[] = [];
  const weakCandidates: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const candidates = [
      sanitizeResumeCandidateName(value),
      extractStrongResumeCandidateName(value),
      extractResumeCandidateNameFromText(value),
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (isWeakResumeCandidateName(candidate)) {
        weakCandidates.push(candidate);
        continue;
      }
      strongCandidates.push(candidate);
    }
  }

  const weakDisplayCandidate = weakCandidates.find((candidate) => !/^(?:\u7537\u6027|\u5973\u6027|\u7537|\u5973|\u6c42\u804c\u610f\u5411|\u57fa\u672c\u4fe1\u606f|\u4e2a\u4eba\u4fe1\u606f|\u76ee\u6807\u5c97\u4f4d|\u5e94\u8058\u5c97\u4f4d|\u5f53\u524d\u804c\u4f4d|\d+\+?\u5e74|\d+\u5e74|\u5e74\u5de5\u4f5c\u7ecf|\u5de5\u4f5c\u7ecf\u9a8c|\u5de5\u4f5c\u5e74\u9650|\u5e74\u7ecf\u9a8c)$/u.test(candidate));
  return strongCandidates[0] || weakDisplayCandidate || '';
}

function buildResumeFileBaseName(value: string) {
  return sanitizeText(String(value || '').replace(/\.[a-z0-9]+$/i, '').replace(/^\d{8,16}-/, ''));
}

function sanitizeResumeCompany(value: unknown) {
  const raw = sanitizeText(value);
  if (!raw) return '';
  const text = raw
    .replace(/^(至今|现任|历任|曾任|负责过|负责|就职于|任职于)\s*/u, '')
    .split(/核心能力|工作经历|项目经历|教育背景|联系方式/u)[0]
    .split(/[，。；]/u)[0]
    .trim();
  if (!text) return '';
  const hasExplicitOrgSuffix = /(公司|集团|股份|银行|研究院|研究所|学院|大学|协会|中心|医院|平台)$/u.test(text);
  if (/@/.test(text)) return '';
  if (text.length > 40) return '';
  if (/^(?:\d+年|[一二三四五六七八九十]+年)/u.test(text)) return '';
  if (/^(?:负责|参与|主导|推进|完成|统筹|带领|领导|帮助|协助|推动|实现|从0)/u.test(text)) return '';
  if (/^(?:AIGC|AI|BI|ERP|CRM|MES|WMS|SaaS|IoT|IOT)[A-Za-z0-9\u4e00-\u9fff·()（）\-/]{0,12}(?:智能|科技|信息|软件|网络|系统|平台)?$/i.test(text)) return '';
  if (/电话|手机|邮箱|工作经验|年工作经验|年龄|求职|简历|resume|负责|创立|建立|经营|销售额|同比|工作经历|核心能力|related_to/i.test(text)) return '';
  if (/营收|增长|成功/u.test(text)) return '';
  if (/(智能化|信息化)/u.test(text) && !hasExplicitOrgSuffix) return '';
  if (/(?:可视化|BIM|等信息)/iu.test(text) && !hasExplicitOrgSuffix) return '';
  if (/大学[\u4e00-\u9fff]{1,4}$/u.test(text) && !/(大学|学院|研究院)$/u.test(text)) return '';
  if (/\d{4}/.test(text)) return '';
  return text;
}

function sanitizeResumeProjectHighlight(value: unknown) {
  const text = sanitizeText(value)
    .replace(/^[\u2022\u2023\u25cf\-\d.\s]+/u, '')
    .split(STRICT_RESUME_SECTION_SPLIT_PATTERN)[0]
    .trim();
  if (!text) return '';
  if (text.length > 50) return '';
  if (/related_to|mailto:|@/i.test(text)) return '';
  if (/[\uFF0C\uFF1F]/u.test(text)) return '';
  return STRICT_RESUME_PROJECT_KEYWORD_PATTERN.test(text) ? text : '';
}

function sanitizeResumeProjectHighlightStrict(value: unknown) {
  const text = sanitizeResumeProjectHighlight(value);
  if (!text) return '';
  const explicitMatch = text.match(STRICT_RESUME_PROJECT_SUFFIX_PATTERN);
  const candidate = sanitizeText((explicitMatch?.[1] || text).replace(/^(?:\u8fc7)(?=[\u4e00-\u9fffA-Za-z0-9])/u, ''));
  if (!candidate) return '';
  if (STRICT_RESUME_GENERIC_PROJECT_LABELS.has(candidate)) return '';
  if (/^(?:[a-z][\u3001\uFF0C\uFF1A\s]*)/i.test(candidate)) return '';
  if (STRICT_RESUME_ACTION_LEAD_PATTERN.test(candidate)) return '';
  if (STRICT_RESUME_WEAK_PROJECT_DETAIL_PATTERN.test(candidate)) return '';
  return candidate;
}

function sanitizeResumeHighlightText(value: unknown) {
  const text = sanitizeText(value)
    .split(STRICT_RESUME_SECTION_SPLIT_PATTERN)[0]
    .trim();
  if (!text) return '';
  if (text.length > 90) return '';
  if (/related_to|mailto:|@/i.test(text)) return '';
  if (/^(?:[a-z][\u3001\uFF0C\uFF1A\s]*)/i.test(text)) return '';
  if (STRICT_RESUME_ACTION_LEAD_PATTERN.test(text)) return '';
  if (STRICT_RESUME_NOISY_HIGHLIGHT_PUNCTUATION_PATTERN.test(text)) return '';
  if (STRICT_RESUME_SENTENCE_END_PATTERN.test(text) && text.length > 48) return '';
  return text;
}

function extractResumeCompanyFromText(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return '';

  const patterns = [
    /([\u4e00-\u9fffA-Za-z0-9·()（）\-/]{4,48}(?:股份有限公司|有限责任公司|有限公司|集团|科技有限公司|信息技术有限公司|电子科技有限公司|网络科技有限公司|地产集团|银行|研究院|联合会))/u,
    /([\u4e00-\u9fffA-Za-z0-9·()（）\-/]{4,48}(?:公司|集团|科技|网络|信息|智能|银行|研究院|联合会))/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const company = sanitizeResumeCompany(match?.[1]);
    if (company) return company;
  }

  return '';
}

export function buildRankedLabelCounts(values: string[], limit = 8) {
  const counts = new Map<string, { label: string; value: number }>();
  for (const value of values) {
    const label = sanitizeText(value);
    if (!label) continue;
    const normalized = normalizeText(label);
    if (!normalized) continue;
    const next = counts.get(normalized);
    if (next) {
      next.value += 1;
      continue;
    }
    counts.set(normalized, { label, value: 1 });
  }

  return [...counts.values()]
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'zh-CN'))
    .slice(0, limit);
}

export function joinRankedLabels(items: Array<{ label: string; value: number }>, limit = 4) {
  return items
    .slice(0, limit)
    .map((item) => `${item.label}${item.value > 1 ? `(${item.value})` : ''}`)
    .join('、');
}

function parseResumeExperienceYears(value: string) {
  const match = sanitizeText(value).match(/(\d{1,2})(?:\+)?\s*(?:年|yrs?|years?)/iu);
  if (!match) return 0;
  return Number(match[1] || 0);
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

export function getResumeDisplayName(entry: ResumePageEntry) {
  return pickResumeDisplayName([
    entry.candidateName,
    entry.sourceTitle,
    buildResumeFileBaseName(entry.sourceName),
    entry.summary,
  ]);
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

function scoreResumeEntry(entry: ResumePageEntry) {
  let score = 0;
  const displayName = getResumeDisplayName(entry);
  if (displayName) score += isWeakResumeCandidateName(displayName) ? 6 : 18;
  if (entry.latestCompany) score += 14;
  if (entry.itProjectHighlights.length) score += 12 + Math.min(entry.itProjectHighlights.length, 3) * 2;
  else if (entry.projectHighlights.length) score += 6 + Math.min(entry.projectHighlights.length, 3);
  score += Math.min(entry.skills.length, 4) * 3;
  if (entry.education) score += 2;
  if (entry.summary || entry.highlights.length) score += 2;
  score += Math.min(parseResumeExperienceYears(entry.yearsOfExperience), 20);
  return score;
}

function sortResumeEntriesForClientShowcase(entries: ResumePageEntry[]) {
  return [...entries].sort((left, right) => (
    scoreResumeEntry(right) - scoreResumeEntry(left)
    || right.itProjectHighlights.length - left.itProjectHighlights.length
    || right.projectHighlights.length - left.projectHighlights.length
    || right.skills.length - left.skills.length
    || parseResumeExperienceYears(right.yearsOfExperience) - parseResumeExperienceYears(left.yearsOfExperience)
    || getResumeDisplayName(left).localeCompare(getResumeDisplayName(right), 'zh-CN')
  ));
}

function buildWeightedResumeProjectCountIndex(entries: ResumePageEntry[]) {
  const counts = new Map<string, { label: string; value: number; priority: number }>();
  for (const entry of entries) {
    const priority = scoreResumeEntry(entry);
    const labels = (entry.itProjectHighlights.length ? entry.itProjectHighlights : entry.projectHighlights)
      .map((item) => sanitizeText(item))
      .filter(Boolean);
    for (const label of labels) {
      const normalized = normalizeText(label);
      if (!normalized) continue;
      const next = counts.get(normalized);
      if (next) {
        next.value += 1;
        next.priority = Math.max(next.priority, priority);
        continue;
      }
      counts.set(normalized, { label, value: 1, priority });
    }
  }

  return counts;
}

function buildWeightedResumeProjectCounts(entries: ResumePageEntry[], limit = 10) {
  const counts = buildWeightedResumeProjectCountIndex(entries);

  return [...counts.values()]
    .sort((left, right) => (
      right.value - left.value
      || right.priority - left.priority
      || left.label.localeCompare(right.label, 'zh-CN')
    ))
    .slice(0, limit)
    .map(({ label, value }) => ({ label, value }));
}

function buildResumeCandidateFit(entry: ResumePageEntry) {
  return normalizeUniqueStrings([
    ...(entry.itProjectHighlights.length ? entry.itProjectHighlights.slice(0, 1) : entry.projectHighlights.slice(0, 1)),
    ...entry.skills.slice(0, 2),
  ], 3).join(' / ');
}

function buildResumeProjectShowcase(entries: ResumePageEntry[], limit = 5): ResumeShowcaseProject[] {
  const counts = buildWeightedResumeProjectCountIndex(entries);
  const candidates: Array<ResumeShowcaseProject & { priority: number }> = [];

  for (const entry of entries) {
    const ownerName = getResumeDisplayName(entry);
    const ownerKey = normalizeText(ownerName || entry.sourceName || entry.latestCompany || 'resume-project');
    const companyKey = normalizeText(entry.latestCompany || ownerName || 'resume-company');
    const fit = buildResumeCandidateFit(entry);
    const labels = normalizeUniqueStrings(
      entry.itProjectHighlights.length ? entry.itProjectHighlights : entry.projectHighlights,
      6,
    );

    for (const label of labels) {
      const normalized = normalizeText(label);
      if (!normalized) continue;
      const count = counts.get(normalized);
      candidates.push({
        label: count?.label || label,
        value: count?.value || 1,
        ownerName,
        ownerKey,
        company: entry.latestCompany,
        companyKey,
        fit,
        priority: count?.priority || scoreResumeEntry(entry),
      });
    }
  }

  candidates.sort((left, right) => (
    right.value - left.value
    || right.priority - left.priority
    || left.label.localeCompare(right.label, 'zh-CN')
  ));

  const selected: ResumeShowcaseProject[] = [];
  const usedLabels = new Set<string>();
  const usedOwners = new Set<string>();
  const usedCompanies = new Set<string>();

  const selectWith = (predicate: (item: ResumeShowcaseProject & { priority: number }) => boolean) => {
    for (const candidate of candidates) {
      if (selected.length >= limit) break;
      const labelKey = normalizeText(candidate.label);
      if (!labelKey || usedLabels.has(labelKey)) continue;
      if (!predicate(candidate)) continue;
      usedLabels.add(labelKey);
      if (candidate.ownerKey) usedOwners.add(candidate.ownerKey);
      if (candidate.companyKey) usedCompanies.add(candidate.companyKey);
      selected.push({
        label: candidate.label,
        value: candidate.value,
        ownerName: candidate.ownerName,
        ownerKey: candidate.ownerKey,
        company: candidate.company,
        companyKey: candidate.companyKey,
        fit: candidate.fit,
      });
    }
  };

  selectWith((candidate) => candidate.ownerKey ? !usedOwners.has(candidate.ownerKey) : true);
  if (selected.length < limit) {
    selectWith((candidate) => candidate.companyKey ? !usedCompanies.has(candidate.companyKey) : true);
  }
  if (selected.length < limit) {
    selectWith(() => true);
  }

  return selected;
}

function buildResumeCandidateLine(entry: ResumePageEntry) {
  const parts = [
    getResumeDisplayName(entry),
    entry.latestCompany ? `${entry.latestCompany}` : '',
    entry.yearsOfExperience || '',
    entry.education ? `学历 ${entry.education}` : '',
    buildResumeCandidateFit(entry) ? `匹配 ${buildResumeCandidateFit(entry)}` : '',
  ].filter(Boolean);
  return parts.join('，');
}

function buildResumeCompanyLine(item: { label: string; value: number }, stats: ResumePageStats) {
  const relatedCandidates = stats.entries
    .filter((entry) => entry.latestCompany === item.label)
    .map((entry) => getResumeDisplayName(entry))
    .filter(Boolean)
    .slice(0, 3);
  const candidateText = relatedCandidates.length ? `；代表候选人 ${relatedCandidates.join('、')}` : '';
  return `${item.label}：覆盖 ${item.value} 份简历${candidateText}`;
}

function buildResumeShowcaseProjectLine(item: ResumeShowcaseProject) {
  const ownerText = item.ownerName ? `：代表候选人 ${item.ownerName}` : '';
  const companyText = item.company ? `，关联公司 ${item.company}` : '';
  const fitText = item.fit ? `；匹配 ${item.fit}` : '';
  return `${item.label}${ownerText}${companyText}${fitText}`;
}

function buildResumeProjectLine(item: { label: string; value: number }, stats: ResumePageStats) {
  const owner = stats.entries.find((entry) => (
    entry.itProjectHighlights.includes(item.label) || entry.projectHighlights.includes(item.label)
  ));
  const ownerText = owner ? getResumeDisplayName(owner) : '';
  const companyText = owner?.latestCompany ? `，关联公司 ${owner.latestCompany}` : '';
  const fitText = owner ? buildResumeCandidateFit(owner) : '';
  return `${item.label}${ownerText ? `：代表候选人 ${ownerText}` : ''}${companyText}${fitText ? `；匹配 ${fitText}` : ''}`;
}

function buildResumeSkillLine(item: { label: string; value: number }, stats: ResumePageStats) {
  const candidates = stats.entries
    .filter((entry) => entry.skills.includes(item.label))
    .map((entry) => getResumeDisplayName(entry))
    .filter(Boolean)
    .slice(0, 3);
  return `${item.label}：覆盖 ${item.value} 位候选人${candidates.length ? `；代表候选人 ${candidates.join('、')}` : ''}`;
}

export function buildResumePageStats(entries: ResumePageEntry[]): ResumePageStats {
  const rankedEntries = sortResumeEntriesForClientShowcase(entries);
  const companies = buildRankedLabelCounts(rankedEntries.map((entry) => entry.latestCompany).filter(Boolean), 8);
  const projects = buildWeightedResumeProjectCounts(rankedEntries, 10);
  const showcaseProjects = buildResumeProjectShowcase(rankedEntries, 5);
  const skills = buildRankedLabelCounts(rankedEntries.flatMap((entry) => entry.skills).filter(Boolean), 10);
  const educations = buildRankedLabelCounts(rankedEntries.map((entry) => entry.education).filter(Boolean), 6);
  const salaryLines = normalizeUniqueStrings(
    rankedEntries
      .map((entry) => entry.expectedSalary)
      .filter(Boolean),
    6,
  );

  const stats: ResumePageStats = {
    entries: rankedEntries,
    candidateCount: new Set(rankedEntries.map((entry) => getResumeDisplayName(entry)).filter(Boolean)).size,
    companyCount: companies.length,
    projectCount: projects.length,
    skillCount: skills.length,
    companies,
    projects,
    skills,
    educations,
    candidateLines: [],
    companyLines: [],
    projectLines: [],
    skillLines: [],
    salaryLines,
    showcaseCandidateNames: [],
    showcaseProjectLabels: [],
    showcaseProjects,
  };

  stats.candidateLines = rankedEntries.filter((entry) => getResumeDisplayName(entry)).slice(0, 6).map(buildResumeCandidateLine);
  stats.companyLines = companies.map((item) => buildResumeCompanyLine(item, stats)).slice(0, 6);
  const showcaseProjectLabels = new Set(showcaseProjects.map((item) => normalizeText(item.label)).filter(Boolean));
  stats.projectLines = [
    ...showcaseProjects.map((item) => buildResumeShowcaseProjectLine(item)),
    ...projects
      .filter((item) => !showcaseProjectLabels.has(normalizeText(item.label)))
      .map((item) => buildResumeProjectLine(item, stats)),
  ].slice(0, 6);
  stats.skillLines = skills.map((item) => buildResumeSkillLine(item, stats)).slice(0, 6);
  const rankedCandidateNames = normalizeUniqueStrings(rankedEntries.map((entry) => getResumeDisplayName(entry)).filter(Boolean), 6);
  stats.showcaseCandidateNames = [
    ...rankedCandidateNames.filter((name) => !isWeakResumeCandidateName(name)),
    ...rankedCandidateNames.filter((name) => isWeakResumeCandidateName(name)),
  ].slice(0, 3);
  stats.showcaseProjectLabels = showcaseProjects.map((item) => item.label).slice(0, 3);
  return stats;
}
