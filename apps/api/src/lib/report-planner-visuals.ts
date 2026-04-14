import type { KnowledgeTemplateTaskHint } from './knowledge-template.js';
import { normalizeKeywordText } from './report-planner-heuristics.js';
import { inferSectionDisplayModeFromTitle } from './report-visual-intent.js';
import type {
  ReportPlanCard,
  ReportPlanChart,
  ReportPlanDatavizSlot,
  ReportPlanLayoutVariant,
  ReportPlanPageSpec,
  ReportPlanQualityTargets,
  ReportPlanSection,
  ReportPlanSectionDisplayMode,
  ReportPlanVisualMixModuleType,
  ReportPlanVisualMixTarget,
} from './report-planner.js';

function normalizeDatavizSlotKey(title: string) {
  return String(title || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'chart';
}

export function buildCardPlan(templateTaskHint: KnowledgeTemplateTaskHint | null | undefined): ReportPlanCard[] {
  switch (templateTaskHint) {
    case 'resume-comparison':
      return [
        { label: '候选人覆盖', purpose: 'Show how many candidates and profiles support the page.' },
        { label: '公司覆盖', purpose: 'Show employer breadth and business context.' },
        { label: '项目匹配', purpose: 'Highlight delivery-fit and project relevance for customer review.' },
        { label: '技能热点', purpose: 'Summarize the strongest reusable capability signals.' },
      ];
    case 'bids-static-page':
      return [
        { label: '资料覆盖', purpose: 'Show how much bid material supports the page.' },
        { label: '高风险主题', purpose: 'Surface the most important risk cluster.' },
        { label: '材料缺口', purpose: 'Call out missing materials or weak coverage.' },
        { label: '行动优先级', purpose: 'Show what should be handled first.' },
      ];
    case 'paper-static-page':
      return [
        { label: '论文数量', purpose: 'Show the volume of research evidence.' },
        { label: '研究对象', purpose: 'Summarize the dominant subject population.' },
        { label: '方法设计', purpose: 'Highlight the strongest methodology signal.' },
        { label: '核心结论', purpose: 'Surface the most decision-relevant result.' },
      ];
    case 'order-static-page':
      return [
        { label: '渠道GMV', purpose: 'Show the channel mix and where revenue concentration actually sits.' },
        { label: '动销SKU', purpose: 'Show how many SKUs are truly contributing to sell-through instead of sitting idle.' },
        { label: '高风险SKU', purpose: 'Surface SKUs with stockout, overstock, or margin pressure.' },
        { label: '库存健康', purpose: 'Summarize whether the inventory structure can safely support the next cycle.' },
        { label: '补货优先级', purpose: 'Show the most urgent replenishment or allocation actions.' },
      ];
    case 'footfall-static-page':
      return [
        { label: '总客流', purpose: 'Show the total recognized visitor volume across the matched footfall reports.' },
        { label: '商场分区数', purpose: 'Show how many mall zones are included after aggregation.' },
        { label: '头部分区', purpose: 'Surface the highest-footfall mall zone at the summary layer.' },
        { label: '展示口径', purpose: 'Make it explicit that the page stays at mall-zone level only.' },
      ];
    case 'iot-static-page':
      return [
        { label: '方案资料数', purpose: 'Show how much solution evidence is included.' },
        { label: '核心模块', purpose: 'Summarize the dominant module or system focus.' },
        { label: '接口集成', purpose: 'Highlight integration complexity and boundaries.' },
        { label: '业务价值', purpose: 'Show the clearest customer-facing value signal.' },
      ];
    default:
      return [
        { label: '资料覆盖', purpose: 'Show the evidence footprint behind the page.' },
        { label: '重点主题', purpose: 'Highlight the dominant business theme.' },
        { label: '主要类型', purpose: 'Show the dominant document shape or schema.' },
        { label: '行动建议', purpose: 'Surface the clearest next-step guidance.' },
      ];
  }
}

export function buildChartPlan(templateTaskHint: KnowledgeTemplateTaskHint | null | undefined): ReportPlanChart[] {
  switch (templateTaskHint) {
    case 'resume-comparison':
      return [
        { title: '公司覆盖分布', purpose: 'Show employer clustering and business concentration.' },
        { title: '技能热点分布', purpose: 'Show repeated capability themes.' },
      ];
    case 'bids-static-page':
      return [
        { title: '风险主题分布', purpose: 'Show the most repeated risk clusters.' },
        { title: '资料类型分布', purpose: 'Show what kind of bid evidence is actually present.' },
      ];
    case 'paper-static-page':
      return [
        { title: '研究主题分布', purpose: 'Show what the literature mainly covers.' },
        { title: '文档类型分布', purpose: 'Show evidence composition and quality shape.' },
      ];
    case 'order-static-page':
      return [
        { title: '渠道贡献结构', purpose: 'Show how business volume is distributed across marketplaces and channels.' },
        { title: 'SKU动销/库存风险矩阵', purpose: 'Show which SKUs are both important and operationally fragile.' },
        { title: '月度GMV与库存指数联动', purpose: 'Show whether growth and inventory health are moving together or drifting apart.' },
        { title: '补货优先级队列', purpose: 'Show which replenishment actions should be handled first.' },
      ];
    case 'footfall-static-page':
      return [
        { title: '商场分区客流贡献', purpose: 'Show how total footfall is distributed across mall zones.' },
        { title: '重点分区客流梯队', purpose: 'Show the relative ranking of leading mall zones without exploding floor or room detail.' },
      ];
    case 'iot-static-page':
      return [
        { title: '模块/主题分布', purpose: 'Show repeated solution modules or capability clusters.' },
        { title: '文档类型分布', purpose: 'Show the dominant evidence composition.' },
      ];
    default:
      return [
        { title: '主题热点分布', purpose: 'Show repeated themes in the matched knowledge.' },
        { title: '文档类型分布', purpose: 'Show how the evidence set is composed.' },
      ];
  }
}

function inferDatavizSlotChartType(
  templateTaskHint: KnowledgeTemplateTaskHint | null | undefined,
  title: string,
  index: number,
) {
  const normalizedTitle = normalizeKeywordText(title);
  if (/trend|monthly|month|timeline|联动|趋势|月度|同比|环比/.test(normalizedTitle)) return 'line' as const;
  if (/queue|priority|梯队|ranking|排名|top|risk|风险|补货/.test(normalizedTitle)) return 'horizontal-bar' as const;

  switch (templateTaskHint) {
    case 'resume-comparison':
      return 'horizontal-bar';
    case 'bids-static-page':
      return index === 0 ? 'horizontal-bar' : 'bar';
    case 'order-static-page':
      if (index === 2) return 'line';
      if (index === 1 || index === 3) return 'horizontal-bar';
      return 'bar';
    case 'footfall-static-page':
      return index === 0 ? 'bar' : 'horizontal-bar';
    default:
      return 'bar';
  }
}

export function buildDatavizSlotPlan(
  templateTaskHint: KnowledgeTemplateTaskHint | null | undefined,
  charts: ReportPlanChart[],
  sections: ReportPlanSection[],
): ReportPlanDatavizSlot[] {
  const sectionAnchors = sections
    .map((item) => item.title)
    .filter((title) => title && !/AI综合分析/i.test(title));

  return charts.map((chart, index) => {
    const anchoredSection = index > 0
      ? sectionAnchors[Math.min(index, Math.max(sectionAnchors.length - 1, 0))]
      : undefined;
    const preferredChartType = inferDatavizSlotChartType(templateTaskHint, chart.title, index);
    return {
      key: normalizeDatavizSlotKey(chart.title),
      title: chart.title,
      purpose: chart.purpose,
      preferredChartType,
      placement: index === 0 ? 'hero' : 'section',
      sectionTitle: index === 0 ? undefined : anchoredSection,
      evidenceFocus: anchoredSection
        ? sections.find((item) => item.title === anchoredSection)?.evidenceFocus || chart.purpose
        : chart.purpose,
      minItems: preferredChartType === 'line' ? 3 : 2,
      maxItems: preferredChartType === 'horizontal-bar' ? 8 : 6,
    };
  });
}

export function attachDatavizSlotsToSections(
  sections: ReportPlanSection[],
  datavizSlots: ReportPlanDatavizSlot[],
): ReportPlanSection[] {
  return sections.map((section) => ({
    ...section,
    datavizSlotKeys: datavizSlots
      .filter((slot) => slot.sectionTitle === section.title)
      .map((slot) => slot.key),
  }));
}

export function buildPageSpec(
  templateTaskHint: KnowledgeTemplateTaskHint | null | undefined,
  preferredLayoutVariant: ReportPlanLayoutVariant | undefined,
  cards: ReportPlanCard[],
  sections: ReportPlanSection[],
  datavizSlots: ReportPlanDatavizSlot[],
): ReportPlanPageSpec {
  const layoutVariant: ReportPlanLayoutVariant = preferredLayoutVariant
    || (
      templateTaskHint === 'resume-comparison'
        ? 'talent-showcase'
        : templateTaskHint === 'bids-static-page'
          ? 'risk-brief'
          : templateTaskHint === 'order-static-page' || templateTaskHint === 'footfall-static-page'
            ? 'operations-cockpit'
            : templateTaskHint === 'paper-static-page'
              ? 'research-brief'
              : templateTaskHint === 'iot-static-page'
                ? 'solution-overview'
                : 'insight-brief'
    );

  return {
    layoutVariant,
    heroCardLabels: cards.map((item) => item.label),
    heroDatavizSlotKeys: datavizSlots
      .filter((slot) => slot.placement === 'hero')
      .map((slot) => slot.key),
    sections: sections.map((section) => ({
      title: section.title,
      purpose: section.purpose,
      completionMode: section.completionMode,
      displayMode: section.displayMode,
      datavizSlotKeys: section.datavizSlotKeys || [],
    })),
  };
}

function inferPlannedSectionDisplayMode(title: string) {
  return inferSectionDisplayModeFromTitle(
    title,
    /建议|行动|应答|下一步/i.test(title) ? 'cta' : 'summary',
  ) as ReportPlanSectionDisplayMode;
}

export function buildSectionPurpose(title: string) {
  const displayMode = inferPlannedSectionDisplayMode(title);
  if (/AI综合分析|综合分析/i.test(title)) {
    return {
      purpose: 'Add conservative synthesis and next-step guidance after the evidence sections.',
      evidenceFocus: 'Cross-section patterns, gaps, and business implications.',
      completionMode: 'knowledge-plus-model' as const,
      displayMode,
    };
  }
  if (/建议|行动|应答|应对|补货|优先级/i.test(title)) {
    return {
      purpose: 'Turn evidence into a clear next-step recommendation.',
      evidenceFocus: 'High-confidence findings, gaps, and practical actions.',
      completionMode: 'knowledge-plus-model' as const,
      displayMode,
    };
  }
  if (/风险|缺口|异常|波动/i.test(title)) {
    return {
      purpose: 'Highlight what can block delivery, understanding, or decision-making.',
      evidenceFocus: 'Risk signals, missing evidence, and unstable areas.',
      completionMode: 'knowledge-first' as const,
      displayMode,
    };
  }
  if (/概览|概况|摘要|总览|渠道结构/i.test(title)) {
    return {
      purpose: 'Open with a clear conclusion and scope summary that a client can scan fast.',
      evidenceFocus: 'Library scope, coverage, and dominant signals.',
      completionMode: 'knowledge-plus-model' as const,
      displayMode,
    };
  }
  return {
    purpose: 'Organize the matched evidence into a stable, presentation-ready block.',
    evidenceFocus: 'Strongest matched documents, grouped dimensions, and evidence excerpts.',
    completionMode: 'knowledge-first' as const,
    displayMode,
  };
}

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
