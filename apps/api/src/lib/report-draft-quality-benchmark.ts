import type { ReportOutputRecord } from './report-center.js';
import type { ReportDraftBenchmarkScenario, ReportDraftBenchmarkSummary } from './report-draft-quality-types.js';

const REPORT_SCENARIO_LABELS: Record<string, string> = {
  'insight-brief': '洞察简报',
  'risk-brief': '风险简报',
  'operations-cockpit': '经营总览',
  'talent-showcase': '人才展示页',
  'research-brief': '研究综述页',
  'solution-overview': '方案介绍页',
};

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
