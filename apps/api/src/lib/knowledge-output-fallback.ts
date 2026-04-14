import type { ParsedDocument } from './document-parser.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import {
  alignRowsToColumns,
  buildDefaultTitle,
  containsAny,
  looksLikeJsonEchoText,
  normalizeText,
  sanitizeText,
  toStringArray,
} from './knowledge-output-normalization.js';
import {
  buildFootfallPageOutput,
  buildFootfallTableOutput,
  isFootfallReportDocument,
} from './knowledge-output-footfall.js';
import {
  buildOrderPageOutput,
  isOrderInventoryDocument,
  resolveOrderRequestView,
} from './knowledge-output-order.js';
import {
  buildRankedLabelCounts,
  joinRankedLabels,
} from './knowledge-output-resume-support.js';
import { buildResumeFallbackOutput } from './knowledge-output-resume-fallback.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import type { ChatOutput, KnowledgePageOutput } from './knowledge-output-types.js';

export const DEFAULT_PAGE_SECTIONS = ['摘要', '重点分析', '行动建议', 'AI综合分析'];

export function getLayoutPolishDeps() {
  return {
    buildDefaultTitle,
    containsAny,
    looksLikeJsonEchoText,
    normalizeText,
    sanitizeText,
  };
}

export function getFootfallOutputDeps() {
  return {
    normalizeText,
    sanitizeText,
    containsAny,
    looksLikeJsonEchoText,
  };
}

export function getOrderOutputDeps() {
  return {
    normalizeText,
    sanitizeText,
    containsAny,
    toStringArray,
    buildRankedLabelCounts,
    joinRankedLabels,
    looksLikeJsonEchoText,
  };
}

export function isNarrativeOutputKind(kind: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md') {
  return kind !== 'table';
}

export function resolveNarrativeOutputFormat(kind: 'page' | 'pdf' | 'ppt' | 'doc' | 'md') {
  if (kind === 'page') return 'html';
  if (kind === 'ppt') return 'pptx';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'doc') return 'docx';
  return 'md';
}

function wrapPageOutputAsKind(kind: 'page' | 'pdf' | 'ppt' | 'doc' | 'md', page: KnowledgePageOutput): ChatOutput {
  if (kind === 'page') return page;
  return {
    type: kind,
    title: page.title,
    content: page.content,
    format: resolveNarrativeOutputFormat(kind),
    page: page.page,
  };
}

function buildFallbackTableOutput(title: string, content: string, envelope?: ReportTemplateEnvelope | null): ChatOutput {
  const fallbackColumns = envelope?.tableColumns?.length ? envelope.tableColumns : ['结论', '说明', '证据来源'];
  const fallbackRow =
    fallbackColumns.length === 1
      ? [content]
      : [
          content || '当前未能稳定提取更多结构化条目。',
          '可继续补充更明确的筛选条件或模板全名。',
          '知识库当前证据',
        ];

  return {
    type: 'table',
    title,
    content,
    format: 'csv',
    table: {
      title,
      subtitle: '根据知识库内容整理',
      columns: fallbackColumns,
      rows: [alignRowsToColumns([fallbackRow], fallbackColumns)[0]],
    },
  };
}

function buildFallbackPageOutput(
  title: string,
  content: string,
  envelope?: ReportTemplateEnvelope | null,
): KnowledgePageOutput {
  const summary = content || '当前未能稳定提取更多可展示的知识库内容。';
  const sections = (envelope?.pageSections || DEFAULT_PAGE_SECTIONS).map((sectionTitle, index) => ({
    title: sectionTitle,
    body: index === 0 ? summary : '',
    bullets: [],
  }));

  return {
    type: 'page',
    title,
    content: summary,
    format: 'html',
    page: {
      summary,
      cards: [],
      sections,
      charts: [],
    },
  };
}

export function buildGenericFallbackOutput(
  kind: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md',
  requestText: string,
  rawContent: string,
  envelope?: ReportTemplateEnvelope | null,
): ChatOutput {
  const title = envelope?.title || buildDefaultTitle(kind);
  const content = sanitizeText(rawContent) || sanitizeText(requestText) || '当前未能稳定提取更多结构化结果。';

  if (isNarrativeOutputKind(kind)) {
    const page = buildFallbackPageOutput(title, content, envelope);
    return wrapPageOutputAsKind(kind, page);
  }

  return buildFallbackTableOutput(title, content, envelope);
}

export function buildKnowledgeMissMessage(libraries: Array<{ key: string; label: string }>) {
  if (libraries.length) {
    return `当前已尝试知识库：${libraries.map((item) => item.label).join('、')}。\n\n这次没有检索到足够的知识库证据，暂不生成结果。请换一种更明确的知识库表述，或先补充相关文档。`;
  }
  return '当前没有稳定命中的知识库，暂不生成结果。请先说明要基于哪个知识库输出。';
}

export function buildReportInstruction(kind: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md') {
  if (kind === 'page') {
    return [
      '只输出 JSON。',
      'Schema:',
      '{"title":"...","content":"...","page":{"summary":"...","cards":[{"label":"...","value":"...","note":"..."}],"sections":[{"title":"...","body":"...","bullets":["..."]}],"charts":[{"title":"...","items":[{"label":"...","value":12}]}]}}',
      '所有内容必须使用自然中文。',
    ].join('\n');
  }

  if (kind === 'pdf' || kind === 'ppt' || kind === 'doc' || kind === 'md') {
    return [
      '只输出 JSON。',
      'Schema:',
      '{"title":"...","content":"...","page":{"summary":"...","sections":[{"title":"...","body":"...","bullets":["..."]}]}}',
      '所有内容必须使用自然中文。',
    ].join('\n');
  }

  return [
    '只输出 JSON。',
    'Schema:',
    '{"title":"...","content":"...","table":{"title":"...","subtitle":"...","columns":["..."],"rows":[["...","..."]]}}',
    '所有内容必须使用自然中文。',
  ].join('\n');
}

export function buildKnowledgeFallbackOutput(
  kind: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md',
  requestText: string,
  documents: ParsedDocument[],
  envelope?: ReportTemplateEnvelope | null,
  displayProfiles: ResumeDisplayProfile[] = [],
): ChatOutput {
  const resumeFallback = buildResumeFallbackOutput(kind, requestText, documents, envelope, displayProfiles);
  if (resumeFallback) return resumeFallback;

  const footfallOutputDeps = getFootfallOutputDeps();
  const footfallDocuments = documents.filter((item) => isFootfallReportDocument(item, footfallOutputDeps));
  const orderOutputDeps = getOrderOutputDeps();
  const orderDocuments = documents.filter((item) => isOrderInventoryDocument(item, orderOutputDeps));
  const orderView = orderDocuments.length ? resolveOrderRequestView(requestText, orderOutputDeps) : 'generic';

  if (footfallDocuments.length) {
    if (isNarrativeOutputKind(kind)) {
      const page = buildFootfallPageOutput(footfallDocuments, envelope, footfallOutputDeps);
      return wrapPageOutputAsKind(kind, page);
    }

    if (kind === 'table') {
      return buildFootfallTableOutput(footfallDocuments, envelope, footfallOutputDeps);
    }
  }

  if (orderDocuments.length && isNarrativeOutputKind(kind)) {
    const page = buildOrderPageOutput(orderView, orderDocuments, envelope, orderOutputDeps);
    return wrapPageOutputAsKind(kind, page);
  }

  return buildGenericFallbackOutput(kind, requestText, '', envelope);
}
