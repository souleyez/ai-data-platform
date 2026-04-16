import { isWeakResumeCandidateName } from './resume-canonicalizer.js';
import type { ResumeDisplayProfile } from './resume-display-profile-types.js';

const WEAK_RESUME_PROJECT_PATTERNS = [
  /^(?:[a-z][、.．:：]\s*)/i,
  /^(?:负责|参与|协助|维护|跟进|制定|完成|优化|推进|主导|带领|管理|测试|支持|实施|编写|设计|开发|搭建|上线)/u,
  /(?:客户关系|项目进度|回款情况|结算情况|销售方案|项目立项|代码质量管控|开发进度把控|技术工作统筹|培训技术员|核心功能)/u,
  /^(?:完整的销售方案|系统搭建与上线|优化了平台)$/u,
];

const GENERIC_RESUME_PROJECT_LABELS = new Set([
  '平台',
  '系统',
  '项目',
  '方案',
  '销售方案',
  '系统搭建与上线',
]);

const RESUME_PROJECT_CONTEXT_PATTERN = /([\u4e00-\u9fffA-Za-z0-9()\-]{2,36}(?:\u5e73\u53f0|\u7cfb\u7edf|\u9879\u76ee|\u5e94\u7528|\u65b9\u6848|\u4e2d\u53f0|APP|ERP|CRM|MES|WMS|SRM|BI|IoT|IOT|AIGC))/giu;
const RESUME_PROJECT_LEAD_PATTERN = /^(?:(?:\u5bf9(?:\u516c\u53f8|\u4f01\u4e1a)?|\u516c\u53f8|\u4f01\u4e1a|\u56f4\u7ed5|\u9762\u5411|\u9488\u5bf9)\s*)?(?:(?:\u4e3b\u8981)?\u8d1f\u8d23|\u53c2\u4e0e|\u4e3b\u5bfc|\u642d\u5efa|\u5efa\u8bbe|\u5f00\u53d1|\u8bbe\u8ba1|\u7ef4\u62a4|\u4f18\u5316|\u63a8\u8fdb|\u652f\u6301|\u4ea4\u4ed8|\u843d\u5730|\u5b9e\u65bd)\s*/u;

export function sanitizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

export function sanitizeStringArray(value: unknown, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean);
}

export function buildProfileKey(profile: Pick<ResumeDisplayProfile, 'sourcePath' | 'sourceName'>) {
  return `${sanitizeText(profile.sourcePath, 320)}::${sanitizeText(profile.sourceName, 160)}`;
}

function extractStrongDisplayNameFromContext(value: unknown) {
  const text = sanitizeText(value, 240);
  if (!text) return '';
  const sentencePrefixPattern = /^(?:\u5728|\u4e8e|\u4ece|\u5bf9|\u5411|\u548c|\u4e0e|\u53ca|\u7531|\u5c06|\u628a|\u6765\u81ea)[\u4e00-\u9fff]{1,3}$/u;
  const tokenScanAllowed = /(?:resume|\u7b80\u5386|\u59d3\u540d|\u5019\u9009\u4eba)/iu.test(text);

  const patterns = [
    /(?:resume|\u7b80\u5386)[:：]?\s*([\u4e00-\u9fff\u00b7]{2,4})/iu,
    /(?:\u59d3\u540d|\u5019\u9009\u4eba)[:：]?\s*([\u4e00-\u9fff\u00b7]{2,4})/u,
    /^([\u4e00-\u9fff\u00b7]{2,4})(?:\u7b80\u5386|，|,|\s|\u7537|\u5973|\u6c42\u804c|\u5de5\u4f5c|\u73b0\u5c45|\u672c\u79d1|\u7855\u58eb|\u7814\u7a76\u751f|MBA|\u5927\u4e13|\u535a\u58eb)/u,
  ];

  for (const pattern of patterns) {
    const candidate = sanitizeText(text.match(pattern)?.[1], 40);
    if (!candidate || isWeakResumeCandidateName(candidate) || sentencePrefixPattern.test(candidate)) continue;
    return candidate;
  }

  if (!tokenScanAllowed) return '';
  const tokens = text.match(/[\u4e00-\u9fff\u00b7]{2,4}/gu) || [];
  for (const token of tokens.slice(0, 8)) {
    const candidate = sanitizeText(token, 40);
    if (!candidate || isWeakResumeCandidateName(candidate) || sentencePrefixPattern.test(candidate)) continue;
    return candidate;
  }

  return '';
}

