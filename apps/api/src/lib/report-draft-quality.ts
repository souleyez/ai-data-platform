import type {
  ReportDraftChecklistItem,
  ReportDraftEvidenceCoverage,
  ReportDraftModule,
  ReportDraftReadiness,
  ReportOutputDraft,
  ReportOutputRecord,
} from './report-center.js';

const REPORT_SCENARIO_LABELS: Record<string, string> = {
  'insight-brief': '洞察简报',
  'risk-brief': '风险简报',
  'operations-cockpit': '经营总览',
  'talent-showcase': '人才展示页',
  'research-brief': '研究综述页',
  'solution-overview': '方案介绍页',
};

export type ReportDraftBenchmarkScenario = {
  key: string;
  label: string;
  total: number;
  ready: number;
  needsAttention: number;
  blocked: number;
  readyRatio: number;
  averageEvidenceCoverage: number;
  latestTitle: string;
  latestCreatedAt: string;
};

export type ReportDraftBenchmarkSummary = {
  totals: {
    drafts: number;
    ready: number;
    needsAttention: number;
    blocked: number;
    readyRatio: number;
  };
  scenarios: ReportDraftBenchmarkScenario[];
};

function normalizeDraftChecklistLabel(value: string) {
  return String(value || '').trim().toLowerCase();
}

function doesDraftModuleMatchRequirement(module: ReportDraftModule, requirement: string) {
  const normalizedRequirement = normalizeDraftChecklistLabel(requirement);
  if (!normalizedRequirement) return false;
  const candidates = [
    module.title,
    module.purpose,
    module.layoutType,
    module.moduleType,
  ]
    .map((item) => normalizeDraftChecklistLabel(item || ''))
    .filter(Boolean);
  return candidates.some((candidate) => (
    candidate === normalizedRequirement
    || candidate.includes(normalizedRequirement)
    || normalizedRequirement.includes(candidate)
  ));
}

function getEnabledDraftModules(draft: ReportOutputDraft) {
  return (draft.modules || [])
    .filter((module) => module.enabled !== false && module.status !== 'disabled')
    .sort((left, right) => left.order - right.order);
}

function hasMeaningfulDraftContent(module: ReportDraftModule) {
  return Boolean(
    String(module.contentDraft || '').trim()
    || (Array.isArray(module.bullets) && module.bullets.some((item) => String(item || '').trim()))
    || (Array.isArray(module.cards) && module.cards.some((item) => String(item?.label || '').trim() || String(item?.value || '').trim()))
    || (Array.isArray(module.chartIntent?.items) && module.chartIntent.items.some((item) => String(item?.label || '').trim()))
  );
}

function hasMeaningfulEvidenceRefs(module: ReportDraftModule) {
  return Array.isArray(module.evidenceRefs)
    && module.evidenceRefs.some((item) => {
      const normalized = String(item || '').trim().toLowerCase();
      return Boolean(normalized && normalized !== 'composer:placeholder');
    });
}

function hasEvidenceSignals(module: ReportDraftModule) {
  return Boolean(
    hasMeaningfulEvidenceRefs(module)
    || (Array.isArray(module.cards) && module.cards.some((item) => String(item?.label || '').trim() || String(item?.value || '').trim()))
    || (Array.isArray(module.chartIntent?.items) && module.chartIntent.items.some((item) => String(item?.label || '').trim()))
  );
}

function isPriorityEvidenceModule(module: ReportDraftModule, draft: ReportOutputDraft) {
  const priorities = Array.isArray(draft.evidencePriority) ? draft.evidencePriority : [];
  if (!priorities.length) return false;
  return priorities.some((item) => doesDraftModuleMatchRequirement(module, item));
}

function summarizeVisualMixCoverage(enabledModules: ReportDraftModule[], draft: ReportOutputDraft) {
  const targets = Array.isArray(draft.visualMixTargets) ? draft.visualMixTargets : [];
  if (!targets.length) {
    return {
      missing: [] as string[],
      detail: '当前未声明视觉比例目标，不影响终稿就绪度。',
      status: 'pass' as const,
    };
  }

  const missing = targets
    .filter((target) => Number(target.minCount || 0) > 0)
    .filter((target) => enabledModules.filter((module) => module.moduleType === target.moduleType).length < Number(target.minCount || 0))
    .map((target) => `${target.moduleType} ${enabledModules.filter((module) => module.moduleType === target.moduleType).length}/${target.minCount}`);

  if (!missing.length) {
    return {
      missing,
      detail: targets
        .map((target) => {
          const count = enabledModules.filter((module) => module.moduleType === target.moduleType).length;
          return `${target.moduleType} ${count}/${target.targetCount}`;
        })
        .join(' · '),
      status: 'pass' as const,
    };
  }

  return {
    missing,
    detail: `视觉模块仍需补齐：${missing.join('、')}`,
    status: 'warning' as const,
  };
}

