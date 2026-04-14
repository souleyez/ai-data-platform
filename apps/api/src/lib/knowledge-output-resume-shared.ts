import { isLikelyResumePersonName } from './document-schema.js';
import { isWeakResumeCandidateName } from './resume-canonicalizer.js';
import type { ResumePageEntry } from './knowledge-output-resume-types.js';

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

export function getResumeDisplayName(entry: ResumePageEntry) {
  return pickResumeDisplayName([
    entry.candidateName,
    entry.sourceTitle,
    buildResumeFileBaseName(entry.sourceName),
    entry.summary,
  ]);
}

export {
  UNKNOWN_COMPANY,
  normalizeText,
  sanitizeText,
  toStringArray,
  normalizeUniqueStrings,
  sanitizeResumeCandidateName,
  sanitizeResumeCompany,
  sanitizeResumeProjectHighlightStrict,
  sanitizeResumeHighlightText,
  extractResumeCompanyFromText,
  parseResumeExperienceYears,
  pickResumeDisplayName,
  buildResumeFileBaseName,
};
