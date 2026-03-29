import type { ResumeFields } from './document-parser.js';

export type ResumeCanonicalizationContext = {
  title?: string;
  sourceName?: string;
  summary?: string;
  excerpt?: string;
  fullText?: string;
};

const RESUME_HINT_PATTERN = /\b(?:resume|curriculum vitae|cv)\b|简历|履历|候选人|求职/i;
const NAME_NOISE_PATTERN = /^(?:resume|cv|简历|个人简历|候选人|姓名|name|求职意向|基本信息|建立同比|年龄|男|女|本人|我的|并制作|个人)$/i;
const NAME_ROLE_PATTERN = /(?:经理|总监|工程师|主管|专员|顾问|销售|运营|产品|设计师|程序员|开发|leader|负责人)$/i;
const CONTACT_NOISE_PATTERN = /联系电话|电话|手机|邮箱|email|wechat|微信|qq|mail/i;
const ROLE_NOISE_PATTERN = /求职意向|目标岗位|应聘岗位|当前职位|岗位职责|工作职责|工作内容|负责|参与|带领|管理/i;
const COMPANY_SUFFIX_PATTERN = /(?:有限责任公司|有限公司|股份有限公司|股份公司|公司|集团|科技|信息|软件|网络|系统|智能|电子|研究院|研究所|学院|大学|协会|中心|银行|医院|平台)/i;
const COMPANY_NOISE_PATTERN = /项目|职责|负责|参与|教育|学历|专业|经验|年限|薪资|期望|电话|邮箱|联系|技能|证书|住址|地址|年龄|婚姻|自我评价|简历|候选人|基本信息|核心能力|related_to/i;
const COMPANY_ACTION_PATTERN = /^(?:负责|参与|主导|推进|完成|统筹|带领|领导|帮助|协助|推动|实现|从0|熟悉|擅长|精通|我的|并|及|和)/;
const PROJECT_KEYWORD_PATTERN = /(?:项目|系统|平台|应用|工程|方案|中台|小程序|APP|网站|商城|ERP|CRM|MES|WMS|SRM|BI|IoT|AIGC|AI|广告投放|风控|物业|社区|电商|运营平台|数据平台|管理平台|智慧)/i;
const PROJECT_NOISE_PATTERN = /电话|邮箱|学历|教育|专业|期望|薪资|求职|工作经历|教育经历|自我评价|简历|候选人|related_to|基本信息/i;
const PROJECT_ACTION_PATTERN = /^(?:负责|参与|主导|推进|推动|完成|统筹|带领|领导|优化|设计|开发|实施|维护|对接|擅长|保障|协调)/;
const DEGREE_PATTERN = /(博士后|博士|硕士|研究生|MBA|EMBA|本科|学士|大专|专科|中专|高中)/i;
const SKILL_NOISE_PATTERN = /^(?:求职意向|基本信息|我的|并制作|related_to)$/i;
function uniqStrings(values: Array<string | undefined | null>) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeText(value: unknown, maxLength = 160) {
  const text = String(value || '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function stripFileExtension(value: string) {
  return value.replace(/\.[a-z0-9]{1,8}$/i, '');
}

function stripCommonLabelPrefix(value: string) {
  return value.replace(/^(?:姓名|name|候选人|简历|个人简历|目标岗位|应聘岗位|求职意向|当前职位|最近公司|公司|项目经历|项目|学历|专业)[:：]?\s*/i, '').trim();
}

function stripSkillLabelPrefix(value: string) {
  return value.replace(/^(?:技能|技能标签|核心技能|专业技能|技术栈)[:：]?\s*/i, '').trim();
}

function isLikelyPersonName(value: string) {
  const text = normalizeText(value, 40);
  if (!text) return false;
  if (NAME_NOISE_PATTERN.test(text)) return false;
  if (NAME_ROLE_PATTERN.test(text)) return false;
  if (CONTACT_NOISE_PATTERN.test(text)) return false;
  if (COMPANY_SUFFIX_PATTERN.test(text)) return false;
  if (/^(?:default|sample|test|demo|resume)[a-z0-9-]*$/i.test(text)) return false;
  if (/^[a-z0-9-]{8,}$/i.test(text)) return false;
  if (/^(?:负责|参与|主导|推进|推动|完成|统筹|带领|领导|优化|设计|开发|实施|维护|对接|擅长|保障|协调)/u.test(text)) return false;
  if (/[,:;|/\\()（）【】[\]<>]/.test(text)) return false;
  if (/\d{2,}/.test(text)) return false;
  if (/^[A-Za-z][A-Za-z\s.-]{1,40}$/.test(text)) return true;
  if (/^[\u4e00-\u9fff·]{2,4}$/.test(text)) return true;
  if (/^[\u4e00-\u9fff·]{2,4}(?:先生|女士)$/.test(text)) return true;
  return false;
}

function isResumeLikeContext(context: ResumeCanonicalizationContext) {
  return RESUME_HINT_PATTERN.test([
    context.title,
    context.sourceName,
    context.summary,
    context.excerpt,
  ].map((value) => String(value || '')).join(' '));
}

function collectContextTexts(context: ResumeCanonicalizationContext) {
  return uniqStrings([
    stripFileExtension(normalizeText(context.sourceName, 120)),
    normalizeText(context.title, 120),
    normalizeText(context.summary, 240),
    normalizeText(context.excerpt, 240),
    normalizeText(String(context.fullText || '').slice(0, 1200), 1200),
  ]);
}

function extractNameCandidates(text: string) {
  const normalized = normalizeText(text, 240);
  if (!normalized) return [] as string[];

  const candidates: string[] = [];
  const patterns = [
    /(?:姓名|name|候选人)[:：]?\s*([A-Za-z\u4e00-\u9fff·]{2,24})/gi,
    /([A-Za-z\u4e00-\u9fff·]{2,24})(?:简历|履历|个人简历)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      candidates.push(match[1] || '');
    }
  }

  const rawCandidates = normalized
    .split(/[|,，;；/]/)
    .map((item) => stripCommonLabelPrefix(item))
    .filter(Boolean);
  candidates.push(...rawCandidates);
  return uniqStrings(candidates);
}