export function buildDraftQualityChecklist(draft: ReportOutputDraft) {
  const enabledModules = getEnabledDraftModules(draft);
  const meaningfulModules = enabledModules.filter(hasMeaningfulDraftContent);
  const missingMustHaveModules = (draft.mustHaveModules || [])
    .filter((title) => String(title || '').trim())
    .filter((title) => !enabledModules.some((module) => doesDraftModuleMatchRequirement(module, title)));

  const evidenceCoverage = {
    coveredModules: enabledModules.filter(hasEvidenceSignals).length,
    totalModules: enabledModules.length,
    ratio: enabledModules.length
      ? Number((enabledModules.filter(hasEvidenceSignals).length / enabledModules.length).toFixed(3))
      : 0,
  } satisfies ReportDraftEvidenceCoverage;
  const priorityEvidenceModules = enabledModules.filter((module) => isPriorityEvidenceModule(module, draft));
  const priorityEvidenceCoverage = {
    coveredModules: priorityEvidenceModules.filter(hasEvidenceSignals).length,
    totalModules: priorityEvidenceModules.length,
    ratio: priorityEvidenceModules.length
      ? Number((priorityEvidenceModules.filter(hasEvidenceSignals).length / priorityEvidenceModules.length).toFixed(3))
      : 0,
  };

  const hasVisualModule = enabledModules.some((module) => (
    module.moduleType === 'metric-grid'
    || module.moduleType === 'chart'
    || module.moduleType === 'timeline'
    || module.moduleType === 'comparison'
  ));
  const heroOrSummaryPresent = enabledModules.some((module) => module.moduleType === 'hero' || module.moduleType === 'summary');
  const visualMixCoverage = summarizeVisualMixCoverage(enabledModules, draft);

  const checklist: ReportDraftChecklistItem[] = [
    {
      key: 'enabled-modules',
      label: '已启用模块',
      status: enabledModules.length ? 'pass' : 'fail',
      detail: enabledModules.length
        ? `已启用 ${enabledModules.length} 个模块。`
        : '当前草稿没有启用模块。',
      blocking: true,
    },
    {
      key: 'must-have-modules',
      label: '关键模块完整度',
      status: missingMustHaveModules.length ? 'fail' : 'pass',
      detail: missingMustHaveModules.length
        ? `缺少关键模块：${missingMustHaveModules.join('、')}`
        : '关键模块已覆盖。',
      blocking: true,
    },
    {
      key: 'meaningful-content',
      label: '模块内容完整度',
      status: meaningfulModules.length ? 'pass' : 'fail',
      detail: meaningfulModules.length
        ? `有内容的模块 ${meaningfulModules.length}/${enabledModules.length || 0}。`
        : '当前没有可读的模块正文或图表草稿。',
      blocking: true,
    },
    {
      key: 'hero-summary',
      label: '开场摘要',
      status: heroOrSummaryPresent ? 'pass' : 'warning',
      detail: heroOrSummaryPresent ? '已包含开场摘要模块。' : '建议补一个 hero 或 summary 模块。',
    },
    {
      key: 'visual-coverage',
      label: '可视化覆盖',
      status: hasVisualModule ? 'pass' : 'warning',
      detail: hasVisualModule ? '已包含指标、对比、时间线或图表模块。' : '建议补至少一个指标、对比、时间线或图表模块。',
    },
    {
      key: 'visual-mix',
      label: '视觉比例目标',
      status: visualMixCoverage.status,
      detail: visualMixCoverage.detail,
    },
    {
      key: 'evidence-coverage',
      label: '证据与数据覆盖',
      status: evidenceCoverage.totalModules === 0
        ? 'warning'
        : evidenceCoverage.ratio >= 0.4
          ? 'pass'
          : 'warning',
      detail: evidenceCoverage.totalModules
        ? `有证据或数据支撑的模块 ${evidenceCoverage.coveredModules}/${evidenceCoverage.totalModules}。`
        : '当前还没有可评估的模块。',
    },
    {
      key: 'priority-evidence',
      label: '关键模块证据覆盖',
      status: priorityEvidenceCoverage.totalModules === 0
        ? 'warning'
        : priorityEvidenceCoverage.ratio >= 0.6
          ? 'pass'
          : 'warning',
      detail: priorityEvidenceCoverage.totalModules
        ? `重点模块证据覆盖 ${priorityEvidenceCoverage.coveredModules}/${priorityEvidenceCoverage.totalModules}。`
        : '当前还没有声明需要重点覆盖证据的模块。',
    },
  ];

  const blockingFailures = checklist.some((item) => item.blocking && item.status === 'fail');
  const warnings = checklist.some((item) => item.status === 'warning');
  const readiness: ReportDraftReadiness = blockingFailures
    ? 'blocked'
    : warnings
      ? 'needs_attention'
      : 'ready';

  return {
    readiness,
    qualityChecklist: checklist,
    missingMustHaveModules,
    evidenceCoverage,
  };
}

