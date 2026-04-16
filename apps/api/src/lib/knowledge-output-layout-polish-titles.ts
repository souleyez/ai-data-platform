import type { ReportTemplateEnvelope } from './report-center.js';
import {
  looksLikeWeakChartTitle,
  shouldPreferGeneratedTitle,
} from './knowledge-output-layout-polish-support.js';
import type { LayoutPolishDeps, LayoutVariant } from './knowledge-output-layout-polish-types.js';

export function buildLayoutVariantPageTitle(
  layoutVariant: LayoutVariant | undefined,
  envelope: ReportTemplateEnvelope | null | undefined,
  deps: LayoutPolishDeps,
) {
  const envelopeTitle = deps.sanitizeText(envelope?.title);
  if (envelopeTitle) return envelopeTitle;
  if (layoutVariant === 'operations-cockpit') return '经营总览页';
  if (layoutVariant === 'solution-overview') return '方案介绍页';
  if (layoutVariant === 'research-brief') return '研究综述页';
  if (layoutVariant === 'risk-brief') return '风险简报页';
  if (layoutVariant === 'talent-showcase') return '人才展示页';
  if (layoutVariant === 'insight-brief') return '知识综述页';
  return deps.buildDefaultTitle('page');
}

export function buildLayoutVariantChartTitle(
  layoutVariant: LayoutVariant | undefined,
  title: string,
  index: number,
  deps: LayoutPolishDeps,
) {
  const normalizedTitle = deps.sanitizeText(title);
  if (!looksLikeWeakChartTitle(normalizedTitle, deps)) return normalizedTitle;
  if (layoutVariant === 'operations-cockpit') {
    if (index === 0) return '经营趋势概览';
    if (index === 1) return '风险与动作优先级';
    return '经营图表概览';
  }
  if (layoutVariant === 'solution-overview') {
    if (index === 0) return '能力覆盖一览';
    if (index === 1) return '交付阶段一览';
    return '方案要点图示';
  }
  if (layoutVariant === 'research-brief') {
    if (index === 0) return '关键结果对比';
    return '研究结果图示';
  }
  if (layoutVariant === 'risk-brief') {
    if (index === 0) return '风险主题分布';
    return '风险图示';
  }
  if (layoutVariant === 'talent-showcase') {
    if (index === 0) return '能力结构概览';
    return '案例分布图示';
  }
  return normalizedTitle;
}

export function resolvePreferredNarrativeTitle(
  input: {
    generatedTitle: string;
    requestText: string;
    fallbackTitle: string;
  },
  deps: LayoutPolishDeps,
) {
  return shouldPreferGeneratedTitle(input, deps)
    ? deps.sanitizeText(input.generatedTitle)
    : deps.sanitizeText(input.fallbackTitle) || deps.buildDefaultTitle('page');
}
