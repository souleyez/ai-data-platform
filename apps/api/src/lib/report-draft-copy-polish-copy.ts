import type { ReportDraftModule } from './report-center.js';
import type { DraftPolishContext } from './report-draft-copy-polish-types.js';
import {
  buildComparisonDimensionSentence,
  buildCtaActionSentence,
  buildScenarioLead,
  buildScenarioTail,
  ensureSentence,
  normalizeText,
  splitBulletLabel,
  summarizeBulletsForCopy,
  summarizeChartItemsForCopy,
} from './report-draft-copy-polish-utils.js';

export function buildPlaceholderContentDraft(
  moduleType: ReportDraftModule['moduleType'],
  title: string,
  summary: string,
  context?: DraftPolishContext,
) {
  const normalizedTitle = normalizeText(title) || '当前模块';
  if (moduleType === 'cta') {
    return `${buildScenarioLead(context?.layoutVariant || 'insight-brief', moduleType, normalizedTitle) || '建议先补充以下动作'}，终稿前再替换为确认后的客户口径。`;
  }
  if (moduleType === 'timeline') {
    return `${buildScenarioLead(context?.layoutVariant || 'insight-brief', moduleType, normalizedTitle) || '建议按阶段补充当前路径'}，终稿前补全关键节点和里程碑。`;
  }
  if (moduleType === 'comparison') {
    return `${buildScenarioLead(context?.layoutVariant || 'insight-brief', moduleType, normalizedTitle) || '当前模块可按对比结构补充'}，终稿前补全每个维度的证据和结论。`;
  }
  if (moduleType === 'metric-grid') {
    return `${normalizedTitle} 当前仍待补充确认后的关键数据，终稿前替换为可直接展示的指标卡。`;
  }
  if (moduleType === 'chart') {
    return `${normalizedTitle} 当前保留图表位置，终稿前补充实际数据和标题说明。`;
  }
  const normalizedSummary = normalizeText(summary);
  if (normalizedSummary) {
    return `${ensureSentence(normalizedSummary)}当前先保留「${normalizedTitle}」区块，终稿前补充更明确的证据和表述。`;
  }
  return `当前先保留「${normalizedTitle}」区块，终稿前补充更明确的证据和表述。`;
}

export function buildReadableModuleCopy(module: ReportDraftModule, context: DraftPolishContext) {
  const body = normalizeText(module.contentDraft);
  const bullets = Array.isArray(module.bullets) ? module.bullets.filter(Boolean).map((item) => normalizeText(item)) : [];
  const metricFocus = (context.metricLabels || []).map((item) => normalizeText(item)).filter(Boolean).slice(0, 2).join('、');
  const scenarioTail = buildScenarioTail(context.layoutVariant, module.moduleType);
  if (module.moduleType === 'hero') {
    if (body && metricFocus && scenarioTail) return `${ensureSentence(body)}当前页优先围绕${metricFocus}展开。${scenarioTail}`;
    if (body && metricFocus) return `${ensureSentence(body)}当前页优先围绕${metricFocus}展开。`;
    if (body && scenarioTail) return `${ensureSentence(body)}${scenarioTail}`;
    if (body) return ensureSentence(body);
    if (context.summary && metricFocus && scenarioTail) return `${ensureSentence(context.summary)}当前页优先围绕${metricFocus}展开。${scenarioTail}`;
    if (context.summary && metricFocus) return `${ensureSentence(context.summary)}当前页优先围绕${metricFocus}展开。`;
    if (context.summary && scenarioTail) return `${ensureSentence(context.summary)}${scenarioTail}`;
    return ensureSentence(context.summary);
  }
  if (module.moduleType === 'cta') {
    const topActions = summarizeBulletsForCopy(bullets, 2);
    const actionSentence = buildCtaActionSentence(context.layoutVariant, topActions);
    if (body && actionSentence && scenarioTail) return `${ensureSentence(body)}${actionSentence}${scenarioTail}`;
    if (body && actionSentence) return `${ensureSentence(body)}${actionSentence}`;
    if (body && scenarioTail) return `${ensureSentence(body)}${scenarioTail}`;
    if (body) return ensureSentence(body);
    if (topActions) return `${buildScenarioLead(context.layoutVariant, module.moduleType, module.title)}：${topActions}。`;
    return body;
  }
  if (module.moduleType === 'timeline') {
    const topPhases = summarizeBulletsForCopy(bullets, 3);
    if (body && bullets.length && scenarioTail) return `${ensureSentence(body)}建议按以下阶段展开。${scenarioTail}`;
    if (body && bullets.length) return `${ensureSentence(body)}建议按以下阶段展开。`;
    if (body && scenarioTail) return `${ensureSentence(body)}${scenarioTail}`;
    if (body) return ensureSentence(body);
    if (topPhases) return `${buildScenarioLead(context.layoutVariant, module.moduleType, module.title)}：${topPhases}。`;
    return body;
  }
  if (module.moduleType === 'comparison') {
    const dimensions = summarizeBulletsForCopy(bullets.map(splitBulletLabel), 3);
    const dimensionSentence = buildComparisonDimensionSentence(context.layoutVariant, dimensions);
    if (body && dimensionSentence && scenarioTail) return `${ensureSentence(body)}${dimensionSentence}${scenarioTail}`;
    if (body && dimensionSentence) return `${ensureSentence(body)}${dimensionSentence}`;
    if (body && scenarioTail) return `${ensureSentence(body)}${scenarioTail}`;
    if (body) return ensureSentence(body);
    if (dimensions) return `${buildScenarioLead(context.layoutVariant, module.moduleType, module.title)}：${dimensions}。`;
    return body;
  }
  if (module.moduleType === 'chart') {
    const chartFocus = summarizeChartItemsForCopy(module.chartIntent?.items, 3);
    if (body && chartFocus && scenarioTail) return `${ensureSentence(body)}图表建议优先展示${chartFocus}等核心维度。${scenarioTail}`;
    if (body && chartFocus) return `${ensureSentence(body)}图表建议优先展示${chartFocus}等核心维度。`;
    if (body && scenarioTail) return `${ensureSentence(body)}${scenarioTail}`;
    if (body) return ensureSentence(body);
    if (chartFocus) return `${buildScenarioLead(context.layoutVariant, module.moduleType, module.title)}：${chartFocus}。`;
    return body;
  }
  if (module.moduleType === 'insight-list') {
    const highlights = summarizeBulletsForCopy(bullets, 2);
    if (body && highlights && !body.includes(highlights) && scenarioTail) return `${ensureSentence(body)}重点集中在${highlights}。${scenarioTail}`;
    if (body && highlights && !body.includes(highlights)) return `${ensureSentence(body)}重点集中在${highlights}。`;
    if (body && scenarioTail) return `${ensureSentence(body)}${scenarioTail}`;
    if (body) return ensureSentence(body);
    if (highlights) return `${buildScenarioLead(context.layoutVariant, module.moduleType, module.title)}${highlights}。`;
    return body;
  }
  if (body) return ensureSentence(body);
  return body;
}
