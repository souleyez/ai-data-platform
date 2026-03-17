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
  errorMessage?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  paper: '学术论文',
  technical: '技术文档',
  contract: '合同/协议',
  report: '报告/简报',
  general: '通用资料',
  other: '其他资料',
};

function toCategoryLabel(category?: string) {
  return CATEGORY_LABELS[category || 'other'] || '其他资料';
}

function buildReason(doc: ParsedDocument) {
  if (doc.parseStatus === 'unsupported') return '文件已接收，但当前版本暂不支持该类型的正文提取，建议后续人工确认分类。';
  if (doc.parseStatus === 'error') return '文件已接收，但本次解析失败；当前推荐主要依据文件名和已识别的有限特征。';
  if (doc.bizCategory === 'paper' || doc.category === 'paper') {
    return '检测到研究/实验相关表述，且内容结构更接近论文或研究材料。';
  }
  if (doc.bizCategory === 'technical' || doc.category === 'technical') {
    return '检测到方案、接口、部署、采集等技术描述，内容更接近技术文档。';
  }
  if (doc.bizCategory === 'contract' || doc.category === 'contract') {
    return '检测到合同、条款、付款或甲乙方等要素，更接近合同/协议材料。';
  }
  if (doc.bizCategory === 'report' || doc.category === 'report') {
    return '检测到报告、复盘或阶段性总结表达，更接近报告类资料。';
  }
  if (doc.topicTags?.length) {
    return `检测到 ${doc.topicTags.slice(0, 3).join('、')} 等主题特征，先归入该资料类更便于后续整理。`;
  }
  return '当前依据文件名、提取摘要和正文特征做了初步推荐，建议作为首轮归档分类。';
}

export function buildPreviewItemFromDocument(doc: ParsedDocument, sourceType: 'file' | 'url' = 'file'): IngestPreviewItem {
  return {
    id: Buffer.from(doc.path).toString('base64url'),
    sourceType,
    sourceName: doc.name,
    status: 'success',
    preview: {
      title: doc.title || path.parse(doc.name).name,
      summary: doc.summary,
      docType: toCategoryLabel(doc.bizCategory === 'other' ? doc.category : doc.bizCategory),
    },
    recommendation: {
      category: toCategoryLabel(doc.bizCategory === 'other' ? doc.category : doc.bizCategory),
      reason: buildReason(doc),
    },
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
