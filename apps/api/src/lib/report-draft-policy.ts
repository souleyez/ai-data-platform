import type {
  ReportDraftModule,
  ReportDraftModuleType,
  ReportOutputRecord,
} from './report-center.js';
import type { ReportPlanDatavizSlot, ReportPlanVisualMixTarget } from './report-planner.js';
import { inferSectionModuleType } from './report-visual-intent.js';
import { normalizeText } from './report-draft-copy-polish.js';

export type DraftComposerPolicy = {
  audienceTone: string;
  minCounts: Partial<Record<ReportDraftModuleType, number>>;
  maxCounts?: Partial<Record<ReportDraftModuleType, number>>;
  preferredOrder: ReportDraftModuleType[];
  placeholderTitles?: Partial<Record<ReportDraftModuleType, string>>;
  semanticMustHaveTitles?: string[];
  evidencePriorityTitles?: string[];
  evidenceRequiredTypes?: ReportDraftModuleType[];
  overflowTargetTypes?: Partial<Record<ReportDraftModuleType, ReportDraftModuleType>>;
};

export const DRAFT_COMPOSER_POLICIES: Partial<Record<
  'operations-cockpit' | 'risk-brief' | 'research-brief' | 'solution-overview' | 'talent-showcase',
  DraftComposerPolicy
>> = {
  'operations-cockpit': {
    audienceTone: 'operator-facing',
    minCounts: {
      hero: 1,
      'metric-grid': 1,
      'insight-list': 1,
      chart: 1,
      cta: 1,
    },
    maxCounts: {
      hero: 1,
      'metric-grid': 1,
      'insight-list': 1,
      comparison: 1,
      timeline: 1,
      chart: 2,
      cta: 1,
    },
    preferredOrder: ['hero', 'metric-grid', 'insight-list', 'comparison', 'timeline', 'chart', 'appendix', 'cta'],
    placeholderTitles: {
      cta: '行动建议',
      chart: '关键趋势图',
    },
    semanticMustHaveTitles: ['页面摘要', '关键指标', '风险提醒', '行动建议'],
    evidencePriorityTitles: ['关键指标', '风险提醒', '行动建议'],
    evidenceRequiredTypes: ['metric-grid', 'chart', 'comparison'],
    overflowTargetTypes: {
      chart: 'comparison',
      comparison: 'summary',
      timeline: 'summary',
      'insight-list': 'summary',
    },
  },
  'risk-brief': {
    audienceTone: 'client-facing',
    minCounts: {
      hero: 1,
      'insight-list': 1,
      chart: 1,
      cta: 1,
    },
    maxCounts: {
      hero: 1,
      'insight-list': 2,
      comparison: 1,
      chart: 1,
      cta: 1,
    },
    preferredOrder: ['hero', 'insight-list', 'comparison', 'chart', 'appendix', 'cta'],
    placeholderTitles: {
      'insight-list': '核心风险',
      cta: '应答建议',
    },
    semanticMustHaveTitles: ['页面摘要', '资格风险', '应答建议'],
    evidencePriorityTitles: ['资格风险', '应答建议'],
    evidenceRequiredTypes: ['insight-list', 'comparison', 'chart'],
    overflowTargetTypes: {
      chart: 'appendix',
      comparison: 'appendix',
      'insight-list': 'summary',
    },
  },
  'research-brief': {
    audienceTone: 'analytical',
    minCounts: {
      hero: 1,
      'insight-list': 2,
      chart: 1,
      cta: 1,
    },
    maxCounts: {
      hero: 1,
      'insight-list': 3,
      comparison: 1,
      chart: 2,
      cta: 1,
    },
    preferredOrder: ['hero', 'insight-list', 'comparison', 'chart', 'appendix', 'cta'],
    placeholderTitles: {
      'insight-list': '核心发现',
      cta: '研究建议',
    },
    semanticMustHaveTitles: ['页面摘要', '核心发现', '局限与风险', '行动建议'],
    evidencePriorityTitles: ['核心发现', '局限与风险'],
    evidenceRequiredTypes: ['insight-list', 'comparison', 'chart'],
    overflowTargetTypes: {
      chart: 'appendix',
      comparison: 'appendix',
      'insight-list': 'summary',
    },
  },
  'solution-overview': {
    audienceTone: 'client-facing',
    minCounts: {
      hero: 1,
      comparison: 1,
      timeline: 1,
      chart: 1,
      cta: 1,
    },
    maxCounts: {
      hero: 1,
      'metric-grid': 1,
      comparison: 2,
      timeline: 1,
      chart: 1,
      'insight-list': 1,
      cta: 1,
    },
    preferredOrder: ['hero', 'metric-grid', 'comparison', 'timeline', 'chart', 'appendix', 'cta'],
    placeholderTitles: {
      comparison: '能力模块',
      timeline: '交付路径',
      cta: '行动建议',
    },
    semanticMustHaveTitles: ['页面摘要', '能力模块', '交付路径', '行动建议'],
    evidencePriorityTitles: ['能力模块', '交付路径', '行动建议'],
    evidenceRequiredTypes: ['comparison', 'timeline', 'chart'],
    overflowTargetTypes: {
      chart: 'comparison',
      timeline: 'summary',
      comparison: 'appendix',
      'insight-list': 'summary',
    },
  },
  'talent-showcase': {
    audienceTone: 'candidate-facing',
    minCounts: {
      hero: 1,
      'insight-list': 1,
      timeline: 1,
      comparison: 1,
      cta: 1,
    },
    maxCounts: {
      hero: 1,
      'metric-grid': 1,
      'insight-list': 1,
      timeline: 1,
      comparison: 1,
      chart: 0,
      cta: 1,
    },
    preferredOrder: ['hero', 'metric-grid', 'insight-list', 'timeline', 'comparison', 'appendix', 'cta'],
    placeholderTitles: {
      timeline: '项目经历',
      comparison: '代表案例',
      cta: '联系建议',
    },
    semanticMustHaveTitles: ['页面摘要', '核心优势', '项目经历', '代表案例', '联系建议'],
    evidencePriorityTitles: ['核心优势', '项目经历', '代表案例'],
    evidenceRequiredTypes: ['timeline', 'comparison', 'metric-grid'],
    overflowTargetTypes: {
      chart: 'comparison',
      comparison: 'appendix',
      timeline: 'summary',
      'insight-list': 'summary',
    },
  },
};

