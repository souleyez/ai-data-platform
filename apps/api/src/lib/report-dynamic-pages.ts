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

function buildDocumentTimestamp(item: {
  detailParsedAt?: string;
  cloudStructuredAt?: string;
  retainedAt?: string;
  groupConfirmedAt?: string;
  categoryConfirmedAt?: string;
}) {
  const timestamps = [item.detailParsedAt, item.cloudStructuredAt, item.retainedAt, item.groupConfirmedAt, item.categoryConfirmedAt]
    .map((value) => {
      const date = value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
    })
    .filter(Boolean);
  return timestamps.length ? Math.max(...timestamps) : 0;
}

function matchesDynamicLibraries(
  item: { groups?: string[]; confirmedGroups?: string[]; suggestedGroups?: string[] },
  libraries: Array<{ key?: string; label?: string }>,
) {
  const names = new Set(
    libraries
      .flatMap((entry) => [entry.key, entry.label])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );
  if (!names.size) return false;

  const documentGroups = [
    ...(Array.isArray(item.groups) ? item.groups : []),
    ...(Array.isArray(item.confirmedGroups) ? item.confirmedGroups : []),
    ...(Array.isArray(item.suggestedGroups) ? item.suggestedGroups : []),
  ];

  return documentGroups.some((group) => names.has(String(group || '').trim()));
}

function matchesTimeRange(
  item: { detailParsedAt?: string; cloudStructuredAt?: string; retainedAt?: string; groupConfirmedAt?: string; categoryConfirmedAt?: string },
  timeRange?: string,
) {
  const text = String(timeRange || '').trim();
  if (!text || /(全部|所有|不限|all)/i.test(text)) return true;

  const timestamp = buildDocumentTimestamp(item);
  if (!timestamp) return true;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  if (/(今天|今日|today)/i.test(text)) return now - timestamp <= dayMs;
  if (/(本周|这周|近一周|最近一周|week)/i.test(text)) return now - timestamp <= dayMs * 7;
  if (/(本月|这个月|近一个月|最近一个月|month)/i.test(text)) return now - timestamp <= dayMs * 31;
  if (/(最近|最新|recent)/i.test(text)) return now - timestamp <= dayMs * 14;
  return true;
}

function countTopValues(values: string[]) {
  const counter = new Map<string, number>();
  for (const value of values) {
    const key = String(value || '').trim();
    if (!key) continue;
    counter.set(key, (counter.get(key) || 0) + 1);
  }
  return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
}

function summarizeDocuments(documents: Array<{ title?: string; name?: string; summary?: string }>, limit = 3) {
  return documents
    .slice(0, limit)
    .map((item) => {
      const title = String(item.title || item.name || '').trim() || '未命名文档';
      const summary = String(item.summary || '').trim();
      return summary ? `${title}：${summary}` : title;
    })
    .join('；');
}

function normalizePlannerMetricText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPlannerMetricKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(normalizePlannerMetricText(keyword)));
}

function buildDynamicPlanSummary(input: {
  title: string;
  libraries: Array<{ key?: string; label?: string }>;
  documentCount: number;
  detailedCount: number;
  topTopics: Array<[string, number]>;
  latestUpdatedAt: string;
}) {
  const librarySummary = input.libraries.map((item) => item.label || item.key).filter(Boolean).join('、') || '当前知识库';
  const topicSummary = input.topTopics.map(([name]) => name).slice(0, 4).join('、') || '暂无明确主题';
  const updatedAt = input.latestUpdatedAt ? `最近更新为 ${input.latestUpdatedAt.slice(0, 10)}。` : '';
  return `当前已按「${input.title || '数据可视化静态页'}」结构，基于 ${librarySummary} 中 ${input.documentCount} 份资料动态生成页面，其中 ${input.detailedCount} 份已完成进阶解析。当前重点主题包括 ${topicSummary}。${updatedAt}`.trim();
}

function buildDynamicPlanCard(
  label: string,
  source: ReportDynamicSource,
  latestDocuments: Array<Record<string, unknown>>,
  detailedCount: number,
  topTopics: Array<[string, number]>,
  topSchemas: Array<[string, number]>,
  latestUpdatedAt: string,
) {
  const normalizedLabel = normalizePlannerMetricText(label);
  const primaryTopic = topTopics[0]?.[0] || '暂无明确主题';
  const primarySchema = topSchemas[0]?.[0] || '未识别';
  const updatedDate = latestUpdatedAt ? latestUpdatedAt.slice(0, 10) : '-';

  if (hasPlannerMetricKeyword(normalizedLabel, ['资料', '数量', '覆盖', 'evidence'])) {
    return { label, value: String(latestDocuments.length), note: '当前参与动态页面生成的库内文档数' };
  }
  if (hasPlannerMetricKeyword(normalizedLabel, ['进阶', '详细', '解析', 'detailed'])) {
    return { label, value: String(detailedCount), note: '已完成详细解析的资料数' };
  }
  if (hasPlannerMetricKeyword(normalizedLabel, ['类型', 'schema', '结构'])) {
    return {
      label,
      value: primarySchema,
      note: topSchemas.map(([name, count]) => `${name} ${count}`).join('、') || '暂无稳定类型',
    };
  }
  if (hasPlannerMetricKeyword(normalizedLabel, ['更新', '时间', '日期'])) {
    return { label, value: updatedDate, note: source.timeRange || '默认全量范围' };
  }
  if (hasPlannerMetricKeyword(normalizedLabel, ['建议', '行动', '优先', '应答'])) {
    return {
      label,
      value: source.contentFocus || primaryTopic,
      note: source.request || '按当前动态页目标持续筛选重点材料',
    };
  }
  return {
    label,
    value: primaryTopic,
    note: topTopics.map(([name, count]) => `${name} ${count}`).join('、') || '暂无高频主题',
  };
}

