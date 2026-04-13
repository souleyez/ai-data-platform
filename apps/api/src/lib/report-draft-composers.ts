import type {
  ReportDraftModule,
  ReportDraftModuleType,
  ReportOutputDraft,
  ReportOutputRecord,
  ReportVisualStylePreset,
} from './report-center.js';
import type { ReportPlanDatavizSlot, ReportPlanLayoutVariant } from './report-planner.js';
import {
  buildSupplementalVisualModule,
} from './report-visual-intent.js';
import {
  normalizeText,
  polishDraftModules,
} from './report-draft-copy-polish.js';
import type { DraftPolishContext } from './report-draft-copy-polish.js';
import {
  applySemanticDraftTargets,
  applyVisualMixTargetsToPolicy,
  DRAFT_COMPOSER_POLICIES,
  mergeOrderedTitles,
  normalizeDraftChartType,
  normalizeSlotKey,
  resolveDraftComposerTargets,
} from './report-draft-policy.js';
import type {
  DraftComposerPolicy,
  ResolvedDraftComposerTargets,
} from './report-draft-policy.js';
import {
  classifyResearchSectionType,
  classifyRiskSectionType,
  classifySectionType,
  classifySolutionSectionType,
  classifyTalentSectionType,
  isOperationsCockpitRecord,
  isResearchBriefRecord,
  isRiskBriefRecord,
  isSolutionOverviewRecord,
  isTalentShowcaseRecord,
  resolveRecordLayoutVariant,
} from './report-draft-scenarios.js';

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPlaceholderModule(
  moduleType: ReportDraftModuleType,
  title: string,
  summary: string,
  order: number,
): ReportDraftModule {
  const normalizedSummary = normalizeText(summary);
  if (moduleType === 'chart') {
    return {
      moduleId: buildId('draftmod'),
      moduleType,
      title,
      purpose: 'Reserve a visual slot so the final page keeps a stable chart position.',
      contentDraft: '',
      evidenceRefs: ['composer:placeholder'],
      chartIntent: {
        title,
        preferredChartType: 'bar',
        items: [],
      },
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      order,
      layoutType: 'chart',
    };
  }

  if (moduleType === 'metric-grid') {
    return {
      moduleId: buildId('draftmod'),
      moduleType,
      title,
      purpose: 'Reserve a compact metric cluster for final review.',
      contentDraft: `${normalizeText(title) || '当前指标模块'} 当前仍待补充确认后的关键数据，终稿前替换为可直接展示的指标卡。`,
      evidenceRefs: ['composer:placeholder'],
      chartIntent: null,
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      order,
      layoutType: 'metric-grid',
    };
  }

  return {
    moduleId: buildId('draftmod'),
      moduleType,
      title,
      purpose: 'Reserve a scenario-critical module so the draft structure stays editable before finalization.',
    contentDraft: normalizedSummary,
      evidenceRefs: ['composer:placeholder'],
      chartIntent: null,
      cards: [],
    bullets: normalizedSummary ? [normalizedSummary] : [],
    enabled: true,
    status: 'generated',
    order,
    layoutType: moduleType,
  };
}

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
      const placeholderTitle =
        policy.placeholderTitles?.[moduleType]
        || `${moduleType}-${index + 1}`;
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

function buildChartIntent(
  chart: NonNullable<NonNullable<ReportOutputRecord['page']>['charts']>[number] | null | undefined,
  slot: ReportPlanDatavizSlot | null | undefined,
) {
  if (!chart && !slot) return null;
  return {
    title: normalizeText(chart?.title || slot?.title || ''),
    preferredChartType: normalizeDraftChartType(chart?.render?.chartType) || slot?.preferredChartType || 'bar',
    items: Array.isArray(chart?.items) ? chart.items : [],
  };
}

