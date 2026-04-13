import type {
  ReportDraftModule,
  ReportDraftModuleType,
  ReportOutputDraft,
  ReportOutputRecord,
  ReportVisualStylePreset,
} from './report-center.js';
import type { ReportPlanDatavizSlot } from './report-planner.js';
import {
  buildSupplementalVisualModule,
  inferSectionModuleType,
} from './report-visual-intent.js';

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type DraftComposerPolicy = {
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

const DRAFT_COMPOSER_POLICIES: Partial<Record<
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

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeSlotKey(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeDraftChartType(value: unknown): ReportPlanDatavizSlot['preferredChartType'] | undefined {
  if (value === 'horizontal-bar' || value === 'line' || value === 'bar') return value;
  return undefined;
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
      contentDraft: '',
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

function classifySectionType(title: string, body: string, bullets: string[], hasBullets: boolean): ReportDraftModuleType {
  return inferSectionModuleType({
    title,
    body,
    bullets,
    fallbackModuleType: hasBullets ? 'insight-list' : 'summary',
  });
}

function classifyRiskSectionType(title: string, body: string, bullets: string[], hasBullets: boolean): ReportDraftModuleType {
  const normalized = `${title} ${body} ${(bullets || []).join(' ')}`.toLowerCase();
  if (/应答|应对|策略|建议|行动|next|recommend/.test(normalized)) return 'cta';
  if (/风险|资格|缺口|异常|阻塞|问题|gap/.test(normalized)) return 'insight-list';
  if (/附录|证据|来源|材料|依据|appendix|evidence/.test(normalized)) return 'appendix';
  if (/矩阵|对比|comparison/.test(normalized)) return 'comparison';
  return inferSectionModuleType({
    title,
    body,
    bullets,
    fallbackModuleType: hasBullets ? 'insight-list' : 'summary',
  });
}

function classifyResearchSectionType(title: string, body: string, bullets: string[], hasBullets: boolean): ReportDraftModuleType {
  const normalized = `${title} ${body} ${(bullets || []).join(' ')}`.toLowerCase();
  if (/局限|限制|风险|uncertainty|limitation/.test(normalized)) return 'insight-list';
  if (/结果|发现|结论|finding|result|conclusion/.test(normalized)) return 'insight-list';
  if (/建议|启发|行动|next|recommend/.test(normalized)) return 'cta';
  if (/方法|method|design/.test(normalized)) return 'summary';
  return inferSectionModuleType({
    title,
    body,
    bullets,
    fallbackModuleType: hasBullets ? 'insight-list' : 'summary',
  });
}

function classifySolutionSectionType(title: string, body: string, bullets: string[], hasBullets: boolean): ReportDraftModuleType {
  const normalized = `${title} ${body} ${(bullets || []).join(' ')}`.toLowerCase();
  if (/交付|实施|计划|里程碑|roadmap|timeline|phase|上线/.test(normalized)) return 'timeline';
  if (/建议|行动|下一步|next|recommend|call to action/.test(normalized)) return 'cta';
  if (/架构|模块|能力|服务|产品|方案|组件|capability|service|solution|architecture|module/.test(normalized)) {
    return hasBullets ? 'comparison' : 'summary';
  }
  if (/价值|收益|亮点|优势|benefit|value|highlight|advantage/.test(normalized)) return 'insight-list';
  if (/案例|证据|客户|proof|reference|appendix|evidence/.test(normalized)) return 'appendix';
  return inferSectionModuleType({
    title,
    body,
    bullets,
    fallbackModuleType: hasBullets ? 'insight-list' : 'summary',
  });
}

function classifyTalentSectionType(title: string, body: string, bullets: string[], hasBullets: boolean): ReportDraftModuleType {
  const normalized = `${title} ${body} ${(bullets || []).join(' ')}`.toLowerCase();
  if (/联系|合作|下一步|next|contact|reach/.test(normalized)) return 'cta';
  if (/经历|履历|experience|timeline|成长|历程/.test(normalized)) return 'timeline';
  if (/技能|能力|强项|优势|skill|strength|capabilit/.test(normalized)) return 'insight-list';
  if (/项目|案例|portfolio|case|作品/.test(normalized)) return 'comparison';
  if (/成果|亮点|achievement|impact|result/.test(normalized)) return 'insight-list';
  if (/附录|证书|reference|appendix/.test(normalized)) return 'appendix';
  return inferSectionModuleType({
    title,
    body,
    bullets,
    fallbackModuleType: hasBullets ? 'insight-list' : 'summary',
  });
}

function resolveRecordLayoutVariant(record: ReportOutputRecord) {
  return normalizeText(record.page?.pageSpec?.layoutVariant || record.dynamicSource?.planPageSpec?.layoutVariant);
}

function isOperationsCockpitRecord(record: ReportOutputRecord) {
  const layoutVariant = resolveRecordLayoutVariant(record);
  if (layoutVariant === 'operations-cockpit') return true;
  const title = normalizeText(record.title).toLowerCase();
  return /workspace|overview|dashboard|cockpit|总览|经营|运营|驾驶舱/.test(title);
}

function isRiskBriefRecord(record: ReportOutputRecord) {
  const layoutVariant = resolveRecordLayoutVariant(record);
  if (layoutVariant === 'risk-brief') return true;
  const title = normalizeText(record.title).toLowerCase();
  return /risk|bid|tender|proposal|标书|招标|投标|风险/.test(title);
}

function isResearchBriefRecord(record: ReportOutputRecord) {
  const layoutVariant = resolveRecordLayoutVariant(record);
  if (layoutVariant === 'research-brief') return true;
  const title = normalizeText(record.title).toLowerCase();
  return /research|paper|study|analysis|论文|研究|综述|分析/.test(title);
}

function isSolutionOverviewRecord(record: ReportOutputRecord) {
  const layoutVariant = resolveRecordLayoutVariant(record);
  if (layoutVariant === 'solution-overview') return true;
  const title = normalizeText(record.title).toLowerCase();
  return /solution|overview|service|capability|architecture|解决方案|方案|能力|服务|产品介绍|架构/.test(title);
}

function isTalentShowcaseRecord(record: ReportOutputRecord) {
  const layoutVariant = resolveRecordLayoutVariant(record);
  if (layoutVariant === 'talent-showcase') return true;
  const title = normalizeText(record.title).toLowerCase();
  return /resume|profile|portfolio|talent|candidate|cv|简历|履历|人才|作品集/.test(title);
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

  const policyModules = applyDraftComposerPolicy(modules, record, policy);

  const orderedTitles = policyModules.map((item) => item.title).filter(Boolean);
  const chartTitles = policyModules
    .filter((item) => item.moduleType === 'chart')
    .map((item) => item.title)
    .filter(Boolean);
  const typeDrivenEvidencePriority = policy
    ? (policy.evidenceRequiredTypes || [])
      .flatMap((moduleType) => policyModules.filter((item) => item.moduleType === moduleType).map((item) => item.title))
      .filter(Boolean)
    : [];
  const semanticEvidencePriority = resolveSemanticPriorityModules(policyModules, policy?.evidencePriorityTitles);
  const riskNotes = policyModules
    .filter((item) => item.moduleType === 'insight-list' && /风险|异常|波动|问题|预警/.test(normalizeText(item.title)))
    .flatMap((item) => item.bullets || [])
    .filter(Boolean)
    .slice(0, 5);
  const semanticMustHaveModules = resolveSemanticMustHaveModules(policyModules, policy?.semanticMustHaveTitles);
  const typeDrivenMustHaveModules = policy
    ? (Object.entries(policy.minCounts) as Array<[ReportDraftModuleType, number]>)
      .flatMap(([moduleType, minCount]) => {
        const typedModules = policyModules.filter((item) => item.moduleType === moduleType).slice(0, minCount);
        return typedModules.map((item) => item.title).filter(Boolean);
      })
    : orderedTitles.filter((title) => /摘要|指标|行动|建议|概览|风险|结论|发现/.test(title)).slice(0, 8);
  const mustHaveModules = Array.from(new Set([
    ...semanticMustHaveModules,
    ...typeDrivenMustHaveModules,
  ]));

  return {
    reviewStatus: 'draft_generated',
    version: 1,
    modules: policyModules,
    lastEditedAt: record.createdAt,
    approvedAt: '',
    audience: normalizeText(record.dynamicSource?.planAudience) || 'client',
    objective: normalizeText(record.dynamicSource?.planObjective) || normalizeText(record.page?.summary) || 'Create a client-readable page draft from current project evidence.',
    layoutVariant: (layoutVariant || 'insight-brief') as ReportOutputDraft['layoutVariant'],
    visualStyle: record.page?.visualStyle || fallbackVisualStyle,
    mustHaveModules: mustHaveModules.slice(0, 8),
    optionalModules: orderedTitles.filter((title) => !mustHaveModules.includes(title)).slice(0, 8),
    evidencePriority: Array.from(new Set([
      ...semanticEvidencePriority,
      ...typeDrivenEvidencePriority,
      ...chartTitles,
    ])).slice(0, 8),
    audienceTone: policy?.audienceTone || 'client-facing',
    riskNotes,
  };
}
