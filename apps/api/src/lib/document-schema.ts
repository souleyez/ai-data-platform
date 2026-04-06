import type { EvidenceChunk, ParsedDocument, ResumeFields, TableSummary } from './document-parser.js';
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
  const resumeEvidence = `${title} ${summary}`.toLowerCase();
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
  const hasStrongResumeFields = Boolean(
    resumeFields && (
      (resumeFields.candidateName && isLikelyResumePersonName(resumeFields.candidateName))
      || resumeFields.education
      || resumeFields.latestCompany
      || resumeFields.targetRole
      || resumeFields.currentRole
      || (resumeFields.skills?.length || 0) >= 2
    )
  );
  if (hasResumeHint || hasStrongResumeFields) return 'resume' as const;
  if (bizCategory === 'order') return 'order' as const;
  if (bizCategory === 'inventory') return 'report' as const;
  if (category === 'contract' || bizCategory === 'contract') return 'contract' as const;
  if (topicTags.includes('奶粉配方')) return 'formula' as const;
  if (
    category === 'report'
    || bizCategory === 'daily'
    || (
      ['order', 'inventory', 'service'].includes(bizCategory)
      && includesAnyText(topicEvidence, ['report', 'dashboard', 'analysis', 'sales', 'inventory', 'forecast', 'yoy', 'mom', 'gmv', 'stock'])
    )
  ) return 'report' as const;
  if (category === 'technical') return 'technical' as const;
  if (category === 'paper' || bizCategory === 'paper') return 'paper' as const;
  return 'generic' as const;
}

export type StructuredFieldSource = 'rule' | 'derived' | 'manual' | 'ocr';

export type StructuredFieldDetail = {
  value: unknown;
  confidence: number;
  source: StructuredFieldSource;
  evidenceChunkId?: string;
};

function applyGovernedSchemaType(
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

function mergeGovernedTopicTags(
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
  };
}

function clampConfidence(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, Number(numeric.toFixed(2))));
}

function hasStructuredValue(value: unknown) {
  if (Array.isArray(value)) return value.some((item) => String(item || '').trim());
  return String(value ?? '').trim().length > 0;
}

function normalizeStructuredValue(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  return String(value ?? '').trim();
}

function findEvidenceChunkId(evidenceChunks: EvidenceChunk[] | undefined, value: unknown) {
  if (!Array.isArray(evidenceChunks) || !evidenceChunks.length || !hasStructuredValue(value)) {
    return undefined;
  }

  const candidates = Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter((item) => item.length >= 2)
    : [String(value || '').trim()].filter((item) => item.length >= 2);

  for (const candidate of candidates) {
    const matched = evidenceChunks.find((chunk) => String(chunk.text || '').includes(candidate));
    if (matched?.id) return matched.id;
  }

  return undefined;
}

function createFieldDetail(
  value: unknown,
  confidence: number,
  source: StructuredFieldSource,
  evidenceChunks?: EvidenceChunk[],
) {
  if (!hasStructuredValue(value)) return null;
  return {
    value: normalizeStructuredValue(value),
    confidence: clampConfidence(confidence),
    source,
    evidenceChunkId: findEvidenceChunkId(evidenceChunks, value),
  } satisfies StructuredFieldDetail;
}

function buildCommonFieldDetails(input: {
  title: string;
  topicTags: string[];
  summary: string;
  evidenceChunks?: EvidenceChunk[];
}) {
  const details: Record<string, StructuredFieldDetail> = {};
  const titleDetail = createFieldDetail(input.title, 0.98, 'rule', input.evidenceChunks);
  const summaryDetail = createFieldDetail(input.summary, 0.82, 'derived', input.evidenceChunks);
  const topicTagsDetail = createFieldDetail(input.topicTags, 0.76, 'rule', input.evidenceChunks);

  if (titleDetail) details.title = titleDetail;
  if (summaryDetail) details.summary = summaryDetail;
  if (topicTagsDetail) details.topicTags = topicTagsDetail;

  return details;
}