function pickCandidateName(fields: ResumeFields | null | undefined, context: ResumeCanonicalizationContext) {
  const candidates = uniqStrings([
    ...(fields?.candidateName ? [fields.candidateName] : []),
    ...collectContextTexts(context).flatMap((value) => extractNameCandidates(value)),
  ]);

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate, 40)
      .replace(/^(?:简历|个人简历|候选人)[:：]?\s*/i, '')
      .replace(/(?:简历|履历)$/i, '')
      .trim();
    if (isLikelyPersonName(normalized)) return normalized;
  }

  return '';
}

function canonicalizeScalar(value: unknown, maxLength = 60, blockPattern?: RegExp) {
  const text = stripCommonLabelPrefix(normalizeText(value, maxLength));
  if (!text) return '';
  if (CONTACT_NOISE_PATTERN.test(text)) return '';
  if (blockPattern?.test(text)) return '';
  return text;
}

function canonicalizeYearsOfExperience(fields: ResumeFields | null | undefined, context: ResumeCanonicalizationContext) {
  const values = uniqStrings([
    fields?.yearsOfExperience,
    context.summary,
    context.excerpt,
    String(context.fullText || '').slice(0, 1200),
  ]);

  for (const value of values) {
    const normalized = normalizeText(value, 120);
    const plusMatch = normalized.match(/(\d{1,2})\s*(?:\+年?|\+|年以上|years?\+)/i);
    if (plusMatch) {
      const years = Number(plusMatch[1]);
      if (Number.isFinite(years) && years > 0 && years <= 40) return `${years}+年`;
    }
    const match = normalized.match(/(\d{1,2})\s*(?:年|years?)/i);
    if (!match) continue;
    const years = Number(match[1]);
    if (!Number.isFinite(years) || years <= 0 || years > 40) continue;
    return `${years}年`;
  }

  return '';
}

function canonicalizeEducation(fields: ResumeFields | null | undefined, context: ResumeCanonicalizationContext) {
  const values = uniqStrings([
    fields?.education,
    context.summary,
    context.excerpt,
    String(context.fullText || '').slice(0, 800),
  ]);

  for (const value of values) {
    const normalized = normalizeText(value, 160);
    const match = normalized.match(DEGREE_PATTERN);
    if (!match) continue;
    const degree = String(match[1] || '').toUpperCase();
    if (degree === '学士') return '本科';
    if (degree === '研究生') return '硕士';
    return degree;
  }

  return '';
}

