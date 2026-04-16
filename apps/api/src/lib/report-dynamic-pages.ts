import type { ParsedDocument } from './document-parser.js';
import { matchDocumentsByPrompt } from './document-store.js';
import {
  buildReportPlan,
  inferReportPlanTaskHint,
  type ReportPlanDatavizSlot,
  type ReportPlanPageSpec,
  type ReportPlanVisualMixTarget,
} from './report-planner.js';
import { adaptTemplateEnvelopeForRequest } from './report-template-adapter.js';
import type {
  ReportDynamicSource,
  ReportGroup,
  ReportOutputRecord,
  SharedReportTemplate,
} from './report-center.js';
import {
  buildDynamicPlanCard,
  buildDynamicPlanChartItems,
  buildDynamicPlanMetadata,
  buildDynamicPlanSummary,
  buildDynamicSectionBody,
  countDynamicTopics,
} from './report-dynamic-pages-builders.js';
import {
  buildDynamicDocumentTimestamp,
  countDynamicTopValues,
  matchesDynamicLibraries,
  matchesDynamicTimeRange,
} from './report-dynamic-pages-support.js';

export type ReportDynamicPageDeps = {
  normalizeDynamicSource: (
    dynamicSource: Partial<ReportDynamicSource> | null | undefined,
    fallback: {
      request?: string;
      kind?: ReportOutputRecord['kind'];
      templateKey?: string;
      templateLabel?: string;
      libraries?: ReportOutputRecord['libraries'];
    },
  ) => ReportDynamicSource | null;
  buildConceptPageEnvelope: (group: ReportGroup | null, requestText: string) => {
    title: string;
    fixedStructure: string[];
    variableZones: string[];
    outputHint: string;
    pageSections?: string[];
  };
  buildSharedTemplateEnvelope: (template: SharedReportTemplate) => {
    title: string;
    fixedStructure: string[];
    variableZones: string[];
    outputHint: string;
    pageSections?: string[];
  };
  attachReportDataviz: (record: ReportOutputRecord) => Promise<ReportOutputRecord>;
  attachLocalReportAnalysis: (record: ReportOutputRecord) => ReportOutputRecord;
};