export function normalizeSlotKey(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeDraftChartType(value: unknown): ReportPlanDatavizSlot['preferredChartType'] | undefined {
  if (value === 'horizontal-bar' || value === 'line' || value === 'bar') return value;
  return undefined;
}

export type ResolvedDraftComposerTargets = {
  mustHaveTitles: string[];
  optionalTitles: string[];
  evidencePriorityTitles: string[];
  audienceTone: string;
  riskNotes: string[];
  visualMixTargets: ReportPlanVisualMixTarget[];
};

export function mergeOrderedTitles(...lists: Array<Array<string> | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of lists) {
    for (const item of list || []) {
      const normalized = normalizeText(item);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}

function titleMatchesModule(module: ReportDraftModule, desiredTitle: string) {
  const moduleTitle = normalizeText(module.title);
  const normalizedDesired = normalizeText(desiredTitle);
  if (!moduleTitle || !normalizedDesired) return false;
  return moduleTitle === normalizedDesired
    || moduleTitle.includes(normalizedDesired)
    || normalizedDesired.includes(moduleTitle);
}

function inferSemanticTargetModuleType(
  title: string,
  fallbackModuleType: ReportDraftModuleType = 'summary',
): ReportDraftModuleType {
  const normalized = normalizeText(title).toLowerCase();
  if (!normalized) return fallbackModuleType;
  if (/(指标|kpi|metric|score|数据点|收益指标|核心数据|经营数据)/.test(normalized)) return 'metric-grid';
  if (/(趋势|走势|波动|变化|曲线|chart|图示|图表)/.test(normalized)) return 'chart';
  if (/(时间线|路径|里程碑|交付|实施|上线|项目经历|阶段|roadmap|timeline)/.test(normalized)) return 'timeline';
  if (/(行动|建议|下一步|应答|联系|cta|next step)/.test(normalized)) return 'cta';
  if (/(风险|异常|问题|预警|提醒|亮点|发现|insight|risk)/.test(normalized)) return 'insight-list';
  if (/(对比|结构|分布|能力|模块|案例|收益|价值|回报|影响|覆盖|portfolio|comparison)/.test(normalized)) return 'comparison';
  if (/(附录|证据|来源|appendix|evidence|reference)/.test(normalized)) return 'appendix';
  return inferSectionModuleType({
    title,
    fallbackModuleType,
  });
}

function retargetModuleType(
  module: ReportDraftModule,
  targetType: ReportDraftModuleType,
  desiredTitle: string,
): ReportDraftModule {
  if (module.moduleType === targetType) {
    if (normalizeText(module.title) === normalizeText(desiredTitle)) return module;
    return {
      ...module,
      title: desiredTitle,
    };
  }

  if (targetType === 'chart') {
    return {
      ...module,
      moduleType: 'chart',
      layoutType: 'chart',
      title: desiredTitle,
      contentDraft: '',
      bullets: [],
      cards: [],
      chartIntent: module.chartIntent || {
        title: desiredTitle,
        preferredChartType: 'bar',
        items: [],
      },
    };
  }

  if (targetType === 'metric-grid') {
    return {
      ...module,
      moduleType: 'metric-grid',
      layoutType: 'metric-grid',
      title: desiredTitle,
      chartIntent: null,
      bullets: [],
      cards: Array.isArray(module.cards) ? module.cards : [],
    };
  }

  return {
    ...module,
    moduleType: targetType,
    layoutType: targetType,
    title: desiredTitle,
    chartIntent: null,
    cards: [],
  };
}

export function resolveDraftComposerTargets(
  record: ReportOutputRecord,
  policy: DraftComposerPolicy | undefined,
): ResolvedDraftComposerTargets {
  const fallbackVisualMixTargets = policy
    ? (Object.entries(policy.minCounts) as Array<[ReportDraftModuleType, number]>)
        .map(([moduleType, minCount]) => ({
          moduleType,
          minCount,
          targetCount: minCount,
          maxCount: policy.maxCounts?.[moduleType] ?? Math.max(minCount, 1),
        }))
    : [];
  return {
    mustHaveTitles: mergeOrderedTitles(
      record.dynamicSource?.planMustHaveModules,
      policy?.semanticMustHaveTitles,
    ),
    optionalTitles: mergeOrderedTitles(
      record.dynamicSource?.planOptionalModules,
    ),
    evidencePriorityTitles: mergeOrderedTitles(
      record.dynamicSource?.planEvidencePriority,
      policy?.evidencePriorityTitles,
      record.dynamicSource?.planCardLabels,
      record.dynamicSource?.planChartTitles,
    ),
    audienceTone: normalizeText(record.dynamicSource?.planAudienceTone)
      || normalizeText(policy?.audienceTone)
      || 'client-facing',
    riskNotes: mergeOrderedTitles(
      record.dynamicSource?.planRiskNotes,
    ),
    visualMixTargets: Array.isArray(record.dynamicSource?.planVisualMixTargets) && record.dynamicSource.planVisualMixTargets.length
      ? record.dynamicSource.planVisualMixTargets
      : fallbackVisualMixTargets,
  };
}

export function applyVisualMixTargetsToPolicy(
  policy: DraftComposerPolicy | undefined,
  visualMixTargets: ReportPlanVisualMixTarget[],
): DraftComposerPolicy | undefined {
  if (!policy && !visualMixTargets.length) return policy;
  const basePolicy: DraftComposerPolicy = policy
    ? {
        ...policy,
        minCounts: { ...policy.minCounts },
        maxCounts: { ...(policy.maxCounts || {}) },
      }
    : {
        audienceTone: 'client-facing',
        minCounts: {},
        maxCounts: {},
        preferredOrder: ['hero', 'summary', 'metric-grid', 'insight-list', 'comparison', 'timeline', 'chart', 'appendix', 'cta'],
      };
  for (const target of visualMixTargets) {
    if (!target?.moduleType) continue;
    const minCount = Number(target.minCount || 0);
    const maxCount = Number(target.maxCount || 0);
    basePolicy.minCounts[target.moduleType as ReportDraftModuleType] = Math.max(
      Number(basePolicy.minCounts[target.moduleType as ReportDraftModuleType] || 0),
      minCount,
    );
    if (!basePolicy.maxCounts) basePolicy.maxCounts = {};
    basePolicy.maxCounts[target.moduleType as ReportDraftModuleType] = maxCount > 0
      ? maxCount
      : Number(basePolicy.maxCounts[target.moduleType as ReportDraftModuleType] || 0);
  }
  return basePolicy;
}

export function applySemanticDraftTargets(
  modules: ReportDraftModule[],
  record: ReportOutputRecord,
  targets: ResolvedDraftComposerTargets,
  buildPlaceholderModule: (
    moduleType: ReportDraftModuleType,
    title: string,
    summary: string,
    order: number,
  ) => ReportDraftModule,
) {
  const working = [...modules];
  const prioritizedTitles = mergeOrderedTitles(targets.mustHaveTitles, targets.evidencePriorityTitles);

  for (const desiredTitle of prioritizedTitles) {
    const matchIndex = working.findIndex((module) => titleMatchesModule(module, desiredTitle));
    if (matchIndex >= 0) {
      const targetType = inferSemanticTargetModuleType(desiredTitle, working[matchIndex].moduleType);
      working[matchIndex] = retargetModuleType(working[matchIndex], targetType, desiredTitle);
      continue;
    }
    const targetType = inferSemanticTargetModuleType(desiredTitle);
    if (!targets.mustHaveTitles.some((item) => normalizeText(item) === desiredTitle)) continue;
    working.push(
      buildPlaceholderModule(
        targetType,
        desiredTitle,
        normalizeText(record.page?.summary),
        working.length,
      ),
    );
  }

  return working;
}
