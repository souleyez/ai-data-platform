import type {
  ReportDraftModule,
  ReportDraftModuleType,
  ReportOutputDraft,
  ReportOutputRecord,
  ReportVisualStylePreset,
} from './report-center.js';
import {
  normalizeText,
  polishDraftModules,
} from './report-draft-copy-polish.js';
import type { DraftPolishContext } from './report-draft-copy-polish.js';
import {
  buildOperationsCockpitModules,
  buildPlaceholderModule,
  buildResearchBriefModules,
  buildRiskBriefModules,
  buildSolutionOverviewModules,
  buildTalentShowcaseModules,
} from './report-draft-module-builders.js';
import {
  applySemanticDraftTargets,
  applyVisualMixTargetsToPolicy,
  DRAFT_COMPOSER_POLICIES,
  mergeOrderedTitles,
  resolveDraftComposerTargets,
} from './report-draft-policy.js';
import type { DraftComposerPolicy } from './report-draft-policy.js';
import {
  isOperationsCockpitRecord,
  isResearchBriefRecord,
  isRiskBriefRecord,
  isSolutionOverviewRecord,
  isTalentShowcaseRecord,
  resolveRecordLayoutVariant,
} from './report-draft-scenarios.js';

function applyDraftComposerPolicy(
  modules: ReportDraftModule[],
  record: ReportOutputRecord,
  policy: DraftComposerPolicy | undefined,
) {
  if (!policy) return modules;

  const working = [...modules];
  const typeCounts = new Map<ReportDraftModuleType, number>();
  for (const module of working) {
    typeCounts.set(module.moduleType, (typeCounts.get(module.moduleType) || 0) + 1);
  }

  for (const [moduleType, minCount] of Object.entries(policy.minCounts) as Array<[ReportDraftModuleType, number]>) {
    const currentCount = typeCounts.get(moduleType) || 0;
    for (let index = currentCount; index < minCount; index += 1) {
      const placeholderTitle = policy.placeholderTitles?.[moduleType] || `${moduleType}-${index + 1}`;
      working.push(
        buildPlaceholderModule(
          moduleType,
          placeholderTitle,
          normalizeText(record.page?.summary),
          working.length,
        ),
      );
    }
  }

  const orderIndex = new Map(policy.preferredOrder.map((item, index) => [item, index]));
  const sorted = working
    .map((module, index) => ({ module, index }))
    .sort((left, right) => {
      const leftOrder = orderIndex.get(left.module.moduleType) ?? policy.preferredOrder.length;
      const rightOrder = orderIndex.get(right.module.moduleType) ?? policy.preferredOrder.length;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.index - right.index;
    })
    .map(({ module }, index) => ({
      ...module,
      order: index,
    }));

  const maxCounts = policy.maxCounts || {};
  const overflowTargetTypes = policy.overflowTargetTypes || {};
  const counts = new Map<ReportDraftModuleType, number>();
  return sorted.map((module) => {
    const nextCount = (counts.get(module.moduleType) || 0) + 1;
    counts.set(module.moduleType, nextCount);
    const maxCount = maxCounts[module.moduleType];
    if (typeof maxCount !== 'number' || nextCount <= maxCount) {
      return module;
    }

    const targetType = overflowTargetTypes[module.moduleType] || 'appendix';
    const overflowBullets = module.moduleType === 'chart'
      ? (module.chartIntent?.items || []).map((item) => `${normalizeText(item?.label)}：${item?.value ?? 0}`).filter(Boolean)
      : module.bullets;
    return {
      ...module,
      moduleType: targetType,
      layoutType: targetType,
      contentDraft: module.contentDraft || module.purpose || normalizeText(record.page?.summary),
      bullets: Array.isArray(overflowBullets) ? overflowBullets.filter(Boolean).slice(0, 6) : [],
      chartIntent: targetType === 'chart' ? module.chartIntent : null,
      cards: targetType === 'metric-grid' ? module.cards : [],
      title: module.title || `${targetType}-${module.order + 1}`,
    };
  });
}

function resolveSemanticMustHaveModules(modules: ReportDraftModule[], semanticMustHaveTitles: string[] | undefined) {
  const desiredTitles = Array.isArray(semanticMustHaveTitles)
    ? semanticMustHaveTitles.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  if (!desiredTitles.length) return [];

  const usedModuleIds = new Set<string>();
  const matchedTitles: string[] = [];
  for (const desiredTitle of desiredTitles) {
    const exactMatch = modules.find((item) => !usedModuleIds.has(item.moduleId) && normalizeText(item.title) === desiredTitle);
    const partialMatch = exactMatch
      || modules.find((item) => !usedModuleIds.has(item.moduleId) && normalizeText(item.title).includes(desiredTitle));
    if (!partialMatch) continue;
    usedModuleIds.add(partialMatch.moduleId);
    if (normalizeText(partialMatch.title)) matchedTitles.push(normalizeText(partialMatch.title));
  }
  return matchedTitles;
}

function resolveSemanticPriorityModules(modules: ReportDraftModule[], desiredTitles: string[] | undefined) {
  const normalizedTitles = Array.isArray(desiredTitles)
    ? desiredTitles.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  if (!normalizedTitles.length) return [];

  const matched = new Set<string>();
  for (const desiredTitle of normalizedTitles) {
    const module = modules.find((item) => normalizeText(item.title) === desiredTitle)
      || modules.find((item) => normalizeText(item.title).includes(desiredTitle));
    if (module?.title) matched.add(normalizeText(module.title));
  }
  return Array.from(matched);
}

