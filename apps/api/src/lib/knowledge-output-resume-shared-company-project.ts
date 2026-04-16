import { sanitizeText } from './knowledge-output-resume-shared-text.js';

const STRICT_RESUME_GENERIC_PROJECT_LABELS = new Set([
  '平台',
  '系统',
  '项目',
  '方案',
  '销售方案',
  '系统搭建与上线',
  '优化了平台',
]);
const STRICT_RESUME_SECTION_SPLIT_PATTERN = /工作经历|核心能力|教育背景|联系方式/u;
const STRICT_RESUME_PROJECT_KEYWORD_PATTERN =
  /(?:项目|project|系统|平台|方案|智能|座舱|消防|园区|aigc|物联网|交付|改造|运营|电商|风控|看板|中台|研发)/iu;
const STRICT_RESUME_PROJECT_SUFFIX_PATTERN =
  /([\u4e00-\u9fffA-Za-z0-9()（）\-/]{2,24}(?:项目|project|系统|平台|中台|小程序|APP|网站|商城|ERP|CRM|MES|WMS|SRM|BI|IoT|IOT|AIGC|AI))/iu;
const STRICT_RESUME_ACTION_LEAD_PATTERN =
  /^(?:负责|参与|协助|维护|跟进|制定|完成|优化|推进|主导|带领|管理|测试|支持|实施|编写|设计|开发|搭建|上线)/u;
const STRICT_RESUME_WEAK_PROJECT_DETAIL_PATTERN =
  /(?:客户关系|项目进度|回款情况|结算情况|销售方案|项目立项|代码质量管控|开发进度把控|培训技术员|核心功能)/u;
const STRICT_RESUME_NOISY_HIGHLIGHT_PUNCTUATION_PATTERN = /[;；]/u;
const STRICT_RESUME_SENTENCE_END_PATTERN = /[。；;]/u;

export function sanitizeResumeCompany(value: unknown) {
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

export function sanitizeResumeProjectHighlightStrict(value: unknown) {
  const text = sanitizeResumeProjectHighlight(value);
  if (!text) return '';
  const explicitMatch = text.match(STRICT_RESUME_PROJECT_SUFFIX_PATTERN);
  const candidate = sanitizeText((explicitMatch?.[1] || text).replace(/^(?:过)(?=[\u4e00-\u9fffA-Za-z0-9])/u, ''));
  if (!candidate) return '';
  if (STRICT_RESUME_GENERIC_PROJECT_LABELS.has(candidate)) return '';
  if (/^(?:[a-z][\u3001\uFF0C\uFF1A\s]*)/i.test(candidate)) return '';
  if (STRICT_RESUME_ACTION_LEAD_PATTERN.test(candidate)) return '';
  if (STRICT_RESUME_WEAK_PROJECT_DETAIL_PATTERN.test(candidate)) return '';
  return candidate;
}

export function sanitizeResumeHighlightText(value: unknown) {
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

export function extractResumeCompanyFromText(value: unknown) {
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