function extractCompanyCandidates(value: string) {
  const normalized = stripCommonLabelPrefix(normalizeText(value, 160));
  if (!normalized) return [] as string[];
  const candidates = new Set<string>();
  const segments = normalized
    .split(/[|；;\/]/)
    .flatMap((item) => item.split(/[，,]/))
    .map((item) => item.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (segment.length > 48) continue;
    const companyMatch = segment.match(/([\u4e00-\u9fffA-Za-z0-9（）()·&\-.]{2,48}(?:有限责任公司|有限公司|股份有限公司|股份公司|集团|科技|信息|软件|网络|系统|智能|电子|研究院|研究所|学院|大学|协会|中心|银行|医院|平台))/i);
    if (companyMatch?.[1]) {
      candidates.add(companyMatch[1]);
      continue;
    }
    if (COMPANY_SUFFIX_PATTERN.test(segment) && !COMPANY_NOISE_PATTERN.test(segment)) {
      candidates.add(segment);
    }
  }

  return [...candidates];
}

function canonicalizeCompany(value: string) {
  for (const candidate of extractCompanyCandidates(value)) {
    const normalized = normalizeText(candidate, 48)
      .replace(/[，,；;:：|]+$/g, '')
      .trim();
    if (!normalized) continue;
    const hasExplicitOrgSuffix = /(?:有限责任公司|有限公司|股份有限公司|股份公司|公司|集团|银行|研究院|研究所|学院|大学|协会|中心|医院)$/i.test(normalized);
    if (COMPANY_NOISE_PATTERN.test(normalized)) continue;
    if (COMPANY_ACTION_PATTERN.test(normalized)) continue;
    if (/^(?:\d+年|[一二三四五六七八九十]+年)/u.test(normalized)) continue;
    if (/(智能化|信息化|等信息)/u.test(normalized) && !hasExplicitOrgSuffix) continue;
    if (/(?:可视化|BIM)/iu.test(normalized) && !hasExplicitOrgSuffix) continue;
    if (/大学[\u4e00-\u9fff]{1,4}$/u.test(normalized) && !/(大学|学院|研究院)$/u.test(normalized)) continue;
    if (normalized.length > 24 && !hasExplicitOrgSuffix) continue;
    if (/^[A-Z0-9][A-Za-z0-9& .-]{1,18}(智能|科技|信息|软件|网络|系统|平台|电子)$/i.test(normalized)) continue;
    return normalized;
  }
  return '';
}

function canonicalizeCompanies(fields: ResumeFields | null | undefined, context: ResumeCanonicalizationContext) {
  const values = uniqStrings([
    fields?.latestCompany,
    ...(fields?.companies || []),
    context.summary,
    context.excerpt,
  ]);

  return uniqStrings(values.map((value) => canonicalizeCompany(value))).slice(0, 8);
}

function cleanProjectFragment(value: string) {
  const normalized = stripCommonLabelPrefix(normalizeText(value, 160))
    .replace(/^[•●⚫·\-\d.,、)\s]+/u, '')
    .trim();
  if (!normalized) return '';
  if (PROJECT_NOISE_PATTERN.test(normalized)) return '';
  if (/^(?:核心能力|基本信息|工作经历|教育背景|项目职责)[:：]/.test(normalized)) return '';
  if (/^(?:负责|参与|主导|推进|完成|统筹|带领|领导).{0,12}项目(?:的|管理|经验|工作)/.test(normalized)) return '';
  if (PROJECT_ACTION_PATTERN.test(normalized) && /[与和及、]/u.test(normalized)) return '';
  if (PROJECT_ACTION_PATTERN.test(normalized) && !PROJECT_KEYWORD_PATTERN.test(normalized)) return '';

  const colonSplit = normalized.split(/[:：]/).map((item) => item.trim()).filter(Boolean);
  if (colonSplit.length >= 2 && PROJECT_KEYWORD_PATTERN.test(colonSplit[0]) && colonSplit[0].length <= 36) {
    return colonSplit[0];
  }

  const phraseSource = normalized
    .replace(/^(?:(?:负责|参与|主导|推进|完成|统筹|带领|领导|优化|设计|开发|实施|维护|对接|跟进|制定|搭建|制作|管理)\s*(?:了|过|并)?)+/u, '')
    .trim();
  const explicitProject = phraseSource.match(/([\u4e00-\u9fffA-Za-z0-9·()（）\-/]{2,28}(?:项目|系统|平台|应用|工程|方案|中台|小程序|APP|网站|商城|ERP|CRM|MES|WMS|SRM|BI))/i);
  if (explicitProject?.[1]) {
    let projectText = explicitProject[1].trim();
    const suffixMatch = projectText.match(/(项目|系统|平台|应用|工程|方案|中台|小程序|APP|网站|商城|ERP|CRM|MES|WMS|SRM|BI)$/i);
    if (/[与和及、]/u.test(projectText)) {
      const firstSegment = projectText.split(/[与和及、]/u).map((item) => item.trim()).filter(Boolean)[0] || projectText;
      projectText = suffixMatch?.[1] && !firstSegment.endsWith(suffixMatch[1]) ? `${firstSegment}${suffixMatch[1]}` : firstSegment;
    }
    if (projectText && !COMPANY_NOISE_PATTERN.test(projectText)) {
      return projectText;
    }
  }

  const segments = normalized
    .split(/[，,；;|]/)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (segment.length < 4 || segment.length > 42) continue;
    if (/^(?:负责|参与|主导|推进|完成|统筹|带领|领导).{0,12}项目(?:的|管理|经验|工作)/.test(segment)) continue;
    if (PROJECT_ACTION_PATTERN.test(segment) && !PROJECT_KEYWORD_PATTERN.test(segment)) continue;
    if (PROJECT_KEYWORD_PATTERN.test(segment) && !COMPANY_NOISE_PATTERN.test(segment)) {
      return segment;
    }
  }

  if (normalized.length >= 4 && normalized.length <= 36 && PROJECT_KEYWORD_PATTERN.test(normalized)) {
    return normalized;
  }

  return '';
}