export function resolveResumeDisplayName(primary: unknown, contextValues: unknown[]) {
  const direct = sanitizeText(primary, 60);
  const directIsWeak = direct ? isWeakResumeCandidateName(direct) : false;
  if (direct && !directIsWeak) return direct;
  for (const value of contextValues) {
    const recovered = extractStrongDisplayNameFromContext(value);
    if (recovered) return recovered;
  }
  return directIsWeak ? '' : direct;
}

function sanitizeProjectLead(value: unknown) {
  let text = sanitizeText(value, 120);
  if (!text) return '';

  text = text
    .replace(/^.*?(?=(?:\u5bf9(?:\u516c\u53f8|\u4f01\u4e1a)?|\u516c\u53f8|\u4f01\u4e1a|(?:\u4e3b\u8981)?\u8d1f\u8d23|\u53c2\u4e0e|\u4e3b\u5bfc|\u642d\u5efa|\u5efa\u8bbe|\u5f00\u53d1|\u8bbe\u8ba1|\u7ef4\u62a4|\u4f18\u5316|\u63a8\u8fdb|\u652f\u6301|\u4ea4\u4ed8|\u843d\u5730|\u5b9e\u65bd))/u, '')
    .replace(/(?:\u7684[\u4e00-\u9fffA-Za-z0-9()\-]{1,24})+$/u, '')
    .replace(/(?:\u5efa\u8bbe|\u5f00\u53d1|\u8bbe\u8ba1|\u7ef4\u62a4|\u4f18\u5316|\u63a8\u8fdb|\u652f\u6301|\u4ea4\u4ed8|\u843d\u5730|\u5b9e\u65bd)$/u, '')
    .replace(/^(?:\u5bf9(?:\u516c\u53f8|\u4f01\u4e1a)?|\u516c\u53f8|\u4f01\u4e1a)\s*/u, '')
    .trim();

  let previous = '';
  while (text && text !== previous) {
    previous = text;
    text = text.replace(RESUME_PROJECT_LEAD_PATTERN, '').trim();
  }

  text = text.replace(/^(?:\u8fc7)(?=[\u4e00-\u9fffA-Za-z0-9])/u, '').trim();
  return text;
}

