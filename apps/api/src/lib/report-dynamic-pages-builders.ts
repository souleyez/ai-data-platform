import { buildReportPlan } from './report-planner.js';
import type { ReportDynamicSource } from './report-center.js';
import {
  buildDynamicSourceSummaryText,
  countDynamicTopValues,
  hasDynamicPlannerMetricKeyword,
  normalizeDynamicPlannerMetricText,
  summarizeDynamicDocuments,
} from './report-dynamic-pages-support.js';

export function buildDynamicPlanSummary(input: {
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

export function buildDynamicPlanCard(
  label: string,
  source: ReportDynamicSource,
  latestDocuments: Array<Record<string, unknown>>,
  detailedCount: number,
  topTopics: Array<[string, number]>,
  topSchemas: Array<[string, number]>,
  latestUpdatedAt: string,
) {
  const normalizedLabel = normalizeDynamicPlannerMetricText(label);
  const primaryTopic = topTopics[0]?.[0] || '暂无明确主题';
  const primarySchema = topSchemas[0]?.[0] || '未识别';
  const updatedDate = latestUpdatedAt ? latestUpdatedAt.slice(0, 10) : '-';

  if (hasDynamicPlannerMetricKeyword(normalizedLabel, ['资料', '数量', '覆盖', 'evidence'])) {
    return { label, value: String(latestDocuments.length), note: '当前参与动态页面生成的库内文档数' };
  }
  if (hasDynamicPlannerMetricKeyword(normalizedLabel, ['进阶', '详细', '解析', 'detailed'])) {
    return { label, value: String(detailedCount), note: '已完成详细解析的资料数' };
  }
  if (hasDynamicPlannerMetricKeyword(normalizedLabel, ['类型', 'schema', '结构'])) {
    return {
      label,
      value: primarySchema,
      note: topSchemas.map(([name, count]) => `${name} ${count}`).join('、') || '暂无稳定类型',
    };
  }
  if (hasDynamicPlannerMetricKeyword(normalizedLabel, ['更新', '时间', '日期'])) {
    return { label, value: updatedDate, note: source.timeRange || '默认全量范围' };
  }
  if (hasDynamicPlannerMetricKeyword(normalizedLabel, ['建议', '行动', '优先', '应答'])) {
    return {
      label,
      value: buildDynamicSourceSummaryText(source) || primaryTopic,
      note: source.request || '按当前动态页目标持续筛选重点材料',
    };
  }
  return {
    label,
    value: primaryTopic,
    note: topTopics.map(([name, count]) => `${name} ${count}`).join('、') || '暂无高频主题',
  };
}

export function buildDynamicPlanChartItems(
  title: string,
  topTopics: Array<[string, number]>,
  topSchemas: Array<[string, number]>,
) {
  const normalizedTitle = normalizeDynamicPlannerMetricText(title);
  const useSchemas = hasDynamicPlannerMetricKeyword(normalizedTitle, ['文档', '类型', 'schema']);
  const items = useSchemas ? topSchemas : topTopics;
  return items.map(([label, value]) => ({ label, value }));
}

export function buildDynamicPlanMetadata(plan: ReturnType<typeof buildReportPlan>) {
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

export function buildDynamicSectionBody(
  title: string,
  source: ReportDynamicSource,
  documents: Array<Record<string, unknown>>,
  topTopics: Array<[string, number]>,
  topSchemas: Array<[string, number]>,
) {
  const normalizedTitle = String(title || '').trim();
  const latestSummary = summarizeDynamicDocuments(documents as Array<{ title?: string; name?: string; summary?: string }>, 3);
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
    return `建议继续围绕“${buildDynamicSourceSummaryText(source)}”筛选重点材料，并优先处理 ${topicSummary || schemaSummary}。`;
  }
  return latestSummary || `当前可用资料主要围绕 ${topicSummary || schemaSummary} 展开。`;
}

export function countDynamicTopics(values: string[]) {
  return countDynamicTopValues(values);
}