function canonicalizeProjectHighlights(fields: ResumeFields | null | undefined) {
  const values = uniqStrings([
    ...(fields?.projectHighlights || []),
    ...(fields?.itProjectHighlights || []),
    ...(fields?.highlights || []),
  ]);

  return uniqStrings(values.map((value) => cleanProjectFragment(value))).slice(0, 8);
}

function canonicalizeItProjectHighlights(fields: ResumeFields | null | undefined, projectHighlights: string[]) {
  const values = uniqStrings([...(fields?.itProjectHighlights || []), ...projectHighlights]);
  return uniqStrings(values.map((value) => cleanProjectFragment(value)))
    .filter((value) => /IT|系统|平台|接口|架构|ERP|CRM|MES|WMS|IoT|API|AIGC|AI|数据|小程序|APP|网站/i.test(value))
    .slice(0, 6);
}

function canonicalizeSkills(fields: ResumeFields | null | undefined) {
  const values = uniqStrings((fields?.skills || []).flatMap((item) => normalizeText(item, 80).split(/[、/|,，]/)));
  return values
    .map((item) => stripSkillLabelPrefix(item))
    .map((item) => item.replace(/\bmysql\b/i, 'MySQL').replace(/\bredis\b/i, 'Redis').replace(/\bkafka\b/i, 'Kafka').replace(/\bsql\b/i, 'SQL').replace(/\bjava\b/i, 'Java').replace(/\bgo\b/i, 'Go').replace(/\bpython\b/i, 'Python'))
    .filter((item) => item && item.length >= 2 && item.length <= 30 && !SKILL_NOISE_PATTERN.test(item) && !COMPANY_NOISE_PATTERN.test(item) && !CONTACT_NOISE_PATTERN.test(item))
    .slice(0, 12);
}

function canonicalizeHighlights(fields: ResumeFields | null | undefined, projectHighlights: string[]) {
  const values = uniqStrings([...(fields?.highlights || []), ...projectHighlights]);
  return values
    .map((item) => normalizeText(item, 120))
    .filter((item) => item && item.length <= 80 && !PROJECT_NOISE_PATTERN.test(item))
    .slice(0, 8);
}

function canonicalizeCity(value: unknown) {
  const text = canonicalizeScalar(value, 24, /经验|学历|薪资|项目|职责|负责/i);
  if (!text || /\d/.test(text)) return '';
  return text;
}

function canonicalizeSalary(value: unknown) {
  const normalized = canonicalizeScalar(value, 24, /学历|项目|职责|电话|邮箱/i);
  if (!normalized) return '';
  const match = normalized.match(/(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?\s*(?:K|k|W|w|万|元\/月|元))/);
  return match?.[1] || normalized;
}

function hasAnyResumeValues(fields: ResumeFields) {
  return Object.values(fields).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));
}

export function canonicalizeResumeFields(
  fields?: ResumeFields | null,
  context: ResumeCanonicalizationContext = {},
): ResumeFields | undefined {
  if (!fields && !isResumeLikeContext(context)) return undefined;

  const candidateName = pickCandidateName(fields, context);
  const companies = canonicalizeCompanies(fields, context);
  const latestCompany = canonicalizeCompany(fields?.latestCompany || '') || companies[0] || '';
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
