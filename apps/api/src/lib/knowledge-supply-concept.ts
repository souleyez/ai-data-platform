import type { KnowledgeTemplateTaskHint } from './knowledge-template.js';
import type { KnowledgeLibraryRef } from './knowledge-supply-types.js';
import type { RetrievalResult } from './document-retrieval.js';
import {
  buildConceptGroupingHints,
  buildConceptSections,
  countTopValues,
  detectConceptDimension,
} from './knowledge-supply-concept-support.js';

export function buildConceptPageSupplyBlock(input: {
  requestText: string;
  libraries: KnowledgeLibraryRef[];
  retrieval: RetrievalResult;
  timeRange?: string;
  contentFocus?: string;
  templateTaskHint?: KnowledgeTemplateTaskHint | null;
}) {
  const documents = input.retrieval.documents.slice(0, 8);
  if (!documents.length) return '';

  const dimension = detectConceptDimension(input.requestText, input.templateTaskHint);
  const sections = buildConceptSections(dimension, input.templateTaskHint);
  const groupingHints = buildConceptGroupingHints(documents, dimension);
  const schemaHints = countTopValues(documents.map((item) => String(item.schemaType || item.category || 'generic')));
  const topicHints = countTopValues(documents.flatMap((item) => Array.isArray(item.topicTags) ? item.topicTags : []));
  const detailedCount = documents.filter((item) => item.parseStage === 'detailed' || item.detailParseStatus === 'succeeded').length;

  const cards = [
    `资料数量=${documents.length}`,
    `进阶解析=${detailedCount}`,
    schemaHints[0]?.label ? `主要类型=${schemaHints[0].label}` : '',
    groupingHints[0]?.label
      ? `核心维度=${groupingHints[0].label}`
      : input.templateTaskHint === 'footfall-static-page'
        ? '核心维度=商场分区'
        : '',
  ].filter(Boolean);

  const charts = [
    schemaHints.length ? `文档类型分布: ${schemaHints.map((item) => `${item.label} ${item.value}`).join(' | ')}` : '',
    groupingHints.length ? `核心维度分布: ${groupingHints.slice(0, 5).map((item) => `${item.label} ${item.value}`).join(' | ')}` : '',
    topicHints.length ? `主题热点: ${topicHints.slice(0, 5).map((item) => `${item.label} ${item.value}`).join(' | ')}` : '',
  ].filter(Boolean);

  return [
    'Concept page supply:',
    `Libraries: ${input.libraries.map((item) => item.label || item.key).join(' | ')}`,
    input.timeRange ? `Time range: ${input.timeRange}` : '',
    input.contentFocus ? `Content focus: ${input.contentFocus}` : '',
    input.templateTaskHint ? `Task hint: ${input.templateTaskHint}` : '',
    `Primary grouping dimension: ${dimension}`,
    `Recommended sections: ${sections.join(' | ')}`,
    cards.length ? `Recommended cards: ${cards.join(' | ')}` : '',
    charts.length ? `Recommended charts: ${charts.join(' || ')}` : '',
    groupingHints.length ? `Grouping hints: ${groupingHints.map((item) => `${item.label} (${item.value})`).join(' | ')}` : '',
    `Recent documents: ${documents.map((item) => item.title || item.name).filter(Boolean).slice(0, 6).join(' | ')}`,
  ]
    .filter(Boolean)
    .join('\n');
}