export function buildSpecializedDraftForRecord(
  record: ReportOutputRecord,
  fallbackVisualStyle: ReportVisualStylePreset,
): ReportOutputDraft | null {
  if (!(record.kind === 'page' && record.page)) return null;

  let modules: ReportDraftModule[] = [];
  let layoutVariant = resolveRecordLayoutVariant(record);
  let policy: DraftComposerPolicy | undefined;
  if (layoutVariant === 'operations-cockpit' || isOperationsCockpitRecord(record)) {
    modules = buildOperationsCockpitModules(record);
    layoutVariant = 'operations-cockpit';
    policy = DRAFT_COMPOSER_POLICIES['operations-cockpit'];
  } else if (layoutVariant === 'solution-overview' || isSolutionOverviewRecord(record)) {
    modules = buildSolutionOverviewModules(record);
    layoutVariant = 'solution-overview';
    policy = DRAFT_COMPOSER_POLICIES['solution-overview'];
  } else if (layoutVariant === 'risk-brief' || isRiskBriefRecord(record)) {
    modules = buildRiskBriefModules(record);
    layoutVariant = 'risk-brief';
    policy = DRAFT_COMPOSER_POLICIES['risk-brief'];
  } else if (layoutVariant === 'research-brief' || isResearchBriefRecord(record)) {
    modules = buildResearchBriefModules(record);
    layoutVariant = 'research-brief';
    policy = DRAFT_COMPOSER_POLICIES['research-brief'];
  } else if (layoutVariant === 'talent-showcase' || isTalentShowcaseRecord(record)) {
    modules = buildTalentShowcaseModules(record);
    layoutVariant = 'talent-showcase';
    policy = DRAFT_COMPOSER_POLICIES['talent-showcase'];
  }
  if (!modules.length) return null;

  const targets = resolveDraftComposerTargets(record, policy);
  const effectivePolicy = applyVisualMixTargetsToPolicy(policy, targets.visualMixTargets);
  const semanticModules = applySemanticDraftTargets(modules, record, targets, buildPlaceholderModule);
  const policyModules = applyDraftComposerPolicy(semanticModules, record, effectivePolicy);
  const polishedModules = polishDraftModules(policyModules, {
    layoutVariant: (layoutVariant || 'insight-brief') as DraftPolishContext['layoutVariant'],
    audienceTone: targets.audienceTone || 'client-facing',
    summary: normalizeText(record.page?.summary),
    metricLabels: Array.isArray(record.page?.cards)
      ? record.page.cards.map((item) => normalizeText(item?.label)).filter(Boolean)
      : [],
  });

  const orderedTitles = polishedModules.map((item) => item.title).filter(Boolean);
  const chartTitles = polishedModules
    .filter((item) => item.moduleType === 'chart')
    .map((item) => item.title)
    .filter(Boolean);
  const typeDrivenEvidencePriority = effectivePolicy
    ? (effectivePolicy.evidenceRequiredTypes || [])
      .flatMap((moduleType) => polishedModules.filter((item) => item.moduleType === moduleType).map((item) => item.title))
      .filter(Boolean)
    : [];
  const semanticEvidencePriority = resolveSemanticPriorityModules(polishedModules, targets.evidencePriorityTitles);
  const riskNotes = mergeOrderedTitles(
    targets.riskNotes,
    polishedModules
      .filter((item) => item.moduleType === 'insight-list' && /风险|异常|波动|问题|预警/.test(normalizeText(item.title)))
      .flatMap((item) => item.bullets || [])
      .filter(Boolean)
      .slice(0, 5),
  ).slice(0, 5);
  const semanticMustHaveModules = resolveSemanticMustHaveModules(polishedModules, targets.mustHaveTitles);
  const typeDrivenMustHaveModules = effectivePolicy
    ? (Object.entries(effectivePolicy.minCounts) as Array<[ReportDraftModuleType, number]>)
      .flatMap(([moduleType, minCount]) => {
        const typedModules = polishedModules.filter((item) => item.moduleType === moduleType).slice(0, minCount);
        return typedModules.map((item) => item.title).filter(Boolean);
      })
    : orderedTitles.filter((title) => /摘要|指标|行动|建议|概览|风险|结论|发现/.test(title)).slice(0, 8);
  const mustHaveModules = mergeOrderedTitles(
    semanticMustHaveModules,
    typeDrivenMustHaveModules,
  );
  const optionalModules = mergeOrderedTitles(
    targets.optionalTitles,
    orderedTitles.filter((title) => !mustHaveModules.includes(title)),
  ).filter((title) => !mustHaveModules.includes(title));

  return {
    reviewStatus: 'draft_generated',
    version: 1,
    modules: polishedModules,
    lastEditedAt: record.createdAt,
    approvedAt: '',
    audience: normalizeText(record.dynamicSource?.planAudience) || 'client',
    objective: normalizeText(record.dynamicSource?.planObjective) || normalizeText(record.page?.summary) || 'Create a client-readable page draft from current project evidence.',
    layoutVariant: (layoutVariant || 'insight-brief') as ReportOutputDraft['layoutVariant'],
    visualStyle: record.page?.visualStyle || fallbackVisualStyle,
    mustHaveModules: mustHaveModules.slice(0, 8),
    optionalModules: optionalModules.slice(0, 8),
    evidencePriority: mergeOrderedTitles(
      semanticEvidencePriority,
      typeDrivenEvidencePriority,
      chartTitles,
    ).slice(0, 8),
    audienceTone: targets.audienceTone || 'client-facing',
    riskNotes,
    visualMixTargets: targets.visualMixTargets.slice(0, 10).map((item) => ({
      moduleType: item.moduleType,
      minCount: Number(item.minCount || 0),
      targetCount: Number(item.targetCount || 0),
      maxCount: Number(item.maxCount || 0),
    })),
  };
}