function buildFocusedFieldPayload(
  fieldDetails: Record<string, StructuredFieldDetail>,
  extractionProfile?: Pick<DocumentExtractionProfile, 'fieldSet' | 'preferredFieldKeys'>,
) {
  const preferredFieldKeys = Array.isArray(extractionProfile?.preferredFieldKeys)
    ? extractionProfile.preferredFieldKeys.filter(Boolean)
    : [];
  if (!preferredFieldKeys.length) return {};

  const focusedFieldDetails = Object.fromEntries(
    preferredFieldKeys
      .map((key) => [key, fieldDetails[key]])
      .filter((entry) => entry[1]),
  ) as Record<string, StructuredFieldDetail>;

  const focusedFields = Object.fromEntries(
    Object.entries(focusedFieldDetails).map(([key, value]) => [key, value.value]),
  );

  return {
    fieldTemplate: {
      fieldSet: extractionProfile?.fieldSet,
      preferredFieldKeys,
    },
    focusedFieldDetails,
    focusedFields,
  };
}

export function buildStructuredProfile(input: {
  schemaType: ParsedDocument['schemaType'];
  title: string;
  topicTags: string[];
  summary: string;
  contractFields?: ParsedDocument['contractFields'];
  enterpriseGuidanceFields?: ParsedDocument['enterpriseGuidanceFields'];
  orderFields?: ParsedDocument['orderFields'];
  resumeFields?: ResumeFields;
  evidenceChunks?: EvidenceChunk[];
  tableSummary?: TableSummary;
  extractionProfile?: Pick<DocumentExtractionProfile, 'fieldSet' | 'preferredFieldKeys'>;
}) {
  const evidence = `${input.title} ${input.summary} ${input.topicTags.join(' ')}`.toLowerCase();
  const base = {
    title: input.title,
    summary: input.summary,
    topicTags: input.topicTags.slice(0, 8),
    fieldDetails: buildCommonFieldDetails(input),
    ...(input.tableSummary ? { tableSummary: input.tableSummary } : {}),
  };

  if (input.schemaType === 'contract') {
    const fieldDetails = {
      ...base.fieldDetails,
      ...(createFieldDetail(input.contractFields?.contractNo, 0.94, 'rule', input.evidenceChunks)
        ? { contractNo: createFieldDetail(input.contractFields?.contractNo, 0.94, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.contractFields?.partyA, 0.88, 'rule', input.evidenceChunks)
        ? { partyA: createFieldDetail(input.contractFields?.partyA, 0.88, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.contractFields?.partyB, 0.88, 'rule', input.evidenceChunks)
        ? { partyB: createFieldDetail(input.contractFields?.partyB, 0.88, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.contractFields?.amount, 0.86, 'rule', input.evidenceChunks)
        ? { amount: createFieldDetail(input.contractFields?.amount, 0.86, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.contractFields?.signDate, 0.82, 'rule', input.evidenceChunks)
        ? { signDate: createFieldDetail(input.contractFields?.signDate, 0.82, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.contractFields?.effectiveDate, 0.8, 'rule', input.evidenceChunks)
        ? { effectiveDate: createFieldDetail(input.contractFields?.effectiveDate, 0.8, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.contractFields?.paymentTerms, 0.78, 'rule', input.evidenceChunks)
        ? { paymentTerms: createFieldDetail(input.contractFields?.paymentTerms, 0.78, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.contractFields?.duration, 0.76, 'rule', input.evidenceChunks)
        ? { duration: createFieldDetail(input.contractFields?.duration, 0.76, 'rule', input.evidenceChunks)! }
        : {}),
    };

    return {
      ...base,
      contractNo: input.contractFields?.contractNo || '',
      partyA: input.contractFields?.partyA || '',
      partyB: input.contractFields?.partyB || '',
      amount: input.contractFields?.amount || '',
      signDate: input.contractFields?.signDate || '',
      effectiveDate: input.contractFields?.effectiveDate || '',
      paymentTerms: input.contractFields?.paymentTerms || '',
      duration: input.contractFields?.duration || '',
      fieldDetails,
      ...buildFocusedFieldPayload(fieldDetails, input.extractionProfile),
    };
  }

  if (input.schemaType === 'resume') {
    const highlights = input.resumeFields?.highlights || [];
    const existingProjects = input.resumeFields?.projectHighlights || [];
    const existingItProjects = input.resumeFields?.itProjectHighlights || [];
    const fallbackProjects = existingProjects.length
      ? existingProjects
      : highlights.filter((entry) => /(项目|project|系统|platform|api|实施|开发|架构|技术)/i.test(String(entry || ''))).slice(0, 8);
    const fallbackItProjects = existingItProjects.length
      ? existingItProjects
      : fallbackProjects.filter((entry) => /(it|系统|platform|api|接口|开发|实施|架构|技术)/i.test(String(entry || ''))).slice(0, 8);
    const companies = input.resumeFields?.companies?.length
      ? input.resumeFields.companies
      : input.resumeFields?.latestCompany
        ? [input.resumeFields.latestCompany]
        : [];
    const fieldDetails = {
      ...base.fieldDetails,
      ...(createFieldDetail(input.resumeFields?.candidateName, isLikelyResumePersonName(String(input.resumeFields?.candidateName || '')) ? 0.9 : 0.68, 'rule', input.evidenceChunks)
        ? { candidateName: createFieldDetail(input.resumeFields?.candidateName, isLikelyResumePersonName(String(input.resumeFields?.candidateName || '')) ? 0.9 : 0.68, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.resumeFields?.targetRole, 0.82, 'rule', input.evidenceChunks)
        ? { targetRole: createFieldDetail(input.resumeFields?.targetRole, 0.82, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.resumeFields?.currentRole, 0.82, 'rule', input.evidenceChunks)
        ? { currentRole: createFieldDetail(input.resumeFields?.currentRole, 0.82, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.resumeFields?.yearsOfExperience, 0.78, 'rule', input.evidenceChunks)
        ? { yearsOfExperience: createFieldDetail(input.resumeFields?.yearsOfExperience, 0.78, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.resumeFields?.education, 0.84, 'rule', input.evidenceChunks)
        ? { education: createFieldDetail(input.resumeFields?.education, 0.84, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.resumeFields?.major, 0.8, 'rule', input.evidenceChunks)
        ? { major: createFieldDetail(input.resumeFields?.major, 0.8, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.resumeFields?.expectedCity, 0.76, 'rule', input.evidenceChunks)
        ? { expectedCity: createFieldDetail(input.resumeFields?.expectedCity, 0.76, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.resumeFields?.expectedSalary, 0.74, 'rule', input.evidenceChunks)
        ? { expectedSalary: createFieldDetail(input.resumeFields?.expectedSalary, 0.74, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.resumeFields?.latestCompany, 0.84, 'rule', input.evidenceChunks)
        ? { latestCompany: createFieldDetail(input.resumeFields?.latestCompany, 0.84, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(companies, 0.76, 'derived', input.evidenceChunks)
        ? { companies: createFieldDetail(companies, 0.76, 'derived', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.resumeFields?.skills || [], 0.74, 'derived', input.evidenceChunks)
        ? { skills: createFieldDetail(input.resumeFields?.skills || [], 0.74, 'derived', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(highlights, 0.68, 'derived', input.evidenceChunks)
        ? { highlights: createFieldDetail(highlights, 0.68, 'derived', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(fallbackProjects, 0.66, 'derived', input.evidenceChunks)
        ? { projectHighlights: createFieldDetail(fallbackProjects, 0.66, 'derived', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(fallbackItProjects, 0.64, 'derived', input.evidenceChunks)
        ? { itProjectHighlights: createFieldDetail(fallbackItProjects, 0.64, 'derived', input.evidenceChunks)! }
        : {}),
    };

    return {
      ...base,
      candidateName: input.resumeFields?.candidateName || '',
      targetRole: input.resumeFields?.targetRole || '',
      currentRole: input.resumeFields?.currentRole || '',
      yearsOfExperience: input.resumeFields?.yearsOfExperience || '',
      education: input.resumeFields?.education || '',
      major: input.resumeFields?.major || '',
      expectedCity: input.resumeFields?.expectedCity || '',
      expectedSalary: input.resumeFields?.expectedSalary || '',
      latestCompany: input.resumeFields?.latestCompany || '',
      companies,
      skills: input.resumeFields?.skills || [],
      highlights,
      projectHighlights: fallbackProjects,
      itProjectHighlights: fallbackItProjects,
      fieldDetails,
      ...buildFocusedFieldPayload(fieldDetails, input.extractionProfile),
    };
  }

  if (input.schemaType === 'formula') {
    return {
      ...base,
      domain: 'formula',
      focus: input.topicTags.filter((tag) => ['奶粉配方', '益生菌', '营养强化'].includes(tag)),
    };
  }

  if (input.schemaType === 'paper') {
    return {
      ...base,
      domain: 'paper',
      focus: input.topicTags.slice(0, 4),
    };
  }

  if (input.schemaType === 'technical') {
    const fieldDetails = {
      ...base.fieldDetails,
      ...(createFieldDetail(input.enterpriseGuidanceFields?.businessSystem, 0.88, 'rule', input.evidenceChunks)
        ? { businessSystem: createFieldDetail(input.enterpriseGuidanceFields?.businessSystem, 0.88, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.enterpriseGuidanceFields?.documentKind, 0.84, 'rule', input.evidenceChunks)
        ? { documentKind: createFieldDetail(input.enterpriseGuidanceFields?.documentKind, 0.84, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.enterpriseGuidanceFields?.applicableScope, 0.8, 'rule', input.evidenceChunks)
        ? { applicableScope: createFieldDetail(input.enterpriseGuidanceFields?.applicableScope, 0.8, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.enterpriseGuidanceFields?.operationEntry, 0.82, 'rule', input.evidenceChunks)
        ? { operationEntry: createFieldDetail(input.enterpriseGuidanceFields?.operationEntry, 0.82, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.enterpriseGuidanceFields?.approvalLevels || [], 0.76, 'derived', input.evidenceChunks)
        ? { approvalLevels: createFieldDetail(input.enterpriseGuidanceFields?.approvalLevels || [], 0.76, 'derived', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.enterpriseGuidanceFields?.policyFocus || [], 0.74, 'derived', input.evidenceChunks)
        ? { policyFocus: createFieldDetail(input.enterpriseGuidanceFields?.policyFocus || [], 0.74, 'derived', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.enterpriseGuidanceFields?.contacts || [], 0.72, 'rule', input.evidenceChunks)
        ? { contacts: createFieldDetail(input.enterpriseGuidanceFields?.contacts || [], 0.72, 'rule', input.evidenceChunks)! }
        : {}),
    };
    return {
      ...base,
      domain: 'technical',
      focus: input.topicTags.slice(0, 4),
      businessSystem: input.enterpriseGuidanceFields?.businessSystem || '',
      documentKind: input.enterpriseGuidanceFields?.documentKind || '',
      applicableScope: input.enterpriseGuidanceFields?.applicableScope || '',
      operationEntry: input.enterpriseGuidanceFields?.operationEntry || '',
      approvalLevels: input.enterpriseGuidanceFields?.approvalLevels || [],
      policyFocus: input.enterpriseGuidanceFields?.policyFocus || [],
      contacts: input.enterpriseGuidanceFields?.contacts || [],
      fieldDetails,
      ...buildFocusedFieldPayload(fieldDetails, input.extractionProfile),
    };
  }

  if (input.schemaType === 'order') {
    const fieldDetails = {
      ...base.fieldDetails,
      ...(createFieldDetail(input.orderFields?.period, 0.8, 'rule', input.evidenceChunks)
        ? { period: createFieldDetail(input.orderFields?.period, 0.8, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.orderFields?.platform, 0.88, 'rule', input.evidenceChunks)
        ? { platform: createFieldDetail(input.orderFields?.platform, 0.88, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.orderFields?.orderCount, 0.82, 'rule', input.evidenceChunks)
        ? { orderCount: createFieldDetail(input.orderFields?.orderCount, 0.82, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.orderFields?.netSales, 0.82, 'rule', input.evidenceChunks)
        ? { netSales: createFieldDetail(input.orderFields?.netSales, 0.82, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.orderFields?.grossMargin, 0.78, 'rule', input.evidenceChunks)
        ? { grossMargin: createFieldDetail(input.orderFields?.grossMargin, 0.78, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.orderFields?.topCategory, 0.74, 'rule', input.evidenceChunks)
        ? { topCategory: createFieldDetail(input.orderFields?.topCategory, 0.74, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.orderFields?.inventoryStatus, 0.68, 'derived', input.evidenceChunks)
        ? { inventoryStatus: createFieldDetail(input.orderFields?.inventoryStatus, 0.68, 'derived', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(input.orderFields?.replenishmentAction, 0.68, 'derived', input.evidenceChunks)
        ? { replenishmentAction: createFieldDetail(input.orderFields?.replenishmentAction, 0.68, 'derived', input.evidenceChunks)! }
        : {}),
    };
    return {
      ...base,
      domain: 'order',
      period: input.orderFields?.period || '',
      platform: input.orderFields?.platform || '',
      orderCount: input.orderFields?.orderCount || '',
      netSales: input.orderFields?.netSales || '',
      grossMargin: input.orderFields?.grossMargin || '',
      topCategory: input.orderFields?.topCategory || '',
      inventoryStatus: input.orderFields?.inventoryStatus || '',
      replenishmentAction: input.orderFields?.replenishmentAction || '',
      focus: input.topicTags.slice(0, 4),
      fieldDetails,
      ...buildFocusedFieldPayload(fieldDetails, input.extractionProfile),
    };
  }

  if (input.schemaType === 'report') {
    return {
      ...base,
      domain: 'report',
      focus: input.topicTags.slice(0, 4),
      platforms: [
        evidence.includes('tmall') ? 'tmall' : '',
        evidence.includes('jd') ? 'jd' : '',
        evidence.includes('douyin') ? 'douyin' : '',
        evidence.includes('pinduoduo') ? 'pinduoduo' : '',
        evidence.includes('amazon') ? 'amazon' : '',
        evidence.includes('shopify') ? 'shopify' : '',
      ].filter(Boolean),
      platformSignals: [
        evidence.includes('tmall') ? 'tmall' : '',
        evidence.includes('jd') ? 'jd' : '',
        evidence.includes('douyin') ? 'douyin' : '',
        evidence.includes('pinduoduo') ? 'pinduoduo' : '',
        evidence.includes('amazon') ? 'amazon' : '',
        evidence.includes('shopify') ? 'shopify' : '',
      ].filter(Boolean),
      categorySignals: input.topicTags.filter((tag) => ['订单分析', '库存管理', '经营复盘', '销量预测', '备货建议'].includes(tag)),
      metricSignals: [
        includesAnyText(evidence, ['yoy', 'year over year', '同比']) ? 'yoy' : '',
        includesAnyText(evidence, ['mom', 'month over month', '环比']) ? 'mom' : '',
        includesAnyText(evidence, ['inventory', 'stock', '库存']) ? 'inventory' : '',
        includesAnyText(evidence, ['sales', 'gmv', 'revenue', '销量', '销售']) ? 'sales' : '',
        includesAnyText(evidence, ['forecast', 'prediction', '预测']) ? 'forecast' : '',
        includesAnyText(evidence, ['anomaly', 'volatility', 'alert', '异常']) ? 'anomaly' : '',
      ].filter(Boolean),
      keyMetrics: [
        includesAnyText(evidence, ['yoy', 'year over year', '同比']) ? 'yoy' : '',
        includesAnyText(evidence, ['mom', 'month over month', '环比']) ? 'mom' : '',
        includesAnyText(evidence, ['inventory index', 'inventory health', '库存指数']) ? 'inventory-index' : '',
        includesAnyText(evidence, ['sell-through', '动销']) ? 'sell-through' : '',
        includesAnyText(evidence, ['gmv', '交易额']) ? 'gmv' : '',
      ].filter(Boolean),
      replenishmentSignals: [
        includesAnyText(evidence, ['replenishment', '备货']) ? 'replenishment' : '',
        includesAnyText(evidence, ['restock', '补货']) ? 'restock' : '',
        includesAnyText(evidence, ['safety stock', '安全库存']) ? 'safety-stock' : '',
      ].filter(Boolean),
      salesCycleSignals: [
        includesAnyText(evidence, ['week', 'weekly', '周']) ? 'weekly' : '',
        includesAnyText(evidence, ['month', 'monthly', '月']) ? 'monthly' : '',
        includesAnyText(evidence, ['quarter', 'quarterly', '季度']) ? 'quarterly' : '',
      ].filter(Boolean),
      forecastSignals: [
        includesAnyText(evidence, ['forecast', '预测']) ? 'forecast' : '',
        includesAnyText(evidence, ['trend', '趋势']) ? 'trend' : '',
        includesAnyText(evidence, ['plan', '规划']) ? 'planning' : '',
      ].filter(Boolean),
      anomalySignals: [
        includesAnyText(evidence, ['anomaly', 'abnormal', '异常']) ? 'anomaly' : '',
        includesAnyText(evidence, ['volatility', 'spike', '波动']) ? 'volatility' : '',
        includesAnyText(evidence, ['alert', 'warning', '预警']) ? 'alert' : '',
      ].filter(Boolean),
      operatingSignals: [
        includesAnyText(evidence, ['operating', 'operation review', '经营']) ? 'operating-review' : '',
        includesAnyText(evidence, ['replenishment', '备货']) ? 'replenishment' : '',
        includesAnyText(evidence, ['forecast', '预测']) ? 'forecast' : '',
        includesAnyText(evidence, ['exception', 'anomaly', '异常']) ? 'exception' : '',
      ].filter(Boolean),
    };
  }

  return base;
}

export function deriveSchemaProfile(input: {
  category: string;
  bizCategory: ParsedDocument['bizCategory'];
  title: string;
  topicTags: string[];
  summary: string;
  contractFields?: ParsedDocument['contractFields'];
  enterpriseGuidanceFields?: ParsedDocument['enterpriseGuidanceFields'];
  orderFields?: ParsedDocument['orderFields'];
  resumeFields?: ResumeFields;
  evidenceChunks?: EvidenceChunk[];
  libraryContext?: DocumentLibraryContext;
  tableSummary?: TableSummary;
}) {
  const { topicTags, profile } = mergeGovernedTopicTags(input.topicTags, input.libraryContext);
  const schemaType = applyGovernedSchemaType(
    inferSchemaType(
      input.category,
      input.bizCategory,
      input.resumeFields,
      topicTags,
      input.title,
      input.summary,
    ),
    profile?.fallbackSchemaType,
  );

  return {
    topicTags,
    schemaType,
    resumeFields: input.resumeFields,
    structuredProfile: buildStructuredProfile({
      schemaType,
      title: input.title,
      topicTags,
      summary: input.summary,
      contractFields: input.contractFields,
      enterpriseGuidanceFields: input.enterpriseGuidanceFields,
      orderFields: input.orderFields,
      resumeFields: input.resumeFields,
      evidenceChunks: input.evidenceChunks,
      tableSummary: input.tableSummary,
      extractionProfile: profile ? {
        fieldSet: profile.fieldSet,
        preferredFieldKeys: profile.preferredFieldKeys,
      } : undefined,
    }),
  };
}

export function refreshDerivedSchemaProfile(item: ParsedDocument): ParsedDocument {
  if (!item) return item;
  const derived = deriveSchemaProfile({
    category: item.category,
    bizCategory: item.bizCategory,
    title: item.title || item.name,
    topicTags: item.topicTags || [],
    summary: item.summary || '',
    contractFields: item.contractFields,
    enterpriseGuidanceFields: item.enterpriseGuidanceFields,
    orderFields: item.orderFields,
    resumeFields: item.resumeFields,
    evidenceChunks: item.evidenceChunks,
    libraryContext: {
      keys: item.confirmedGroups?.length ? item.confirmedGroups : item.groups || [],
      labels: item.confirmedGroups?.length ? item.confirmedGroups : item.groups || [],
    },
    tableSummary: item.structuredProfile?.tableSummary as TableSummary | undefined,
  });

  return {
    ...item,
    topicTags: derived.topicTags,
    resumeFields: derived.resumeFields,
    schemaType: derived.schemaType,
    structuredProfile: item.manualStructuredProfile && item.structuredProfile
      ? item.structuredProfile
      : derived.structuredProfile,
  };
}
