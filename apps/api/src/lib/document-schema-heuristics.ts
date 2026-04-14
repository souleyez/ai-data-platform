import type { ParsedDocument, ResumeFields } from './document-parser.js';
import {
  loadDocumentExtractionGovernance,
  resolveDocumentExtractionProfile,
  type DocumentLibraryContext,
  type DocumentExtractionProfile,
} from './document-extraction-governance.js';

export function includesAnyText(text: string, keywords: string[]) {
  const haystack = String(text || '').toLowerCase();
  return keywords.some((keyword) => haystack.includes(String(keyword || '').toLowerCase()));
}

function normalizeResumeTextValue(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasTenderDocumentHint(text: string) {
  return includesAnyText(text, [
    '招标',
    '投标',
    '标书',
    '采购',
    '评标',
    '中标',
    '招标公告',
    '投标人须知',
    '投标保证金',
    '招标控制价',
    '综合评估法',
    '否决性条款',
    '发包人',
    '联合体协议书',
    'tender',
    'bid document',
    'bidding',
    'request for proposal',
    'rfp',
  ]);
}

function countResumeSignals(resumeFields?: ResumeFields) {
  if (!resumeFields) return 0;

  let score = 0;
  if (resumeFields.candidateName && isLikelyResumePersonName(resumeFields.candidateName)) score += 1;
  if (resumeFields.education) score += 1;
  if (resumeFields.latestCompany) score += 1;
  if (resumeFields.targetRole || resumeFields.currentRole) score += 1;
  if ((resumeFields.companies?.length || 0) >= 1) score += 1;
  if ((resumeFields.skills?.length || 0) >= 3) score += 1;
  if ((resumeFields.highlights?.length || 0) >= 2) score += 1;
  if ((resumeFields.projectHighlights?.length || 0) >= 1) score += 1;

  return score;
}

export function isLikelyResumePersonName(value: string) {
  const text = normalizeResumeTextValue(value);
  if (!text) return false;
  if (/@/.test(text)) return false;
  if (/\d{5,}/.test(text)) return false;
  if (/联系电话|电话|手机|邮箱|email/i.test(text)) return false;
  if (/^[A-Za-z][A-Za-z\s.-]{1,40}$/.test(text)) return true;
  if (/^[\u4e00-\u9fff·]{2,12}$/.test(text)) return true;
  return false;
}

export function inferSchemaType(
  category: string,
  bizCategory: ParsedDocument['bizCategory'],
  resumeFields?: ResumeFields,
  topicTags: string[] = [],
  title = '',
  summary = '',
) {
  const topicEvidence = topicTags.join(' ').toLowerCase();
  const heuristicBizCategory = ['order', 'inventory', 'footfall'].includes(String(bizCategory || '').toLowerCase())
    ? String(bizCategory || '').toLowerCase()
    : '';
  const classificationEvidence = `${category} ${heuristicBizCategory} ${title} ${summary} ${topicEvidence}`.toLowerCase();
  const resumeEvidence = `${title} ${summary}`.toLowerCase();
  const hasTenderHint = hasTenderDocumentHint(classificationEvidence);
  const hasResumeHint = includesAnyText(resumeEvidence, [
    'resume',
    'curriculum vitae',
    'candidate',
    'interview',
    '求职',
    '应聘',
    '简历',
    '候选人',
    '教育经历',
    '工作经历',
  ]);
  const hasStrongResumeFields = countResumeSignals(resumeFields) >= 3;
  if (bizCategory === 'order') return 'order' as const;
  if (bizCategory === 'footfall') return 'report' as const;
  if (bizCategory === 'inventory') return 'report' as const;
  if (category === 'contract') return 'contract' as const;
  if (hasTenderHint) return 'technical' as const;
  if (hasResumeHint || hasStrongResumeFields) return 'resume' as const;
  if (topicTags.includes('奶粉配方')) return 'formula' as const;
  if (
    category === 'report'
    || (
      ['order', 'inventory'].includes(String(bizCategory || '').toLowerCase())
      && includesAnyText(topicEvidence, ['report', 'dashboard', 'analysis', 'sales', 'inventory', 'forecast', 'yoy', 'mom', 'gmv', 'stock'])
    )
  ) return 'report' as const;
  if (category === 'technical') return 'technical' as const;
  if (category === 'paper') return 'paper' as const;
  return 'generic' as const;
}

export function applyGovernedSchemaType(
  inferredSchemaType: ParsedDocument['schemaType'],
  fallbackSchemaType?: 'contract' | 'resume' | 'technical' | 'order',
): ParsedDocument['schemaType'] {
  if (!fallbackSchemaType || inferredSchemaType === fallbackSchemaType) return inferredSchemaType;
  if (fallbackSchemaType === 'contract' && inferredSchemaType === 'generic') return 'contract';
  if (fallbackSchemaType === 'resume' && inferredSchemaType === 'generic') return 'resume';
  if (fallbackSchemaType === 'order' && ['generic', 'report'].includes(String(inferredSchemaType))) return 'order';
  if (fallbackSchemaType === 'technical' && inferredSchemaType === 'generic') return 'technical';
  return inferredSchemaType;
}

export function mergeGovernedTopicTags(
  topicTags: string[],
  libraryContext?: DocumentLibraryContext,
) {
  const profile = resolveDocumentExtractionProfile(loadDocumentExtractionGovernance(), libraryContext);
  if (!profile) return { topicTags, profile };

  const governedTags = profile.fieldSet === 'contract'
    ? ['合同']
    : profile.fieldSet === 'resume'
      ? ['人才简历']
      : profile.fieldSet === 'order'
        ? ['订单分析']
        : ['企业规范'];

  return {
    topicTags: [...new Set([...(topicTags || []), ...governedTags])],
    profile,
  } satisfies {
    topicTags: string[];
    profile: DocumentExtractionProfile | null;
  };
}
