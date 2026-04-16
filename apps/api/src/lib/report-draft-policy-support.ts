import type {
  ReportDraftModule,
  ReportDraftModuleType,
  ReportOutputRecord,
} from './report-center.js';
import type { ReportPlanDatavizSlot, ReportPlanVisualMixTarget } from './report-planner.js';
import { inferSectionModuleType } from './report-visual-intent.js';
import { normalizeText } from './report-draft-copy-polish.js';
import type { DraftComposerPolicy, ResolvedDraftComposerTargets } from './report-draft-policy-types.js';

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
