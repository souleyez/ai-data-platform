import type { DraftPolishContext } from './report-draft-copy-polish-types.js';
import type { ReportDraftModuleType } from './report-center.js';
import { buildMetricGridTitle, normalizeText } from './report-draft-copy-polish-utils.js';

export function buildScenarioModuleTitle(
  layoutVariant: DraftPolishContext['layoutVariant'],
  moduleType: ReportDraftModuleType,
  currentTitle: string,
) {
  const normalizedTitle = normalizeText(currentTitle);
  if (moduleType === 'hero' && normalizedTitle === '页面摘要') {
    if (layoutVariant === 'operations-cockpit') return '经营总览';
    if (layoutVariant === 'solution-overview') return '方案概览';
    if (layoutVariant === 'research-brief') return '研究摘要';
    if (layoutVariant === 'risk-brief') return '风险摘要';
    if (layoutVariant === 'talent-showcase') return '人物概览';
  }
  if (moduleType === 'metric-grid' && normalizedTitle === '关键指标') {
    return buildMetricGridTitle(layoutVariant);
  }
  if (moduleType === 'cta' && normalizedTitle === '行动建议') {
    if (layoutVariant === 'operations-cockpit') return '下一步动作';
    if (layoutVariant === 'solution-overview') return '推进建议';
    if (layoutVariant === 'research-brief') return '研究建议';
  }
  return currentTitle;
}