function buildDynamicPlanChartItems(
  title: string,
  topTopics: Array<[string, number]>,
  topSchemas: Array<[string, number]>,
) {
  const normalizedTitle = normalizePlannerMetricText(title);
  const useSchemas = hasPlannerMetricKeyword(normalizedTitle, ['文档', '类型', 'schema']);
  const items = useSchemas ? topSchemas : topTopics;
  return items.map(([label, value]) => ({ label, value }));
}

function buildDynamicPlanMetadata(plan: ReturnType<typeof buildReportPlan>) {
  return {
    planAudience: plan.audience,
    planObjective: plan.objective,
    planTemplateMode: plan.templateMode,
    planSectionTitles: plan.sections.map((item) => item.title),
    planCardLabels: plan.cards.map((item) => item.label),
    planChartTitles: plan.charts.map((item) => item.title),
    planMustHaveModules: plan.mustHaveModules,
    planOptionalModules: plan.optionalModules,
    planEvidencePriority: plan.evidencePriority,
    planAudienceTone: plan.audienceTone,
    planRiskNotes: plan.riskNotes,
    planVisualMixTargets: plan.visualMixTargets,
    planDatavizSlots: plan.datavizSlots.map((item) => ({
      key: item.key,
      title: item.title,
      purpose: item.purpose,
      preferredChartType: item.preferredChartType,
      placement: item.placement,
      sectionTitle: item.sectionTitle,
      evidenceFocus: item.evidenceFocus,
      minItems: item.minItems,
      maxItems: item.maxItems,
    })),
    planPageSpec: {
      layoutVariant: plan.pageSpec.layoutVariant,
      heroCardLabels: plan.pageSpec.heroCardLabels,
      heroDatavizSlotKeys: plan.pageSpec.heroDatavizSlotKeys,
      sections: plan.pageSpec.sections.map((item) => ({
        title: item.title,
        purpose: item.purpose,
        completionMode: item.completionMode,
        displayMode: item.displayMode,
        datavizSlotKeys: item.datavizSlotKeys,
      })),
    },
  };
}

function buildDynamicSectionBody(
  title: string,
  source: ReportDynamicSource,
  documents: Array<Record<string, unknown>>,
  topTopics: Array<[string, number]>,
  topSchemas: Array<[string, number]>,
) {
  const normalizedTitle = String(title || '').trim();
  const latestSummary = summarizeDocuments(documents as Array<{ title?: string; name?: string; summary?: string }>, 3);
  const topicSummary = topTopics.length ? topTopics.map(([name, count]) => `${name}(${count})`).join('、') : '暂无稳定主题';
  const schemaSummary = topSchemas.length ? topSchemas.map(([name, count]) => `${name}(${count})`).join('、') : '暂无稳定类型';

  if (/摘要|概况|总览/.test(normalizedTitle)) {
    return `本次页面基于 ${documents.length} 份库内资料动态生成。当前请求重点为“${source.request || '当前知识库内容'}”，最近资料概览为：${latestSummary || '暂无可用资料摘要'}。`;
  }
  if (/指标|对比|趋势|图表/.test(normalizedTitle)) {
    return `当前知识库的主要文档类型为 ${schemaSummary}，高频主题包括 ${topicSummary}。页面中的图表和指标会随着库内资料变化自动更新。`;
  }
  if (/风险|异常/.test(normalizedTitle)) {
    return `当前更值得关注的是 ${topicSummary}。建议优先复核最近新增资料中的变化点、证据一致性和异常波动说明。`;
  }
  if (/建议|行动|备货/.test(normalizedTitle)) {
    return `建议继续围绕“${source.contentFocus || source.request || '当前目标'}”筛选重点材料，并优先处理 ${topicSummary || schemaSummary}。`;
  }
  return latestSummary || `当前可用资料主要围绕 ${topicSummary || schemaSummary} 展开。`;
}

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
    .filter((item) => matchesTimeRange(item as { detailParsedAt?: string; cloudStructuredAt?: string; retainedAt?: string; groupConfirmedAt?: string; categoryConfirmedAt?: string }, source.timeRange));

  const query = [source.contentFocus, source.request].filter(Boolean).join(' ').trim();
  const rankedDocuments = query
    ? matchDocumentsByPrompt(scopedDocuments as ParsedDocument[], query, Math.min(scopedDocuments.length, 30))
    : scopedDocuments;
  const latestDocuments = [...(rankedDocuments.length ? rankedDocuments : scopedDocuments)].sort(
    (left, right) => buildDocumentTimestamp(right as never) - buildDocumentTimestamp(left as never),
  );

  const topSchemas = countTopValues(latestDocuments.map((item) => String(item.schemaType || item.category || 'generic')));
  const topTopics = countTopValues(latestDocuments.flatMap((item) => Array.isArray(item.topicTags) ? item.topicTags : []));
  const detailedCount = latestDocuments.filter((item) => item.parseStage === 'detailed').length;
  const latestTimestamp = latestDocuments.length ? buildDocumentTimestamp(latestDocuments[0] as never) : 0;
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