export function hydrateDraftQuality(draft: ReportOutputDraft): ReportOutputDraft {
  return {
    ...draft,
    ...buildDraftQualityChecklist(draft),
  };
}

export function resolveReportScenarioKey(item: ReportOutputRecord) {
  const draftLayoutVariant = String(item?.draft?.layoutVariant || '').trim();
  if (draftLayoutVariant) return draftLayoutVariant;
  const pageLayoutVariant = String(item?.page?.pageSpec?.layoutVariant || '').trim();
  if (pageLayoutVariant) return pageLayoutVariant;
  const dynamicLayoutVariant = String(item?.dynamicSource?.planPageSpec?.layoutVariant || '').trim();
  if (dynamicLayoutVariant) return dynamicLayoutVariant;
  return 'other';
}

export function resolveReportScenarioLabel(key: string) {
  if (key === 'other') return '通用静态页';
  return REPORT_SCENARIO_LABELS[key] || key;
}

export function summarizeReportDraftBenchmarks(
  items: ReportOutputRecord[],
  options: {
    groupKeys?: string[];
  } = {},
): ReportDraftBenchmarkSummary {
  const groupKeys = Array.isArray(options.groupKeys)
    ? options.groupKeys.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const groupKeySet = groupKeys.length ? new Set(groupKeys) : null;
  const scopedItems = Array.isArray(items)
    ? items.filter((item) => {
        const isDraftPage = (item?.kind === 'page' || item?.outputType === 'page')
          && Array.isArray(item?.draft?.modules)
          && item.draft.modules.length > 0;
        if (!isDraftPage) return false;
        if (!groupKeySet) return true;
        return Boolean(item?.groupKey && groupKeySet.has(String(item.groupKey)));
      })
    : [];

  if (!scopedItems.length) {
    return {
      totals: {
        drafts: 0,
        ready: 0,
        needsAttention: 0,
        blocked: 0,
        readyRatio: 0,
      },
      scenarios: [],
    };
  }

  const scenarioMap = new Map<string, Omit<ReportDraftBenchmarkScenario, 'readyRatio' | 'averageEvidenceCoverage'> & { coverageAccumulator: number }>();
  let ready = 0;
  let needsAttention = 0;
  let blocked = 0;

  for (const item of scopedItems) {
    const readiness = String(item?.draft?.readiness || 'needs_attention').trim();
    if (readiness === 'ready') ready += 1;
    else if (readiness === 'blocked') blocked += 1;
    else needsAttention += 1;

    const scenarioKey = resolveReportScenarioKey(item);
    const current = scenarioMap.get(scenarioKey) || {
      key: scenarioKey,
      label: resolveReportScenarioLabel(scenarioKey),
      total: 0,
      ready: 0,
      needsAttention: 0,
      blocked: 0,
      latestTitle: '',
      latestCreatedAt: '',
      coverageAccumulator: 0,
    };

    current.total += 1;
    if (readiness === 'ready') current.ready += 1;
    else if (readiness === 'blocked') current.blocked += 1;
    else current.needsAttention += 1;

    const coverageRatio = Number(item?.draft?.evidenceCoverage?.ratio || 0);
    current.coverageAccumulator += Number.isFinite(coverageRatio) ? coverageRatio : 0;
    const createdAt = String(item?.createdAt || '').trim();
    if (!current.latestCreatedAt || createdAt > current.latestCreatedAt) {
      current.latestCreatedAt = createdAt;
      current.latestTitle = String(item?.title || '').trim();
    }
    scenarioMap.set(scenarioKey, current);
  }

  const scenarios: ReportDraftBenchmarkScenario[] = Array.from(scenarioMap.values())
    .map((item) => ({
      key: item.key,
      label: item.label,
      total: item.total,
      ready: item.ready,
      needsAttention: item.needsAttention,
      blocked: item.blocked,
      latestTitle: item.latestTitle,
      latestCreatedAt: item.latestCreatedAt,
      readyRatio: item.total ? item.ready / item.total : 0,
      averageEvidenceCoverage: item.total ? item.coverageAccumulator / item.total : 0,
    }))
    .sort((left, right) => {
      if (right.readyRatio !== left.readyRatio) return right.readyRatio - left.readyRatio;
      if (left.blocked !== right.blocked) return left.blocked - right.blocked;
      return right.total - left.total;
    });

  const drafts = scopedItems.length;
  return {
    totals: {
      drafts,
      ready,
      needsAttention,
      blocked,
      readyRatio: drafts ? ready / drafts : 0,
    },
    scenarios,
  };
}
