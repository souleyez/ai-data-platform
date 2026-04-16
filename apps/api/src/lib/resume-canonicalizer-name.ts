import type { ResumeFields } from './document-parser.js';
import type { ResumeCanonicalizationContext } from './resume-canonicalizer-types.js';
import {
  COMPANY_SUFFIX_PATTERN,
  CONTACT_NOISE_PATTERN,
  NAME_NOISE_PATTERN,
  NAME_ROLE_PATTERN,
  RESUME_HINT_PATTERN,
  normalizeText,
  stripCommonLabelPrefix,
  stripFileExtension,
  uniqStrings,
} from './resume-canonicalizer-utils.js';

export function isWeakResumeCandidateName(value: unknown) {
  const text = normalizeText(value, 40);
  if (!text) return false;
  if (/^(?:\u7537\u6027|\u5973\u6027|\u7537|\u5973|\u6c42\u804c\u610f\u5411|\u57fa\u672c\u4fe1\u606f|\u4e2a\u4eba\u4fe1\u606f|\u76ee\u6807\u5c97\u4f4d|\u5e94\u8058\u5c97\u4f4d|\u5f53\u524d\u804c\u4f4d)$/u.test(text)) return true;
  if (/^(?:\d+\+?\u5e74|\d+\u5e74|\u5e74\u5de5\u4f5c\u7ecf|\u5de5\u4f5c\u7ecf\u9a8c|\u5de5\u4f5c\u5e74\u9650|\u5e74\u7ecf\u9a8c)$/u.test(text)) return true;
  return /^[\u4e00-\u9fff\u00b7]{1,3}(?:\u5148\u751f|\u5973\u58eb|\u8001\u5e08|\u540c\u5b66)$/u.test(text);
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

export function isResumeLikeContext(context: ResumeCanonicalizationContext) {
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

export function pickCandidateName(fields: ResumeFields | null | undefined, context: ResumeCanonicalizationContext) {
  const candidates = uniqStrings([
    ...(fields?.candidateName ? [fields.candidateName] : []),
    ...collectContextTexts(context).flatMap((value) => extractNameCandidates(value)),
  ]);
  const strongCandidates: string[] = [];
  const weakCandidates: string[] = [];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate, 40)
      .replace(/^(?:简历|个人简历|候选人)[:：]?\s*/i, '')
      .replace(/(?:简历|履历)$/i, '')
      .trim();
    if (!isLikelyPersonName(normalized)) continue;
    if (isWeakResumeCandidateName(normalized)) {
      weakCandidates.push(normalized);
      continue;
    }
    strongCandidates.push(normalized);
  }

  return strongCandidates[0] || weakCandidates[0] || '';
}
