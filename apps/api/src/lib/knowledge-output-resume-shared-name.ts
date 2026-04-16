import { isLikelyResumePersonName } from './document-schema.js';
import { isWeakResumeCandidateName } from './resume-canonicalizer.js';
import type { ResumePageEntry } from './knowledge-output-resume-types.js';
import { buildResumeFileBaseName, sanitizeText } from './knowledge-output-resume-shared-text.js';

export function sanitizeResumeCandidateName(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return '';
  if (/^(resume|姓名|年龄|工作经验|年工作经验|邮箱|电话|手机|个人|基本信息)$/i.test(text)) return '';
  if (/^(?:default|sample|test|demo|resume)[a-z0-9-]*$/i.test(text)) return '';
  if (/^[a-z0-9-]{8,}$/i.test(text)) return '';
  if (/^(?:个人简历|候选人简历)$/u.test(text)) return '';
  if (/^(?:在|于|从|对|向|和|与|及|由|将|把|来自)[\u4e00-\u9fff]{1,3}$/u.test(text)) return '';
  return isLikelyResumePersonName(text) ? text : '';
}

function extractResumeCandidateNameFromText(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return '';
  const tokenScanAllowed = /(?:resume|简历|姓名|候选人)/iu.test(text);

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
  const tokenScanAllowed = /(?:resume|简历|姓名|候选人)/iu.test(text);

  const patterns = [
    /(?:resume|简历)[:：]?\s*([\u4e00-\u9fff\u00b7]{2,4})/iu,
    /(?:姓名|候选人)[:：]?\s*([\u4e00-\u9fff\u00b7]{2,4})/u,
    /^([\u4e00-\u9fff\u00b7]{2,4})(?:简历|，|,|\s|男|女|求职|工作|现居|本科|硕士|研究生|MBA|大专|博士)/u,
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

export function pickResumeDisplayName(values: unknown[]) {
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

  const weakDisplayCandidate = weakCandidates.find((candidate) => !/^(?:男性|女性|男|女|求职意向|基本信息|个人信息|目标岗位|应聘岗位|当前职位|\d+\+?年|\d+年|年工作经|工作经验|工作年限|年经验)$/u.test(candidate));
  return strongCandidates[0] || weakDisplayCandidate || '';
}

export function getResumeDisplayName(entry: ResumePageEntry) {
  return pickResumeDisplayName([
    entry.candidateName,
    entry.sourceTitle,
    buildResumeFileBaseName(entry.sourceName),
    entry.summary,
  ]);
}
