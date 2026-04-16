import type {
  ReportPlanCard,
  ReportPlanLayoutVariant,
  ReportPlanQualityTargets,
  ReportPlanSection,
  ReportPlanVisualMixModuleType,
  ReportPlanVisualMixTarget,
} from './report-planner.js';

function buildVisualMixTargets(
  entries: Array<[ReportPlanVisualMixModuleType, number, number, number]>,
): ReportPlanVisualMixTarget[] {
  return entries.map(([moduleType, minCount, targetCount, maxCount]) => ({
    moduleType,
    minCount,
    targetCount,
    maxCount,
  }));
}

export function buildPlanQualityTargets(
  layoutVariant: ReportPlanLayoutVariant,
  cards: ReportPlanCard[],
  sections: ReportPlanSection[],
): ReportPlanQualityTargets {
  const cardLabels = cards.map((item) => item.label).filter(Boolean);
  const sectionTitles = sections.map((item) => item.title).filter(Boolean);

  switch (layoutVariant) {
    case 'operations-cockpit':
      return {
        mustHaveModules: [...new Set(['页面摘要', '关键指标', '风险提醒', '行动建议', ...sectionTitles.filter((item) => /概览|风险|建议|行动/u.test(item))])],
        optionalModules: [...new Set(['关键趋势图', '结构对比'])],
        evidencePriority: [...new Set([...cardLabels.slice(0, 3), '风险提醒', '行动建议'])],
        audienceTone: 'operator-facing',
        riskNotes: [
          'Prefer concrete operating signals over decorative narrative.',
          'If trend evidence is weak, show the gap instead of fabricating momentum.',
        ],
        visualMixTargets: buildVisualMixTargets([
          ['hero', 1, 1, 1],
          ['metric-grid', 1, 1, 1],
          ['insight-list', 1, 1, 1],
          ['comparison', 0, 1, 1],
          ['timeline', 0, 0, 1],
          ['chart', 1, 1, 2],
          ['cta', 1, 1, 1],
        ]),
      };
    case 'risk-brief':
      return {
        mustHaveModules: [...new Set(['页面摘要', '核心风险', '应答建议', ...sectionTitles.filter((item) => /风险|缺口|建议|应答/u.test(item))])],
        optionalModules: [...new Set(['风险矩阵', '证据附录'])],
        evidencePriority: [...new Set([...cardLabels.slice(0, 2), '核心风险', '应答建议'])],
        audienceTone: 'client-facing',
        riskNotes: [
          'Do not finalize if risk sections lack evidence-backed details.',
          'Keep mitigation wording concrete and bounded by matched materials.',
        ],
        visualMixTargets: buildVisualMixTargets([
          ['hero', 1, 1, 1],
          ['insight-list', 1, 1, 2],
          ['comparison', 0, 1, 1],
          ['chart', 1, 1, 1],
          ['cta', 1, 1, 1],
        ]),
      };
    case 'research-brief':
      return {
        mustHaveModules: [...new Set(['页面摘要', '核心发现', '局限与风险', '行动建议', ...sectionTitles.filter((item) => /发现|结论|局限|风险|建议/u.test(item))])],
        optionalModules: [...new Set(['方法附录', '证据附录'])],
        evidencePriority: [...new Set([...cardLabels.slice(0, 2), '核心发现', '局限与风险'])],
        audienceTone: 'analytical',
        riskNotes: [
          'Separate findings from interpretation when evidence is mixed.',
          'Make uncertainty explicit for thin or conflicting research signals.',
        ],
        visualMixTargets: buildVisualMixTargets([
          ['hero', 1, 1, 1],
          ['insight-list', 2, 2, 3],
          ['comparison', 0, 1, 1],
          ['chart', 1, 1, 2],
          ['cta', 1, 1, 1],
        ]),
      };
    case 'solution-overview':
      return {
        mustHaveModules: [...new Set(['页面摘要', '能力模块', '交付路径', '行动建议', ...sectionTitles.filter((item) => /模块|交付|建议|行动/u.test(item))])],
        optionalModules: [...new Set(['集成结构', '实施边界'])],
        evidencePriority: [...new Set([...cardLabels.slice(0, 3), '能力模块', '交付路径'])],
        audienceTone: 'client-facing',
        riskNotes: [
          'Keep module naming stable across draft and final output.',
          'If delivery path is uncertain, call out assumptions explicitly.',
        ],
        visualMixTargets: buildVisualMixTargets([
          ['hero', 1, 1, 1],
          ['metric-grid', 0, 1, 1],
          ['comparison', 1, 1, 2],
          ['timeline', 1, 1, 1],
          ['chart', 0, 1, 1],
          ['cta', 1, 1, 1],
        ]),
      };
    case 'talent-showcase':
      return {
        mustHaveModules: [...new Set(['页面摘要', '核心优势', '项目经历', '代表案例', '联系建议', ...sectionTitles.filter((item) => /优势|经历|案例|建议/u.test(item))])],
        optionalModules: [...new Set(['能力映射', '交付亮点'])],
        evidencePriority: [...new Set([...cardLabels.slice(0, 3), '核心优势', '项目经历', '代表案例'])],
        audienceTone: 'candidate-facing',
        riskNotes: [
          'Avoid generic praise without project evidence.',
          'Keep representative projects concrete enough for client evaluation.',
        ],
        visualMixTargets: buildVisualMixTargets([
          ['hero', 1, 1, 1],
          ['metric-grid', 0, 1, 1],
          ['insight-list', 1, 1, 1],
          ['timeline', 1, 1, 1],
          ['comparison', 1, 1, 1],
          ['chart', 0, 0, 0],
          ['cta', 1, 1, 1],
        ]),
      };
    default:
      return {
        mustHaveModules: [...new Set(['页面摘要', ...sectionTitles.slice(0, 4)])],
        optionalModules: [...new Set(['图表', '附录'])],
        evidencePriority: [...new Set([...cardLabels.slice(0, 3), ...sectionTitles.slice(0, 2)])],
        audienceTone: 'client-facing',
        riskNotes: ['If evidence is weak, keep the page concise and explicitly mark gaps.'],
        visualMixTargets: buildVisualMixTargets([
          ['hero', 1, 1, 1],
          ['summary', 1, 1, 3],
          ['metric-grid', 0, 1, 1],
          ['comparison', 0, 1, 1],
          ['timeline', 0, 0, 1],
          ['chart', 0, 1, 1],
          ['cta', 0, 1, 1],
        ]),
      };
  }
}
