import type { ResumeFields } from './document-parser.js';
import type { ResumeCanonicalizationContext } from './resume-canonicalizer-types.js';
import {
  COMPANY_ACTION_PATTERN,
  COMPANY_NOISE_PATTERN,
  COMPANY_SUFFIX_PATTERN,
  CONTACT_NOISE_PATTERN,
  DEGREE_PATTERN,
  PROJECT_ACTION_PATTERN,
  PROJECT_KEYWORD_PATTERN,
  PROJECT_NOISE_PATTERN,
  ROLE_NOISE_PATTERN,
  SKILL_NOISE_PATTERN,
  normalizeText,
  stripCommonLabelPrefix,
  stripSkillLabelPrefix,
  uniqStrings,
} from './resume-canonicalizer-utils.js';

export function canonicalizeScalar(value: unknown, maxLength = 60, blockPattern?: RegExp) {
  const text = stripCommonLabelPrefix(normalizeText(value, maxLength));
  if (!text) return '';
  if (CONTACT_NOISE_PATTERN.test(text)) return '';
  if (blockPattern?.test(text)) return '';
  return text;
}

export function canonicalizeYearsOfExperience(fields: ResumeFields | null | undefined, context: ResumeCanonicalizationContext) {
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

export function canonicalizeEducation(fields: ResumeFields | null | undefined, context: ResumeCanonicalizationContext) {
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

export function canonicalizeCompanies(fields: ResumeFields | null | undefined, context: ResumeCanonicalizationContext) {
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

export function canonicalizeProjectHighlights(fields: ResumeFields | null | undefined) {
  const values = uniqStrings([
    ...(fields?.projectHighlights || []),
    ...(fields?.itProjectHighlights || []),
    ...(fields?.highlights || []),
  ]);

  return uniqStrings(values.map((value) => cleanProjectFragment(value))).slice(0, 8);
}

export function canonicalizeItProjectHighlights(fields: ResumeFields | null | undefined, projectHighlights: string[]) {
  const values = uniqStrings([...(fields?.itProjectHighlights || []), ...projectHighlights]);
  return uniqStrings(values.map((value) => cleanProjectFragment(value)))
    .filter((value) => /IT|系统|平台|接口|架构|ERP|CRM|MES|WMS|IoT|API|AIGC|AI|数据|小程序|APP|网站/i.test(value))
    .slice(0, 6);
}

export function canonicalizeSkills(fields: ResumeFields | null | undefined) {
  const values = uniqStrings((fields?.skills || []).flatMap((item) => normalizeText(item, 80).split(/[、/|,，]/)));
  return values
    .map((item) => stripSkillLabelPrefix(item))
    .map((item) => item.replace(/\bmysql\b/i, 'MySQL').replace(/\bredis\b/i, 'Redis').replace(/\bkafka\b/i, 'Kafka').replace(/\bsql\b/i, 'SQL').replace(/\bjava\b/i, 'Java').replace(/\bgo\b/i, 'Go').replace(/\bpython\b/i, 'Python'))
    .filter((item) => item && item.length >= 2 && item.length <= 30 && !SKILL_NOISE_PATTERN.test(item) && !COMPANY_NOISE_PATTERN.test(item) && !CONTACT_NOISE_PATTERN.test(item))
    .slice(0, 12);
}

export function canonicalizeHighlights(fields: ResumeFields | null | undefined, projectHighlights: string[]) {
  const values = uniqStrings([...(fields?.highlights || []), ...projectHighlights]);
  return values
    .map((item) => normalizeText(item, 120))
    .filter((item) => item && item.length <= 80 && !PROJECT_NOISE_PATTERN.test(item))
    .slice(0, 8);
}

export function canonicalizeCity(value: unknown) {
  const text = canonicalizeScalar(value, 24, /经验|学历|薪资|项目|职责|负责/i);
  if (!text || /\d/.test(text)) return '';
  return text;
}

export function canonicalizeSalary(value: unknown) {
  const normalized = canonicalizeScalar(value, 24, /学历|项目|职责|电话|邮箱/i);
  if (!normalized) return '';
  const match = normalized.match(/(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?\s*(?:K|k|W|w|万|元\/月|元))/);
  return match?.[1] || normalized;
}

export function hasAnyResumeValues(fields: ResumeFields) {
  return Object.values(fields).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));
}