function buildOperationsCockpitModules(record: ReportOutputRecord): ReportDraftModule[] {
  if (!record.page) return [];
  const page = record.page;
  const modules: ReportDraftModule[] = [];
  const sectionSpecs = Array.isArray(page.pageSpec?.sections) ? page.pageSpec.sections : [];
  const sectionSpecByTitle = new Map(
    sectionSpecs
      .map((item) => [normalizeText(item.title), item] as const)
      .filter(([title]) => title),
  );
  const slots = Array.isArray(page.datavizSlots) ? page.datavizSlots : [];
  const slotByTitle = new Map(
    slots
      .map((item) => [normalizeText(item.title), item] as const)
      .filter(([title]) => title),
  );
  const chartByTitle = new Map(
    (page.charts || [])
      .map((item) => [normalizeText(item?.title), item] as const)
      .filter(([title]) => title),
  );

  let order = 0;
  const pushModule = (module: Omit<ReportDraftModule, 'moduleId' | 'order'>) => {
    modules.push({
      moduleId: buildId('draftmod'),
      order: order++,
      ...module,
    });
  };

  if (normalizeText(page.summary)) {
    pushModule({
      moduleType: 'hero',
      title: '页面摘要',
      purpose: normalizeText(record.dynamicSource?.planObjective) || 'Open with the current operating picture first.',
      contentDraft: normalizeText(page.summary),
      evidenceRefs: ['page.summary'],
      chartIntent: null,
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      layoutType: 'hero',
    });
  }

  if (Array.isArray(page.cards) && page.cards.length) {
    pushModule({
      moduleType: 'metric-grid',
      title: '关键指标',
      purpose: 'Anchor the page with the most important operating metrics first.',
      contentDraft: '',
      evidenceRefs: ['page.cards'],
      chartIntent: null,
      cards: page.cards,
      bullets: [],
      enabled: true,
      status: 'generated',
      layoutType: 'metric-grid',
    });
  }

  const consumedCharts = new Set<string>();
  for (const section of page.sections || []) {
    const title = normalizeText(section?.title) || '内容模块';
    const bullets = Array.isArray(section?.bullets) ? section.bullets.filter(Boolean) : [];
    const sectionBody = normalizeText(section?.body);
    const sectionType = classifySectionType(title, sectionBody, bullets, bullets.length > 0);
    pushModule({
      moduleType: sectionType,
      title,
      purpose: normalizeText(sectionSpecByTitle.get(title)?.purpose),
      contentDraft: sectionBody,
      evidenceRefs: [`section:${title}`],
      chartIntent: null,
      cards: [],
      bullets,
      enabled: true,
      status: 'generated',
      layoutType: sectionType,
    });

    const boundCharts = (sectionSpecByTitle.get(title)?.datavizSlotKeys || [])
      .map((slotKey) => {
        const normalizedSlotKey = normalizeSlotKey(slotKey);
        const slot = slots.find((entry) => normalizeSlotKey(entry?.key || '') === normalizedSlotKey) || null;
        if (!slot) return null;
        const chart = chartByTitle.get(normalizeText(slot.title)) || null;
        return chart || slot ? { chart, slot } : null;
      })
      .filter(Boolean) as Array<{ chart: NonNullable<NonNullable<ReportOutputRecord['page']>['charts']>[number] | null; slot: ReportPlanDatavizSlot | null }>;

    for (const entry of boundCharts) {
      const chartTitle = normalizeText(entry.chart?.title || entry.slot?.title);
      if (!chartTitle || consumedCharts.has(chartTitle)) continue;
      consumedCharts.add(chartTitle);
      pushModule({
        moduleType: 'chart',
        title: chartTitle,
        purpose: normalizeText(entry.slot?.purpose),
        contentDraft: '',
        evidenceRefs: [`chart:${chartTitle}`],
        chartIntent: buildChartIntent(entry.chart, entry.slot),
        cards: [],
        bullets: [],
        enabled: true,
        status: 'generated',
        layoutType: 'chart',
      });
    }

    if (!boundCharts.length) {
      const supplementalModule = buildSupplementalVisualModule({
        title,
        body: sectionBody,
        bullets,
        fallbackModuleType: sectionType,
      });
      if (supplementalModule) {
        pushModule({
          ...supplementalModule,
          evidenceRefs: [`section:${title}`, `supplemental:${supplementalModule.moduleType}`],
          contentDraft: '',
          bullets: [],
          enabled: true,
          status: 'generated',
        });
      }
    }
  }

  for (const chart of page.charts || []) {
    const chartTitle = normalizeText(chart?.title) || '图表模块';
    if (consumedCharts.has(chartTitle)) continue;
    const slot = slotByTitle.get(chartTitle) || null;
    pushModule({
      moduleType: 'chart',
      title: chartTitle,
      purpose: normalizeText(slot?.purpose),
      contentDraft: '',
      evidenceRefs: [`chart:${chartTitle}`],
      chartIntent: buildChartIntent(chart, slot),
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      layoutType: 'chart',
    });
  }

  return modules;
}

