import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import type { DocumentLibrary } from './document-libraries.js';

export type IngestPreviewItem = {
  id: string;
  sourceType: 'file' | 'url';
  sourceName: string;
  status: 'success' | 'failed';
  preview?: {
    title: string;
    summary: string;
    docType: string;
  };
  recommendation?: {
    category: string;
    reason: string;
  };
  classification?: {
    recommendedKey: string;
    selectedKey: string;
    selectedLabel: string;
    options: Array<{ key: string; label: string }>;
    confirmed: boolean;
    confirmedAt?: string;
  };
  categorySuggestion?: {
    suggestedName: string;
    basis: string;
    action: 'consider_new_category' | 'keep_current';
    parentCategoryKey: string;
    accepted?: boolean;
  };
  groupSuggestion?: {
    suggestedGroups: Array<{ key: string; label: string }>;
    basis: string;
    accepted?: boolean;
  };
  errorMessage?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  paper: '学术论文',
  contract: '合同协议',
  daily: '工作日报',
  invoice: '发票凭据',
  order: '订单分析',
  service: '客服采集',
  inventory: '库存监控',
};

const LIBRARY_TERM_ALIASES: Array<{ pattern: RegExp; terms: string[] }> = [
  {
    pattern: /(奶粉|配方|formula|乳粉|婴配粉)/i,
    terms: ['奶粉', '配方', '乳粉', '婴配粉', '婴幼儿配方', 'formula', 'infant', 'pediatric', 'nutrition', 'nutritional', 'probiotic', 'prebiotic', 'synbiotic', 'lactobacillus', 'bifidobacterium', 'hmo', 'hmos'],
  },
  {
    pattern: /(肠道|gut|菌群|microbiome)/i,
    terms: ['肠道', 'gut', '菌群', 'microbiome', 'flora', 'intestinal', 'probiotic', 'prebiotic', 'lactobacillus', 'bifidobacterium'],
  },
  {
    pattern: /(脑|brain|认知)/i,
    terms: ['脑', 'brain', '认知', 'cognitive', 'neuro', 'dha', 'omega-3'],
  },
];

function toCategoryLabel(category?: string) {
  return CATEGORY_LABELS[category || 'paper'] || '学术论文';
}

function getEffectiveCategoryKey(doc: ParsedDocument) {
  return doc.confirmedBizCategory || doc.bizCategory;
}

function buildCategorySuggestion(doc: ParsedDocument) {
  if (!doc.topicTags?.length) return undefined;
  return {
    suggestedName: doc.topicTags[0],
    basis: `检测到 ${doc.topicTags.slice(0, 3).join('、')} 等主题，可作为后续细分分组的参考。`,
    action: 'consider_new_category' as const,
    parentCategoryKey: doc.bizCategory,
  };
}

function expandLibraryTerms(library: DocumentLibrary) {
  const baseTerms = [library.key, library.label, library.description]
    .filter(Boolean)
    .flatMap((text) => String(text).toLowerCase().split(/[\s,，。/|()-]+/))
    .filter((term) => term.length >= 2);

  const expanded = new Set(baseTerms);
  const joined = [library.key, library.label, library.description].filter(Boolean).join(' ');

  for (const alias of LIBRARY_TERM_ALIASES) {
    if (alias.pattern.test(joined)) {
      alias.terms.forEach((term) => expanded.add(term.toLowerCase()));
    }
  }

  return [...expanded];
}

function scoreLibrarySuggestion(doc: ParsedDocument, library: DocumentLibrary) {
  const effectiveCategory = getEffectiveCategoryKey(doc);
  if (library.isDefault && library.sourceCategoryKey === effectiveCategory) {
    return 10;
  }

  const evidence = [
    doc.title,
    doc.summary,
    doc.excerpt,
    ...(doc.topicTags || []),
    ...(doc.groups || []),
  ]
    .join(' ')
    .toLowerCase();

  const libraryTerms = expandLibraryTerms(library);

  return libraryTerms.reduce((score, term) => {
    if (!term) return score;
    if (evidence.includes(term)) return score + (term.length >= 4 ? 3 : 2);
    return score;
  }, 0);
}

