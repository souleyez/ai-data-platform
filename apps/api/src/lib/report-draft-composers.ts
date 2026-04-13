import type {
  ReportDraftModule,
  ReportDraftModuleType,
  ReportOutputDraft,
  ReportOutputRecord,
  ReportVisualStylePreset,
} from './report-center.js';
import type { ReportPlanDatavizSlot, ReportPlanLayoutVariant, ReportPlanVisualMixTarget } from './report-planner.js';
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

type ResolvedDraftComposerTargets = {
  mustHaveTitles: string[];
  optionalTitles: string[];
  evidencePriorityTitles: string[];
  audienceTone: string;
  riskNotes: string[];
  visualMixTargets: ReportPlanVisualMixTarget[];
};

type DraftPolishContext = {
  layoutVariant: ReportPlanLayoutVariant | 'insight-brief';
  audienceTone: string;
  summary: string;
  metricLabels: string[];
};

function mergeOrderedTitles(...lists: Array<Array<string> | undefined>) {
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

function resolveDraftComposerTargets(
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

function applyVisualMixTargetsToPolicy(
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

function applySemanticDraftTargets(
  modules: ReportDraftModule[],
  record: ReportOutputRecord,
  targets: ResolvedDraftComposerTargets,
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

function ensureSentence(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  return /[。！？.!?]$/.test(normalized) ? normalized : `${normalized}。`;
}

function buildShortList(items: string[], limit = 2) {
  return items
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, limit);
}

function summarizeBulletsForCopy(bullets: string[], limit = 2) {
  const values = buildShortList(bullets, limit);
  return values.length ? values.join('、') : '';
}

function summarizeChartItemsForCopy(
  items: Array<{ label?: string; value?: number }> | null | undefined,
  limit = 3,
) {
  return summarizeBulletsForCopy(
    (Array.isArray(items) ? items : [])
      .map((item) => normalizeText(item?.label))
      .filter(Boolean),
    limit,
  );
}

function splitBulletLabel(bullet: string) {
  const normalized = normalizeText(bullet);
  if (!normalized) return '';
  const [label = normalized] = normalized.split(/[：:|]/).map((item) => item.trim()).filter(Boolean);
  return label || normalized;
}

function buildScenarioLead(
  layoutVariant: DraftPolishContext['layoutVariant'],
  moduleType: ReportDraftModuleType,
  title: string,
) {
  if (moduleType === 'cta') {
    if (layoutVariant === 'risk-brief') return '建议优先处理以下动作';
    if (layoutVariant === 'research-brief') return '建议先按以下方向收口研究结论';
    if (layoutVariant === 'solution-overview') return '建议优先推进以下动作';
    if (layoutVariant === 'talent-showcase') return '建议按以下方式推进沟通';
    return '建议优先执行以下动作';
  }
  if (moduleType === 'timeline') {
    if (layoutVariant === 'talent-showcase') return '可按以下经历顺序展开';
    if (layoutVariant === 'solution-overview') return '建议按以下交付阶段推进';
    return '建议按以下阶段推进';
  }
  if (moduleType === 'comparison') {
    if (layoutVariant === 'solution-overview') return '可按以下能力模块展开';
    if (layoutVariant === 'talent-showcase') return '可优先展示以下代表案例';
    return `${normalizeText(title) || '当前内容'}可优先从以下维度展开`;
  }
  if (moduleType === 'chart') {
    if (layoutVariant === 'operations-cockpit') return '图表建议优先展示以下经营维度';
    if (layoutVariant === 'solution-overview') return '图表建议优先展示以下能力覆盖';
    if (layoutVariant === 'research-brief') return '图表建议优先展示以下关键结果';
    return '图表建议优先展示以下维度';
  }
  if (moduleType === 'insight-list') {
    if (/风险|异常|波动|问题/.test(normalizeText(title))) return '当前需要优先关注的问题集中在';
    if (layoutVariant === 'research-brief') return '当前最值得保留的研究发现集中在';
    return '当前最值得保留的关键信号集中在';
  }
  return '';
}

function buildScenarioTail(
  layoutVariant: DraftPolishContext['layoutVariant'],
  moduleType: ReportDraftModuleType,
) {
  if (moduleType === 'hero') {
    if (layoutVariant === 'operations-cockpit') return '页面开场先把整体经营盘面交代清楚，再落到风险和动作。';
    if (layoutVariant === 'solution-overview') return '页面开场先讲清方案主张，再展开能力模块和交付路径。';
    if (layoutVariant === 'research-brief') return '页面开场先交代研究结论，再说明边界和建议。';
    if (layoutVariant === 'risk-brief') return '页面开场先指出核心风险，再落到应答动作。';
    if (layoutVariant === 'talent-showcase') return '页面开场先讲核心优势，再落到经历和案例。';
  }
  if (moduleType === 'cta') {
    if (layoutVariant === 'operations-cockpit') return '动作建议要尽量写成可以立即执行的经营动作。';
    if (layoutVariant === 'solution-overview') return '优先把能最快形成客户感知的交付样板落下来。';
    if (layoutVariant === 'research-brief') return '建议先把适用边界和下一步验证动作讲清楚。';
    if (layoutVariant === 'risk-brief') return '优先把补证、边界澄清和材料重写排出顺序。';
    if (layoutVariant === 'talent-showcase') return '建议把沟通重点落在项目边界、角色和结果。';
  }
  if (moduleType === 'timeline') {
    if (layoutVariant === 'solution-overview') return '交付路径尽量保持客户容易理解的阶段节奏。';
    if (layoutVariant === 'talent-showcase') return '经历顺序尽量体现能力沉淀而不是简单列项目。';
  }
  if (moduleType === 'comparison') {
    if (layoutVariant === 'solution-overview') return '每个能力模块都应说明解决什么问题、怎么交付、客户能看到什么。';
    if (layoutVariant === 'operations-cockpit') return '对比维度要优先服务经营判断，不做平铺罗列。';
    if (layoutVariant === 'talent-showcase') return '案例说明尽量同时覆盖场景、角色和结果。';
  }
  if (moduleType === 'chart') {
    if (layoutVariant === 'operations-cockpit') return '图表应优先支撑当前经营判断，而不是重复罗列数据。';
    if (layoutVariant === 'solution-overview') return '图表应优先说明能力覆盖或交付范围，让客户一眼看懂。';
    if (layoutVariant === 'research-brief') return '图表应优先支撑主要结论，不额外扩展无关指标。';
  }
  if (moduleType === 'insight-list') {
    if (layoutVariant === 'operations-cockpit') return '重点信号应直接服务当前经营判断。';
    if (layoutVariant === 'research-brief') return '发现应尽量保留能直接进入客户摘要页的表述。';
    if (layoutVariant === 'risk-brief') return '风险描述要落到影响范围和优先级。';
  }
  return '';
}

function buildCtaActionSentence(
  layoutVariant: DraftPolishContext['layoutVariant'],
  topActions: string,
) {
  if (!topActions) return '';
  if (layoutVariant === 'operations-cockpit') return `建议先围绕${topActions}组织当前经营动作。`;
  if (layoutVariant === 'solution-overview') return `建议优先把${topActions}落成第一批客户可见交付。`;
  if (layoutVariant === 'research-brief') return `建议先围绕${topActions}收口研究结论和适用边界。`;
  if (layoutVariant === 'risk-brief') return `建议优先围绕${topActions}处理当前风险。`;
  if (layoutVariant === 'talent-showcase') return `建议优先围绕${topActions}组织后续沟通。`;
  return `建议优先围绕${topActions}推进。`;
}

function buildComparisonDimensionSentence(
  layoutVariant: DraftPolishContext['layoutVariant'],
  dimensions: string,
) {
  if (!dimensions) return '';
  if (layoutVariant === 'operations-cockpit') return `重点可先围绕${dimensions}组织当前经营判断。`;
  if (layoutVariant === 'solution-overview') return `重点可先按${dimensions}组织方案说明。`;
  if (layoutVariant === 'talent-showcase') return `重点可先按${dimensions}组织案例说明。`;
  return `重点可先按${dimensions}展开。`;
}

function buildMetricGridTitle(layoutVariant: DraftPolishContext['layoutVariant']) {
  if (layoutVariant === 'operations-cockpit') return '经营指标';
  if (layoutVariant === 'solution-overview') return '方案亮点';
  if (layoutVariant === 'talent-showcase') return '关键信息';
  if (layoutVariant === 'risk-brief') return '关键提示';
  if (layoutVariant === 'research-brief') return '关键结论';
  return '关键指标';
}

function buildScenarioModuleTitle(
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

function buildMetricCardFallbackNote(
  layoutVariant: DraftPolishContext['layoutVariant'],
  label: string,
) {
  const normalizedLabel = normalizeText(label).toLowerCase();
  if (layoutVariant === 'operations-cockpit') {
    if (/订单|gmv|销售|收入|营收/.test(normalizedLabel)) return '建议作为首屏经营结果信号展示。';
    if (/库存|补货|周转/.test(normalizedLabel)) return '适合与风险和补货动作一起看。';
    if (/退款|退货|转化|复购/.test(normalizedLabel)) return '适合作为经营质量信号展示。';
    return '建议作为首屏经营信号展示。';
  }
  if (layoutVariant === 'solution-overview') {
    if (/场景|行业|客户/.test(normalizedLabel)) return '适合放在方案首页说明适用范围。';
    if (/模块|能力|覆盖/.test(normalizedLabel)) return '适合作为方案亮点数字展示。';
    return '建议作为方案首页亮点数字展示。';
  }
  if (layoutVariant === 'talent-showcase') {
    if (/项目|案例/.test(normalizedLabel)) return '适合放在人物概览区快速建立可信度。';
    if (/年限|经验|履历/.test(normalizedLabel)) return '适合作为人物概览的基础信息。';
    return '适合作为人物概览的首屏信息。';
  }
  if (layoutVariant === 'risk-brief') return '适合作为风险摘要页的辅助提示信息。';
  if (layoutVariant === 'research-brief') return '适合作为研究摘要页的辅助结论信息。';
  return '';
}

function looksLikeWeakCardNote(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  return /^(样例|示例|待补充|暂无|说明|备注)$/u.test(normalized) || normalized.length <= 4;
}

function polishMetricGridCards(
  cards: Array<{ label?: string; value?: string; note?: string }>,
  layoutVariant: DraftPolishContext['layoutVariant'],
) {
  return (Array.isArray(cards) ? cards : []).map((card, index) => {
    const label = normalizeText(card?.label) || `指标 ${index + 1}`;
    const value = normalizeText(card?.value);
    const note = normalizeText(card?.note);
    const fallbackNote = buildMetricCardFallbackNote(layoutVariant, label);
    return {
      ...card,
      label,
      value,
      note: looksLikeWeakCardNote(note) ? (fallbackNote || note) : ensureSentence(note),
    };
  });
}

function buildPlaceholderContentDraft(
  moduleType: ReportDraftModuleType,
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

function buildReadableModuleCopy(module: ReportDraftModule, context: DraftPolishContext) {
  const body = normalizeText(module.contentDraft);
  const bullets = Array.isArray(module.bullets) ? module.bullets.filter(Boolean).map((item) => normalizeText(item)) : [];
  const metricFocus = buildShortList(context.metricLabels, 2).join('、');
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

function polishDraftModules(modules: ReportDraftModule[], context: DraftPolishContext) {
  return modules.map((module) => {
    const normalizedEvidenceRefs = Array.isArray(module.evidenceRefs)
      ? module.evidenceRefs.map((item) => normalizeText(item)).filter(Boolean)
      : [];
    const contentDraft = normalizedEvidenceRefs.includes('composer:placeholder')
      ? buildPlaceholderContentDraft(module.moduleType, module.title, context.summary, context)
      : buildReadableModuleCopy(module, context);
    return {
      ...module,
      contentDraft,
      purpose: normalizeText(module.purpose),
      evidenceRefs: normalizedEvidenceRefs,
      title: buildScenarioModuleTitle(context.layoutVariant, module.moduleType, module.title),
      cards:
        module.moduleType === 'metric-grid'
          ? polishMetricGridCards(module.cards || [], context.layoutVariant)
          : module.cards,
    };
  });
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

  const targets = resolveDraftComposerTargets(record, policy);
  const effectivePolicy = applyVisualMixTargetsToPolicy(policy, targets.visualMixTargets);
  const semanticModules = applySemanticDraftTargets(modules, record, targets);
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