function sanitizeSeedProject(value: unknown) {
  const raw = sanitizeProjectLead(sanitizeText(value, 120)
    .replace(/^[•·\-*]+/, '')
    .trim());
  if (!raw) return '';

  const explicitMatch = raw.match(/([\u4e00-\u9fffA-Za-z0-9()（）\-]{2,24}(?:项目|系统|平台|中台|小程序|APP|网站|商城|ERP|CRM|MES|WMS|SRM|BI|IoT|IOT|AIGC|AI))/iu);
  const candidate = sanitizeProjectLead(sanitizeText(explicitMatch?.[1] || raw, 48));
  if (!candidate) return '';
  if (candidate.length > 32) return '';
  if (/^(?:\u5728|\u4e86)\S*/u.test(candidate)) return '';
  if (/[\u4e0e\u53ca\u548c\u3001/]/u.test(candidate)) return '';
  if (/(?:\u6210\u529f|\u63d0\u4f9b|\u5b8c\u6210|\u63a8\u5e7f|\u6307\u5bfc|\u81f4\u529b|\u8d1f\u8d23|\u53c2\u4e0e|\u4e3b\u5bfc|\u642d\u5efa|\u5efa\u8bbe|\u5f00\u53d1|\u8bbe\u8ba1|\u7ef4\u62a4|\u4f18\u5316|\u63a8\u8fdb|\u652f\u6301|\u4ea4\u4ed8|\u843d\u5730|\u5b9e\u65bd)/u.test(candidate)) return '';
  if (/(?:\d+\u4e2a|\u4e0a\u767e\u4e2a|\u591a\u4e2a|\u7cfb\u7edf\u7b49|\u7b49\u4e0a\u767e\u4e2a)/u.test(candidate)) return '';
  if (/\u9879\u76ee$/u.test(candidate) && !/(?:[A-Za-z0-9]|ERP|CRM|MES|WMS|SRM|BI|IoT|IOT|AIGC|AI|\u5e73\u53f0|\u7cfb\u7edf|\u4e2d\u53f0)/u.test(candidate)) return '';
  if (/^[\u4e00-\u9fff]{1}(?:\u5e73\u53f0|\u7cfb\u7edf|\u9879\u76ee|\u65b9\u6848|\u4e2d\u53f0)$/u.test(candidate)) return '';
  if (/[;；,，。]/u.test(candidate)) return '';
  if (GENERIC_RESUME_PROJECT_LABELS.has(candidate)) return '';
  if (WEAK_RESUME_PROJECT_PATTERNS.some((pattern) => pattern.test(candidate))) return '';
  if (/^(?:智慧|安防|园区|支付|视频|电商|风控|数据|物流|医院|物业|SaaS|IoT|IOT|AIGC|AI)/iu.test(candidate)) return candidate;
  if (/(?:项目|系统|平台|中台|小程序|APP|网站|商城|ERP|CRM|MES|WMS|SRM|BI|IoT|IOT|AIGC|AI)$/iu.test(candidate)) return candidate;
  return '';
}

export function collectResumeDisplayProjects(projectValues: unknown[], contextValues: unknown[], limit = 4) {
  const projects: string[] = [];
  const seen = new Set<string>();

  const push = (value: unknown) => {
    const candidate = sanitizeSeedProject(value);
    if (!candidate) return;
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    projects.push(candidate);
  };

  for (const value of projectValues) {
    if (projects.length >= limit) break;
    push(value);
  }

  for (const value of contextValues) {
    if (projects.length >= limit) break;
    const text = sanitizeText(value, 2000);
    if (!text) continue;
    for (const match of text.matchAll(new RegExp(RESUME_PROJECT_CONTEXT_PATTERN))) {
      push(match[1]);
      const fragments = String(match[1] || '').split(/[\u4e0e\u53ca\u548c\u3001/]/u);
      for (const fragment of fragments) {
        push(fragment);
        if (projects.length >= limit) break;
      }
      if (projects.length >= limit) break;
    }
  }

  if (projects.length) return projects.slice(0, limit);
  return sanitizeStringArray(projectValues, 80).filter(Boolean).slice(0, limit);
}

export function buildSeedSummary(input: {
  currentRole?: string;
  yearsOfExperience?: string;
  education?: string;
  displayCompany?: string;
  displaySkills?: string[];
  displayProjects?: string[];
}) {
  const parts = [
    sanitizeText(input.currentRole, 40),
    sanitizeText(input.yearsOfExperience, 20),
    sanitizeText(input.education, 20),
    sanitizeText(input.displayCompany, 80),
  ].filter(Boolean);
  const skills = (input.displaySkills || []).slice(0, 3).join(' / ');
  const primaryProject = sanitizeText(input.displayProjects?.[0], 40);
  return sanitizeText([
    parts.join(' | '),
    skills ? `技能 ${skills}` : '',
    primaryProject ? `代表项目 ${primaryProject}` : '',
  ].filter(Boolean).join(' | '), 180);
}
