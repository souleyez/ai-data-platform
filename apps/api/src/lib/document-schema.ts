import type { ParsedDocument, ResumeFields } from './document-parser.js';

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

export function buildStructuredProfile(input: {
  schemaType: ParsedDocument['schemaType'];
  title: string;
  topicTags: string[];
  summary: string;
  contractFields?: ParsedDocument['contractFields'];
  resumeFields?: ResumeFields;
}) {
  const evidence = `${input.title} ${input.summary} ${input.topicTags.join(' ')}`.toLowerCase();
  const base = {
    title: input.title,
    summary: input.summary,
    topicTags: input.topicTags.slice(0, 8),
  };

  if (input.schemaType === 'contract') {
    return {
      ...base,
      contractNo: input.contractFields?.contractNo || '',
      amount: input.contractFields?.amount || '',
      paymentTerms: input.contractFields?.paymentTerms || '',
      duration: input.contractFields?.duration || '',
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

    return {
      ...base,
      candidateName: input.resumeFields?.candidateName || '',
      targetRole: input.resumeFields?.targetRole || '',
      currentRole: input.resumeFields?.currentRole || '',
      yearsOfExperience: input.resumeFields?.yearsOfExperience || '',
      education: input.resumeFields?.education || '',
      major: input.resumeFields?.major || '',
      latestCompany: input.resumeFields?.latestCompany || '',
      companies,
      skills: input.resumeFields?.skills || [],
      highlights,
      projectHighlights: fallbackProjects,
      itProjectHighlights: fallbackItProjects,
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
    return {
      ...base,
      domain: 'technical',
      focus: input.topicTags.slice(0, 4),
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
  resumeFields?: ResumeFields;
}) {
  const schemaType = inferSchemaType(
    input.category,
    input.bizCategory,
    input.resumeFields,
    input.topicTags,
    input.title,
    input.summary,
  );

  return {
    schemaType,
    resumeFields: input.resumeFields,
    structuredProfile: buildStructuredProfile({
      schemaType,
      title: input.title,
      topicTags: input.topicTags,
      summary: input.summary,
      contractFields: input.contractFields,
      resumeFields: input.resumeFields,
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
    resumeFields: item.resumeFields,
  });

  return {
    ...item,
    resumeFields: derived.resumeFields,
    schemaType: derived.schemaType,
    structuredProfile: derived.structuredProfile,
  };
}