export function resolveSuggestedLibraryKeys(doc: ParsedDocument, libraries: DocumentLibrary[] = []) {
  return libraries
    .map((library) => ({ library, score: scoreLibrarySuggestion(doc, library) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.library.key);
}

function buildGroupSuggestion(doc: ParsedDocument, libraries: DocumentLibrary[] = []) {
  const confirmedGroups = doc.confirmedGroups?.length ? doc.confirmedGroups : [];
  if (confirmedGroups.length) {
    const labels = confirmedGroups.map((key) => libraries.find((item) => item.key === key)?.label || key);
    return {
      suggestedGroups: confirmedGroups.map((key) => ({
        key,
        label: libraries.find((item) => item.key === key)?.label || key,
      })),
      basis: `已根据解析内容自动加入推荐知识库：${labels.join('、')}。`,
      accepted: true,
    };
  }

  const suggestedGroups = doc.suggestedGroups?.length ? doc.suggestedGroups : [];
  if (suggestedGroups.length) {
    const matchedSuggestions = suggestedGroups
      .map((key) => libraries.find((item) => item.key === key) || ({ key, label: key } as DocumentLibrary));
    return {
      suggestedGroups: matchedSuggestions.map((library) => ({ key: library.key, label: library.label })),
      basis: `根据标题、摘要和主题标签，建议加入：${matchedSuggestions.map((library) => library.label).join('、')}。`,
      accepted: false,
    };
  }

  const matchedKeys = resolveSuggestedLibraryKeys(doc, libraries);
  const matched = matchedKeys
    .map((key) => libraries.find((library) => library.key === key))
    .filter(Boolean) as DocumentLibrary[];

  if (!matched.length) {
    return {
      suggestedGroups: [],
      basis: '未命中合适的现有知识库，默认保持未分组。',
      accepted: true,
    };
  }

  return {
    suggestedGroups: matched.map((library) => ({ key: library.key, label: library.label })),
    basis: `根据标题、摘要和主题命中，建议自动加入：${matched.map((library) => library.label).join('、')}。`,
    accepted: false,
  };
}

function buildReason(doc: ParsedDocument) {
  if (doc.parseStatus === 'unsupported') return '文件已接收，但当前版本暂不支持该类型正文提取，建议后续人工确认分类。';
  if (doc.parseStatus === 'error') return '文件已接收，但本次解析失败；当前推荐主要依据文件名和可识别主题线索。';
  if (doc.bizCategory === 'paper') return '检测到研究、实验、结论等表达，更适合作为学术论文资料管理。';
  if (doc.bizCategory === 'contract' || doc.category === 'contract') return '检测到合同、条款、付款或甲乙方等要素，更接近合同协议材料。';
  if (doc.bizCategory === 'daily') return '检测到日报、周报、复盘等周期性总结表达，更接近工作日报。';
  if (doc.bizCategory === 'invoice') return '检测到发票、票据、凭据等字段，更适合作为发票凭据资料管理。';
  if (doc.bizCategory === 'order') return '检测到订单、销售、回款等业务信息，更适合作为订单分析资料管理。';
  if (doc.bizCategory === 'service') return '检测到客服、工单、投诉等信息，更适合作为客服采集资料管理。';
  if (doc.bizCategory === 'inventory') return '检测到库存、SKU、出入库等信息，更适合作为库存监控资料管理。';
  if (doc.topicTags?.length) return `检测到 ${doc.topicTags.slice(0, 3).join('、')} 等主题特征，便于后续继续整理。`;
  return '当前依据文件名、摘要和正文特征完成了初步分类推荐。';
}

export function buildPreviewItemFromDocument(
  doc: ParsedDocument,
  sourceType: 'file' | 'url' = 'file',
  sourceName?: string,
  libraries: DocumentLibrary[] = [],
): IngestPreviewItem {
  const recommendedKey = doc.bizCategory;
  const selectedKey = getEffectiveCategoryKey(doc);

  return {
    id: Buffer.from(doc.path).toString('base64url'),
    sourceType,
    sourceName: sourceName || doc.name,
    status: 'success',
    preview: {
      title: doc.title || path.parse(doc.name).name,
      summary: doc.summary,
      docType: toCategoryLabel(selectedKey),
    },
    recommendation: {
      category: toCategoryLabel(recommendedKey),
      reason: buildReason(doc),
    },
    classification: {
      recommendedKey,
      selectedKey,
      selectedLabel: toCategoryLabel(selectedKey),
      options: Object.entries(CATEGORY_LABELS).map(([key, label]) => ({ key, label })),
      confirmed: Boolean(doc.confirmedBizCategory),
      confirmedAt: doc.categoryConfirmedAt,
    },
    categorySuggestion: buildCategorySuggestion(doc),
    groupSuggestion: buildGroupSuggestion(doc, libraries),
  };
}

export function buildFailedPreviewItem(input: { id: string; sourceType: 'file' | 'url'; sourceName: string; errorMessage: string }): IngestPreviewItem {
  return {
    id: input.id,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    status: 'failed',
    errorMessage: input.errorMessage,
  };
}
