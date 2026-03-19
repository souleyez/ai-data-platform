import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';

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
    suggestedGroups: string[];
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
    basis: `检测到 ${doc.topicTags.slice(0, 3).join('、')} 等主题，可作为可多选分组建议。`,
    action: 'consider_new_category' as const,
    parentCategoryKey: doc.bizCategory,
  };
}

function buildGroupSuggestion(doc: ParsedDocument) {
  const groups = doc.confirmedGroups?.length ? doc.confirmedGroups : doc.groups;
  if (!groups?.length) return undefined;
  return {
    suggestedGroups: groups,
    basis: `系统根据主题标签与分组关键词，建议挂入：${groups.join('、')}。`,
    accepted: Boolean(doc.confirmedGroups?.length),
  };
}

function buildReason(doc: ParsedDocument) {
  if (doc.parseStatus === 'unsupported') return '文件已接收，但当前版本暂不支持该类型的正文提取，建议后续人工确认分类。';
  if (doc.parseStatus === 'error') return '文件已接收，但本次解析失败；当前推荐主要依据文件名和已识别的有限特征。';
  if (doc.bizCategory === 'paper') return '检测到研究/实验相关表述，当前更适合作为学术论文类资料管理。';
  if (doc.bizCategory === 'contract' || doc.category === 'contract') return '检测到合同、条款、付款或甲乙方等要素，更接近合同协议材料。';
  if (doc.bizCategory === 'daily') return '检测到日报、周报、复盘等周期性总结表达，更接近工作日报。';
  if (doc.bizCategory === 'invoice') return '检测到发票、票据、凭据等字段，更适合作为发票凭据资料管理。';
  if (doc.bizCategory === 'order') return '检测到订单、销售、回款等业务信息，更适合作为订单分析资料管理。';
  if (doc.bizCategory === 'service') return '检测到客服、工单、投诉等信息，更适合作为客服采集资料管理。';
  if (doc.bizCategory === 'inventory') return '检测到库存、SKU、出入库等信息，更适合作为库存监控资料管理。';
  if (doc.topicTags?.length) return `检测到 ${doc.topicTags.slice(0, 3).join('、')} 等主题特征，先归入该资料类更便于后续整理。`;
  return '当前依据文件名、提取摘要和正文特征做了初步推荐，建议作为首轮归档分类。';
}

export function buildPreviewItemFromDocument(doc: ParsedDocument, sourceType: 'file' | 'url' = 'file', sourceName?: string): IngestPreviewItem {
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
    groupSuggestion: buildGroupSuggestion(doc),
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