function buildSequentialSectionModules(
  record: ReportOutputRecord,
  classifyModuleType: (title: string, body: string, bullets: string[], hasBullets: boolean) => ReportDraftModuleType,
) {
  if (!record.page) return [];
  const page = record.page;
  const modules: ReportDraftModule[] = [];
  const sectionSpecs = Array.isArray(page.pageSpec?.sections) ? page.pageSpec.sections : [];
  const sectionSpecByTitle = new Map(
    sectionSpecs
      .map((item) => [normalizeText(item.title), item] as const)
      .filter(([title]) => title),
  );
  const slots = Array.isArray(page.datavizSlots) ? page.datavizSlots : [];
  const slotByKey = new Map(
    slots
      .map((item) => [normalizeSlotKey(item?.key || ''), item] as const)
      .filter(([key]) => key),
  );
  const chartByTitle = new Map(
    (page.charts || [])
      .map((item) => [normalizeText(item?.title), item] as const)
      .filter(([title]) => title),
  );
  const consumedCharts = new Set<string>();
  let order = 0;

  const pushModule = (module: Omit<ReportDraftModule, 'moduleId' | 'order'>) => {
    modules.push({
      moduleId: buildId('draftmod'),
      order: order++,
      ...module,
    });
  };

  if (normalizeText(page.summary)) {
    pushModule({
      moduleType: 'hero',
      title: '页面摘要',
      purpose: normalizeText(record.dynamicSource?.planObjective) || 'Open with the strongest summary first.',
      contentDraft: normalizeText(page.summary),
      evidenceRefs: ['page.summary'],
      chartIntent: null,
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      layoutType: 'hero',
    });
  }

  if (Array.isArray(page.cards) && page.cards.length) {
    pushModule({
      moduleType: 'metric-grid',
      title: '关键指标',
      purpose: 'Anchor the page with a small set of high-signal metrics.',
      contentDraft: '',
      evidenceRefs: ['page.cards'],
      chartIntent: null,
      cards: page.cards,
      bullets: [],
      enabled: true,
      status: 'generated',
      layoutType: 'metric-grid',
    });
  }

  for (const section of page.sections || []) {
    const title = normalizeText(section?.title) || '内容模块';
    const body = normalizeText(section?.body);
    const bullets = Array.isArray(section?.bullets) ? section.bullets.filter(Boolean) : [];
    const moduleType = classifyModuleType(title, body, bullets, bullets.length > 0);
    pushModule({
      moduleType,
      title,
      purpose: normalizeText(sectionSpecByTitle.get(title)?.purpose),
      contentDraft: body,
      evidenceRefs: [`section:${title}`],
      chartIntent: null,
      cards: [],
      bullets,
      enabled: true,
      status: 'generated',
      layoutType: moduleType,
    });

    const sectionSlots = (sectionSpecByTitle.get(title)?.datavizSlotKeys || [])
      .map((slotKey) => slotByKey.get(normalizeSlotKey(slotKey)) || null)
      .filter(Boolean) as ReportPlanDatavizSlot[];

    for (const slot of sectionSlots) {
      const chartTitle = normalizeText(slot.title);
      if (!chartTitle || consumedCharts.has(chartTitle)) continue;
      consumedCharts.add(chartTitle);
      pushModule({
        moduleType: 'chart',
        title: chartTitle,
        purpose: normalizeText(slot.purpose),
        contentDraft: '',
        evidenceRefs: [`chart:${chartTitle}`],
        chartIntent: buildChartIntent(chartByTitle.get(chartTitle) || null, slot),
        cards: [],
        bullets: [],
        enabled: true,
        status: 'generated',
        layoutType: 'chart',
      });
    }

    if (!sectionSlots.length) {
      const supplementalModule = buildSupplementalVisualModule({
        title,
        body,
        bullets,
        fallbackModuleType: moduleType,
      });
      if (supplementalModule) {
        pushModule({
          ...supplementalModule,
          evidenceRefs: [`section:${title}`, `supplemental:${supplementalModule.moduleType}`],
          contentDraft: '',
          bullets: [],
          enabled: true,
          status: 'generated',
        });
      }
    }
  }

  for (const chart of page.charts || []) {
    const chartTitle = normalizeText(chart?.title) || '图表模块';
    if (consumedCharts.has(chartTitle)) continue;
    consumedCharts.add(chartTitle);
    const slot = slots.find((item) => normalizeText(item?.title) === chartTitle) || null;
    pushModule({
      moduleType: 'chart',
      title: chartTitle,
      purpose: normalizeText(slot?.purpose),
      contentDraft: '',
      evidenceRefs: [`chart:${chartTitle}`],
      chartIntent: buildChartIntent(chart, slot),
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      layoutType: 'chart',
    });
  }

  return modules;
}

function buildRiskBriefModules(record: ReportOutputRecord): ReportDraftModule[] {
  return buildSequentialSectionModules(record, classifyRiskSectionType);
}

function buildResearchBriefModules(record: ReportOutputRecord): ReportDraftModule[] {
  return buildSequentialSectionModules(record, classifyResearchSectionType);
}

function buildSolutionOverviewModules(record: ReportOutputRecord): ReportDraftModule[] {
  return buildSequentialSectionModules(record, classifySolutionSectionType);
}

function buildTalentShowcaseModules(record: ReportOutputRecord): ReportDraftModule[] {
  return buildSequentialSectionModules(record, classifyTalentSectionType);
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
