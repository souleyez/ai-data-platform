import type { EvidenceChunk, ParsedDocument, ResumeFields, TableSummary } from './document-parser.js';
import {
  applyDocumentExtractionFieldGovernance,
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
  if (bizCategory === 'footfall') return 'report' as const;
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
  extractionProfile?: Pick<
    DocumentExtractionProfile,
    | 'fieldSet'
    | 'preferredFieldKeys'
    | 'requiredFieldKeys'
    | 'fieldAliases'
    | 'fieldPrompts'
    | 'fieldNormalizationRules'
    | 'fieldConflictStrategies'
  >,
) {
  const preferredFieldKeys = Array.isArray(extractionProfile?.preferredFieldKeys)
    ? extractionProfile.preferredFieldKeys.filter(Boolean)
    : [];
  if (!preferredFieldKeys.length) return {};
  const preferredFieldKeySet = new Set<string>(preferredFieldKeys);
  const requiredFieldKeys = Array.isArray(extractionProfile?.requiredFieldKeys)
    ? extractionProfile.requiredFieldKeys.filter((key) => preferredFieldKeySet.has(key))
    : [];
  const fieldAliases = extractionProfile?.fieldAliases && typeof extractionProfile.fieldAliases === 'object'
    ? Object.fromEntries(
        Object.entries(extractionProfile.fieldAliases)
          .filter(([key, value]) => preferredFieldKeySet.has(key) && String(value || '').trim()),
      )
    : undefined;

  const focusedFieldDetails = Object.fromEntries(
    preferredFieldKeys
      .map((key) => [key, fieldDetails[key]])
      .filter((entry) => entry[1]),
  ) as Record<string, StructuredFieldDetail>;

  const focusedFields = Object.fromEntries(
    Object.entries(focusedFieldDetails).map(([key, value]) => [key, value.value]),
  );

  const focusedFieldEntries = preferredFieldKeys.map((key) => {
    const detail = focusedFieldDetails[key];
    return {
      key,
      alias: fieldAliases?.[key] || '',
      required: requiredFieldKeys.includes(key),
      value: detail?.value,
      confidence: detail?.confidence ?? null,
      source: detail?.source || '',
      evidenceChunkId: detail?.evidenceChunkId || '',
    };
  });

  const aliasFieldEntries = new Map<string, {
    key: string;
    alias: string;
    required: boolean;
    value: unknown;
    confidence: number | null;
    source: string;
    evidenceChunkId: string;
  }>();
  const orderedAliasKeys = [...preferredFieldKeys, ...Object.keys(fieldAliases || {})];

  for (const key of orderedAliasKeys) {
    if (!preferredFieldKeySet.has(key) && !(fieldAliases && key in fieldAliases)) continue;
    const alias = String(fieldAliases?.[key] || '').trim();
    const detail = fieldDetails[key];
    const isRequired = requiredFieldKeys.includes(key as (typeof requiredFieldKeys)[number]);
    if (!alias || !detail || alias === key || aliasFieldEntries.has(alias)) continue;
    aliasFieldEntries.set(alias, {
      key,
      alias,
      required: isRequired,
      value: detail.value,
      confidence: detail.confidence ?? null,
      source: detail.source || '',
      evidenceChunkId: detail.evidenceChunkId || '',
    });
  }

  const aliasFieldDetails = Object.fromEntries(
    [...aliasFieldEntries.entries()].map(([alias, entry]) => [
      alias,
      {
        value: entry.value,
        confidence: entry.confidence ?? 0,
        source: entry.source as StructuredFieldSource,
        evidenceChunkId: entry.evidenceChunkId || undefined,
      } satisfies StructuredFieldDetail,
    ]),
  ) as Record<string, StructuredFieldDetail>;

  const aliasFields = Object.fromEntries(
    [...aliasFieldEntries.entries()].map(([alias, entry]) => [alias, entry.value]),
  );

  const focusedAliasFieldDetails = Object.fromEntries(
    [...aliasFieldEntries.entries()]
      .filter(([, entry]) => preferredFieldKeySet.has(entry.key))
      .map(([alias]) => [alias, aliasFieldDetails[alias]])
      .filter((entry) => entry[1]),
  ) as Record<string, StructuredFieldDetail>;

  const focusedAliasFields = Object.fromEntries(
    Object.entries(focusedAliasFieldDetails).map(([alias, detail]) => [alias, detail.value]),
  );

  return {
    fieldTemplate: {
      fieldSet: extractionProfile?.fieldSet,
      preferredFieldKeys,
      requiredFieldKeys,
      fieldAliases,
      fieldPrompts: extractionProfile?.fieldPrompts,
      fieldNormalizationRules: extractionProfile?.fieldNormalizationRules,
      fieldConflictStrategies: extractionProfile?.fieldConflictStrategies,
    },
    aliasFieldDetails,
    aliasFields,
    focusedFieldDetails,
    focusedFields,
    focusedAliasFieldDetails,
    focusedAliasFields,
    focusedFieldEntries,
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
  footfallFields?: ParsedDocument['footfallFields'];
  resumeFields?: ResumeFields;
  evidenceChunks?: EvidenceChunk[];
  tableSummary?: TableSummary;
  extractionProfile?: Pick<
    DocumentExtractionProfile,
    | 'fieldSet'
    | 'preferredFieldKeys'
    | 'requiredFieldKeys'
    | 'fieldAliases'
    | 'fieldPrompts'
    | 'fieldNormalizationRules'
    | 'fieldConflictStrategies'
  >;
}) {
  const evidence = `${input.title} ${input.summary} ${input.topicTags.join(' ')}`.toLowerCase();
  const contractFields = applyDocumentExtractionFieldGovernance(input.contractFields, input.extractionProfile);
  const enterpriseGuidanceFields = applyDocumentExtractionFieldGovernance(
    input.enterpriseGuidanceFields,
    input.extractionProfile,
  );
  const orderFields = applyDocumentExtractionFieldGovernance(input.orderFields, input.extractionProfile);
  const footfallFields = applyDocumentExtractionFieldGovernance(input.footfallFields, input.extractionProfile);
  const resumeFields = applyDocumentExtractionFieldGovernance(input.resumeFields, input.extractionProfile);
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
      ...(createFieldDetail(contractFields?.contractNo, 0.94, 'rule', input.evidenceChunks)
        ? { contractNo: createFieldDetail(contractFields?.contractNo, 0.94, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(contractFields?.partyA, 0.88, 'rule', input.evidenceChunks)
        ? { partyA: createFieldDetail(contractFields?.partyA, 0.88, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(contractFields?.partyB, 0.88, 'rule', input.evidenceChunks)
        ? { partyB: createFieldDetail(contractFields?.partyB, 0.88, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(contractFields?.amount, 0.86, 'rule', input.evidenceChunks)
        ? { amount: createFieldDetail(contractFields?.amount, 0.86, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(contractFields?.signDate, 0.82, 'rule', input.evidenceChunks)
        ? { signDate: createFieldDetail(contractFields?.signDate, 0.82, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(contractFields?.effectiveDate, 0.8, 'rule', input.evidenceChunks)
        ? { effectiveDate: createFieldDetail(contractFields?.effectiveDate, 0.8, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(contractFields?.paymentTerms, 0.78, 'rule', input.evidenceChunks)
        ? { paymentTerms: createFieldDetail(contractFields?.paymentTerms, 0.78, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(contractFields?.duration, 0.76, 'rule', input.evidenceChunks)
        ? { duration: createFieldDetail(contractFields?.duration, 0.76, 'rule', input.evidenceChunks)! }
        : {}),
    };

    return {
      ...base,
      contractNo: contractFields?.contractNo || '',
      partyA: contractFields?.partyA || '',
      partyB: contractFields?.partyB || '',
      amount: contractFields?.amount || '',
      signDate: contractFields?.signDate || '',
      effectiveDate: contractFields?.effectiveDate || '',
      paymentTerms: contractFields?.paymentTerms || '',
      duration: contractFields?.duration || '',
      fieldDetails,
      ...buildFocusedFieldPayload(fieldDetails, input.extractionProfile),
    };
  }

  if (input.schemaType === 'resume') {
    const highlights = resumeFields?.highlights || [];
    const existingProjects = resumeFields?.projectHighlights || [];
    const existingItProjects = resumeFields?.itProjectHighlights || [];
    const fallbackProjects = existingProjects.length
      ? existingProjects
      : highlights.filter((entry) => /(项目|project|系统|platform|api|实施|开发|架构|技术)/i.test(String(entry || ''))).slice(0, 8);
    const fallbackItProjects = existingItProjects.length
      ? existingItProjects
      : fallbackProjects.filter((entry) => /(it|系统|platform|api|接口|开发|实施|架构|技术)/i.test(String(entry || ''))).slice(0, 8);
    const companies = resumeFields?.companies?.length
      ? resumeFields.companies
      : resumeFields?.latestCompany
        ? [resumeFields.latestCompany]
        : [];
    const fieldDetails = {
      ...base.fieldDetails,
      ...(createFieldDetail(resumeFields?.candidateName, isLikelyResumePersonName(String(resumeFields?.candidateName || '')) ? 0.9 : 0.68, 'rule', input.evidenceChunks)
        ? { candidateName: createFieldDetail(resumeFields?.candidateName, isLikelyResumePersonName(String(resumeFields?.candidateName || '')) ? 0.9 : 0.68, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(resumeFields?.targetRole, 0.82, 'rule', input.evidenceChunks)
        ? { targetRole: createFieldDetail(resumeFields?.targetRole, 0.82, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(resumeFields?.currentRole, 0.82, 'rule', input.evidenceChunks)
        ? { currentRole: createFieldDetail(resumeFields?.currentRole, 0.82, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(resumeFields?.yearsOfExperience, 0.78, 'rule', input.evidenceChunks)
        ? { yearsOfExperience: createFieldDetail(resumeFields?.yearsOfExperience, 0.78, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(resumeFields?.education, 0.84, 'rule', input.evidenceChunks)
        ? { education: createFieldDetail(resumeFields?.education, 0.84, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(resumeFields?.major, 0.8, 'rule', input.evidenceChunks)
        ? { major: createFieldDetail(resumeFields?.major, 0.8, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(resumeFields?.expectedCity, 0.76, 'rule', input.evidenceChunks)
        ? { expectedCity: createFieldDetail(resumeFields?.expectedCity, 0.76, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(resumeFields?.expectedSalary, 0.74, 'rule', input.evidenceChunks)
        ? { expectedSalary: createFieldDetail(resumeFields?.expectedSalary, 0.74, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(resumeFields?.latestCompany, 0.84, 'rule', input.evidenceChunks)
        ? { latestCompany: createFieldDetail(resumeFields?.latestCompany, 0.84, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(companies, 0.76, 'derived', input.evidenceChunks)
        ? { companies: createFieldDetail(companies, 0.76, 'derived', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(resumeFields?.skills || [], 0.74, 'derived', input.evidenceChunks)
        ? { skills: createFieldDetail(resumeFields?.skills || [], 0.74, 'derived', input.evidenceChunks)! }
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
      candidateName: resumeFields?.candidateName || '',
      targetRole: resumeFields?.targetRole || '',
      currentRole: resumeFields?.currentRole || '',
      yearsOfExperience: resumeFields?.yearsOfExperience || '',
      education: resumeFields?.education || '',
      major: resumeFields?.major || '',
      expectedCity: resumeFields?.expectedCity || '',
      expectedSalary: resumeFields?.expectedSalary || '',
      latestCompany: resumeFields?.latestCompany || '',
      companies,
      skills: resumeFields?.skills || [],
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
      ...(createFieldDetail(enterpriseGuidanceFields?.businessSystem, 0.88, 'rule', input.evidenceChunks)
        ? { businessSystem: createFieldDetail(enterpriseGuidanceFields?.businessSystem, 0.88, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(enterpriseGuidanceFields?.documentKind, 0.84, 'rule', input.evidenceChunks)
        ? { documentKind: createFieldDetail(enterpriseGuidanceFields?.documentKind, 0.84, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(enterpriseGuidanceFields?.applicableScope, 0.8, 'rule', input.evidenceChunks)
        ? { applicableScope: createFieldDetail(enterpriseGuidanceFields?.applicableScope, 0.8, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(enterpriseGuidanceFields?.operationEntry, 0.82, 'rule', input.evidenceChunks)
        ? { operationEntry: createFieldDetail(enterpriseGuidanceFields?.operationEntry, 0.82, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(enterpriseGuidanceFields?.approvalLevels || [], 0.76, 'derived', input.evidenceChunks)
        ? { approvalLevels: createFieldDetail(enterpriseGuidanceFields?.approvalLevels || [], 0.76, 'derived', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(enterpriseGuidanceFields?.policyFocus || [], 0.74, 'derived', input.evidenceChunks)
        ? { policyFocus: createFieldDetail(enterpriseGuidanceFields?.policyFocus || [], 0.74, 'derived', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(enterpriseGuidanceFields?.contacts || [], 0.72, 'rule', input.evidenceChunks)
        ? { contacts: createFieldDetail(enterpriseGuidanceFields?.contacts || [], 0.72, 'rule', input.evidenceChunks)! }
        : {}),
    };
    return {
      ...base,
      domain: 'technical',
      focus: input.topicTags.slice(0, 4),
      businessSystem: enterpriseGuidanceFields?.businessSystem || '',
      documentKind: enterpriseGuidanceFields?.documentKind || '',
      applicableScope: enterpriseGuidanceFields?.applicableScope || '',
      operationEntry: enterpriseGuidanceFields?.operationEntry || '',
      approvalLevels: enterpriseGuidanceFields?.approvalLevels || [],
      policyFocus: enterpriseGuidanceFields?.policyFocus || [],
      contacts: enterpriseGuidanceFields?.contacts || [],
      fieldDetails,
      ...buildFocusedFieldPayload(fieldDetails, input.extractionProfile),
    };
  }

  if (input.schemaType === 'order') {
    const fieldDetails = {
      ...base.fieldDetails,
      ...(createFieldDetail(orderFields?.period, 0.8, 'rule', input.evidenceChunks)
        ? { period: createFieldDetail(orderFields?.period, 0.8, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(orderFields?.platform, 0.88, 'rule', input.evidenceChunks)
        ? { platform: createFieldDetail(orderFields?.platform, 0.88, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(orderFields?.orderCount, 0.82, 'rule', input.evidenceChunks)
        ? { orderCount: createFieldDetail(orderFields?.orderCount, 0.82, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(orderFields?.netSales, 0.82, 'rule', input.evidenceChunks)
        ? { netSales: createFieldDetail(orderFields?.netSales, 0.82, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(orderFields?.grossMargin, 0.78, 'rule', input.evidenceChunks)
        ? { grossMargin: createFieldDetail(orderFields?.grossMargin, 0.78, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(orderFields?.topCategory, 0.74, 'rule', input.evidenceChunks)
        ? { topCategory: createFieldDetail(orderFields?.topCategory, 0.74, 'rule', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(orderFields?.inventoryStatus, 0.68, 'derived', input.evidenceChunks)
        ? { inventoryStatus: createFieldDetail(orderFields?.inventoryStatus, 0.68, 'derived', input.evidenceChunks)! }
        : {}),
      ...(createFieldDetail(orderFields?.replenishmentAction, 0.68, 'derived', input.evidenceChunks)
        ? { replenishmentAction: createFieldDetail(orderFields?.replenishmentAction, 0.68, 'derived', input.evidenceChunks)! }
        : {}),
    };
    return {
      ...base,
      domain: 'order',
      period: orderFields?.period || '',
      platform: orderFields?.platform || '',
      orderCount: orderFields?.orderCount || '',
      netSales: orderFields?.netSales || '',
      grossMargin: orderFields?.grossMargin || '',
      topCategory: orderFields?.topCategory || '',
      inventoryStatus: orderFields?.inventoryStatus || '',
      replenishmentAction: orderFields?.replenishmentAction || '',
      focus: input.topicTags.slice(0, 4),
      fieldDetails,
      ...buildFocusedFieldPayload(fieldDetails, input.extractionProfile),
    };
  }

  if (input.schemaType === 'report') {
    const isFootfallReport = Boolean(
      footfallFields?.totalFootfall
      || footfallFields?.topMallZone
      || footfallFields?.mallZoneCount
      || footfallFields?.aggregationLevel,
    );
    const tableSummaryRecord = input.tableSummary && typeof input.tableSummary === 'object'
      ? input.tableSummary as Record<string, unknown>
      : null;
    const recordInsights = tableSummaryRecord?.recordInsights && typeof tableSummaryRecord.recordInsights === 'object'
      ? tableSummaryRecord.recordInsights as Record<string, unknown>
      : null;
    const rawMallZoneBreakdown = Array.isArray(recordInsights?.mallZoneBreakdown)
      ? recordInsights.mallZoneBreakdown as unknown[]
      : [];
    const mallZoneBreakdown = rawMallZoneBreakdown
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return '';
        return String((entry as Record<string, unknown>).mallZone || '').trim();
      })
      .filter(Boolean);
    const mallZones = [...new Set([
      ...mallZoneBreakdown,
      String(footfallFields?.topMallZone || '').trim(),
    ].filter(Boolean))];
    return {
      ...base,
      domain: 'report',
      focus: input.topicTags.slice(0, 4),
      reportFocus: isFootfallReport ? 'footfall' : 'generic',
      period: footfallFields?.period || '',
      totalFootfall: footfallFields?.totalFootfall || '',
      topMallZone: footfallFields?.topMallZone || '',
      mallZoneCount: footfallFields?.mallZoneCount || '',
      aggregationLevel: footfallFields?.aggregationLevel || '',
      mallZones: isFootfallReport ? mallZones : [],
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
  footfallFields?: ParsedDocument['footfallFields'];
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
      footfallFields: input.footfallFields,
      resumeFields: input.resumeFields,
      evidenceChunks: input.evidenceChunks,
      tableSummary: input.tableSummary,
      extractionProfile: profile ? {
        fieldSet: profile.fieldSet,
        preferredFieldKeys: profile.preferredFieldKeys,
        requiredFieldKeys: profile.requiredFieldKeys,
        fieldAliases: profile.fieldAliases,
        fieldPrompts: profile.fieldPrompts,
        fieldNormalizationRules: profile.fieldNormalizationRules,
        fieldConflictStrategies: profile.fieldConflictStrategies,
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
    footfallFields: item.footfallFields,
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