export async function buildDynamicPageRecordWithDeps(
  record: ReportOutputRecord,
  group: ReportGroup | null,
  template: SharedReportTemplate | null,
  documents: Array<Record<string, unknown>>,
  deps: ReportDynamicPageDeps,
) {
  const source = deps.normalizeDynamicSource(record.dynamicSource, {
    request: record.title || record.summary || '',
    kind: record.kind,
    templateKey: record.templateKey,
    templateLabel: record.templateLabel,
    libraries: record.libraries,
  });
  if (!source) return record;

  const scopedDocuments = documents
    .filter((item) => matchesDynamicLibraries(item as { groups?: string[]; confirmedGroups?: string[]; suggestedGroups?: string[] }, source.libraries))
    .filter((item) => matchesDynamicTimeRange(item as { detailParsedAt?: string; cloudStructuredAt?: string; retainedAt?: string; groupConfirmedAt?: string; categoryConfirmedAt?: string }, source.timeRange));

  const query = [source.contentFocus, source.request].filter(Boolean).join(' ').trim();
  const rankedDocuments = query
    ? matchDocumentsByPrompt(scopedDocuments as ParsedDocument[], query, Math.min(scopedDocuments.length, 30))
    : scopedDocuments;
  const latestDocuments = [...(rankedDocuments.length ? rankedDocuments : scopedDocuments)].sort(
    (left, right) => buildDynamicDocumentTimestamp(right as never) - buildDynamicDocumentTimestamp(left as never),
  );

  const topSchemas = countDynamicTopValues(latestDocuments.map((item) => String(item.schemaType || item.category || 'generic')));
  const topTopics = countDynamicTopics(latestDocuments.flatMap((item) => Array.isArray(item.topicTags) ? item.topicTags : []));
  const detailedCount = latestDocuments.filter((item) => item.parseStage === 'detailed').length;
  const latestTimestamp = latestDocuments.length ? buildDynamicDocumentTimestamp(latestDocuments[0] as never) : 0;
  const latestUpdatedAt = latestTimestamp ? new Date(latestTimestamp).toISOString() : '';
  const sourceFingerprint = latestDocuments
    .slice(0, 24)
    .map((item) => `${String(item.path || item.name || '')}:${String(item.detailParsedAt || item.cloudStructuredAt || item.summary || '').slice(0, 48)}`)
    .join('|');

  const conceptMode = Boolean(source.conceptMode) || !String(source.templateKey || '').trim();
  const envelope = conceptMode
    ? deps.buildConceptPageEnvelope(group, source.request || record.title || record.summary || '')
    : group && template
      ? adaptTemplateEnvelopeForRequest(group, deps.buildSharedTemplateEnvelope(template), 'page', source.request || record.title || record.summary || '')
      : template
        ? deps.buildSharedTemplateEnvelope(template)
        : deps.buildConceptPageEnvelope(group, source.request || record.title || record.summary || '');
  const templateTaskHint = inferReportPlanTaskHint({
    requestText: source.request || record.title || record.summary || '',
    groupKey: group?.key,
    groupLabel: group?.label,
    templateKey: conceptMode ? '' : (template?.key || source.templateKey || record.templateKey),
    templateLabel: conceptMode ? '' : (template?.label || source.templateLabel || record.templateLabel),
    kind: 'page',
  });
  const reportPlan = buildReportPlan({
    requestText: source.request || record.title || record.summary || '',
    templateTaskHint,
    conceptPageMode: conceptMode,
    baseEnvelope: envelope,
    retrieval: {
      documents: latestDocuments as ParsedDocument[],
      evidenceMatches: [],
      meta: {
        stages: ['rule'],
        vectorEnabled: false,
        candidateCount: latestDocuments.length,
        rerankedCount: latestDocuments.length,
        intent: 'generic',
        templateTask: templateTaskHint || 'general',
      },
    } as Parameters<typeof buildReportPlan>[0]['retrieval'],
    libraries: source.libraries,
  });
  const planMetadata = buildDynamicPlanMetadata(reportPlan);

  if (
    sourceFingerprint
    && source.sourceFingerprint === sourceFingerprint
    && JSON.stringify({
      planAudience: source.planAudience || '',
      planObjective: source.planObjective || '',
      planTemplateMode: source.planTemplateMode || '',
      planSectionTitles: source.planSectionTitles || [],
      planCardLabels: source.planCardLabels || [],
      planChartTitles: source.planChartTitles || [],
      planVisualMixTargets: source.planVisualMixTargets || [],
      planDatavizSlots: source.planDatavizSlots || [],
      planPageSpec: source.planPageSpec || null,
    }) === JSON.stringify(planMetadata)
  ) {
    return record;
  }

  const displayTemplateLabel = conceptMode
    ? '数据可视化静态页'
    : (source.templateLabel || template?.label || record.templateLabel || '数据可视化静态页');
  const summary = latestDocuments.length
    ? buildDynamicPlanSummary({
      title: reportPlan.envelope.title,
      libraries: source.libraries,
      documentCount: latestDocuments.length,
      detailedCount,
      topTopics,
      latestUpdatedAt,
    })
    : '当前知识库中暂无符合条件的资料，页面保持空状态。';
  const sections = (reportPlan.sections.length
    ? reportPlan.sections.map((item) => item.title)
    : (envelope.pageSections || ['摘要', '重点分析', '行动建议', 'AI综合分析'])).map((title) => ({
    title,
    body: title === 'AI综合分析'
      ? `该页面会随着知识库内容变化自动刷新，当前最值得优先关注的是 ${topTopics.map(([name]) => name).slice(0, 2).join('、') || '资料质量与更新频率'}。`
      : buildDynamicSectionBody(title, source, latestDocuments, topTopics, topSchemas),
    bullets: title === 'AI综合分析'
      ? []
      : latestDocuments
          .slice(0, 3)
          .map((item) => String(item.title || item.name || '').trim())
          .filter(Boolean),
  }));
  const cards = (reportPlan.cards.length ? reportPlan.cards : [
    { label: '资料数量' },
    { label: '进阶解析' },
    { label: '主要类型' },
    { label: '最近更新' },
  ]).map((card) => buildDynamicPlanCard(
    card.label,
    source,
    latestDocuments,
    detailedCount,
    topTopics,
    topSchemas,
    latestUpdatedAt,
  ));
  const charts = reportPlan.charts
    .map((chart) => ({
      title: chart.title,
      items: buildDynamicPlanChartItems(chart.title, topTopics, topSchemas),
    }))
    .filter((chart) => chart.items.length);

  return deps.attachReportDataviz(deps.attachLocalReportAnalysis({
    ...record,
    content: summary,
    summary: `${displayTemplateLabel} 已按当前知识库内容动态刷新。`,
    page: {
      summary,
      cards,
      sections,
      datavizSlots: reportPlan.datavizSlots,
      pageSpec: reportPlan.pageSpec,
      charts,
    },
    dynamicSource: {
      ...source,
      outputType: 'page',
      conceptMode,
      templateKey: conceptMode ? '' : (source.templateKey || template?.key || ''),
      templateLabel: conceptMode ? '' : (source.templateLabel || template?.label || ''),
      lastRenderedAt: new Date().toISOString(),
      sourceFingerprint,
      sourceDocumentCount: latestDocuments.length,
      sourceUpdatedAt: latestUpdatedAt,
      ...planMetadata,
      planUpdatedAt: new Date().toISOString(),
    },
  }));
}
