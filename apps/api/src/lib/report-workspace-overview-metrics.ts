import { buildWorkspaceOverviewBullets } from './report-workspace-overview-copy.js';
import {
  formatWorkspaceOverviewPercent,
  pickTopWorkspaceDraftScenarios,
  pickTopWorkspaceOverviewLibraries,
  toWorkspaceOverviewNumber,
} from './report-workspace-overview-support.js';

export type WorkspaceOverviewMetricCard = {
  label: string;
  value: string;
  note: string;
};

export type WorkspaceOverviewScenario = {
  label?: string;
  readyRatio?: number;
  blocked?: number;
  total?: number;
  averageEvidenceCoverage?: number;
};

export type WorkspaceOverviewMetrics = {
  totalFiles: number;
  canonicalReady: number;
  fallbackCount: number;
  markdownFailed: number;
  failedRuns: number;
  runningRuns: number;
  partialRuns: number;
  successRuns: number;
  totalOutputs: number;
  dynamicOutputs: number;
  draftOutputs: number;
  draftReadyOutputs: number;
  draftBlockedOutputs: number;
  draftNeedsAttentionOutputs: number;
  staleDynamicOutputs: number;
  warningCount: number;
  criticalCount: number;
  draftBenchmark: {
    totals: {
      drafts: number;
      ready: number;
      needsAttention: number;
      blocked: number;
      readyRatio: number;
    };
    scenarios: WorkspaceOverviewScenario[];
  };
  topLibraries: Array<{ key?: string; label?: string; documentCount?: number }>;
  topDraftScenarios: WorkspaceOverviewScenario[];
  outputStatusCounts: Record<string, number>;
  cards: WorkspaceOverviewMetricCard[];
  warningBullets: string[];
  riskNotes: string[];
};

export function buildWorkspaceOverviewMetrics(input: {
  operations: Record<string, any>;
  libraries: Array<{ key?: string; label?: string; documentCount?: number }>;
  outputs: Array<{ status?: string }>;
}) : WorkspaceOverviewMetrics {
  const { operations, libraries, outputs } = input;
  const totalFiles = toWorkspaceOverviewNumber(operations.parse?.scanSummary?.totalFiles);
  const canonicalReady = toWorkspaceOverviewNumber(operations.parse?.markdownSummary?.canonicalReady);
  const fallbackCount = Math.max(0, totalFiles - canonicalReady);
  const markdownFailed = toWorkspaceOverviewNumber(operations.parse?.markdownSummary?.markdownFailed);
  const failedRuns = toWorkspaceOverviewNumber(operations.capture?.runSummary?.failedRuns);
  const runningRuns = toWorkspaceOverviewNumber(operations.capture?.runSummary?.runningRuns);
  const partialRuns = toWorkspaceOverviewNumber(operations.capture?.runSummary?.partialRuns);
  const successRuns = toWorkspaceOverviewNumber(operations.capture?.runSummary?.successRuns);
  const totalOutputs = toWorkspaceOverviewNumber(operations.output?.summary?.outputs);
  const dynamicOutputs = toWorkspaceOverviewNumber(operations.output?.summary?.dynamicOutputs);
  const draftOutputs = toWorkspaceOverviewNumber(operations.output?.summary?.draftOutputs);
  const draftReadyOutputs = toWorkspaceOverviewNumber(operations.output?.summary?.draftReadyOutputs);
  const draftBlockedOutputs = toWorkspaceOverviewNumber(operations.output?.summary?.draftBlockedOutputs);
  const draftNeedsAttentionOutputs = toWorkspaceOverviewNumber(operations.output?.summary?.draftNeedsAttentionOutputs);
  const staleDynamicOutputs = toWorkspaceOverviewNumber(operations.output?.summary?.staleDynamicOutputs);
  const draftBenchmark = operations.output?.benchmark || { totals: { drafts: 0, ready: 0, needsAttention: 0, blocked: 0, readyRatio: 0 }, scenarios: [] };
  const warningCount = toWorkspaceOverviewNumber(operations.stability?.summary?.warningCount);
  const criticalCount = toWorkspaceOverviewNumber(operations.stability?.summary?.criticalCount);
  const topLibraries = pickTopWorkspaceOverviewLibraries(libraries);
  const topDraftScenarios = pickTopWorkspaceDraftScenarios(Array.isArray(draftBenchmark?.scenarios) ? draftBenchmark.scenarios : []);
  const outputStatusCounts = outputs.reduce<Record<string, number>>((acc, item) => {
    const key = String(item?.status || 'unknown').trim() || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const cards = [
    { label: '资料规模', value: String(totalFiles), note: `覆盖 ${libraries.length} 个数据集` },
    { label: '正文就绪', value: formatWorkspaceOverviewPercent(canonicalReady, totalFiles), note: `${canonicalReady} / ${totalFiles} 份可直接供页` },
    { label: '采集任务', value: String(toWorkspaceOverviewNumber(operations.capture?.taskSummary?.totalTasks)), note: `已排程 ${toWorkspaceOverviewNumber(operations.capture?.taskSummary?.scheduledTasks)} 个来源` },
    { label: '页面产出', value: String(totalOutputs), note: `动态页面 ${dynamicOutputs} 份` },
    { label: '可终稿草稿', value: String(draftReadyOutputs), note: `待润色 ${draftNeedsAttentionOutputs} 份` },
  ];

  const warnings = Array.isArray(operations.stability?.warnings)
    ? operations.stability.warnings as Array<{ title?: string; detail?: string }>
    : [];

  const warningBullets = buildWorkspaceOverviewBullets({
    canonicalReady,
    totalFiles,
    failedRuns,
    errorTasks: toWorkspaceOverviewNumber(operations.capture?.taskSummary?.errorTasks),
    outputs: totalOutputs,
    dynamicOutputs,
    draftOutputs,
    draftReadyOutputs,
    draftBlockedOutputs,
    draftNeedsAttentionOutputs,
    warnings,
  });
  const riskNotes = warnings
    .slice(0, 5)
    .map((item) => `${item.title || '告警'}：${item.detail || ''}`);

  return {
    totalFiles,
    canonicalReady,
    fallbackCount,
    markdownFailed,
    failedRuns,
    runningRuns,
    partialRuns,
    successRuns,
    totalOutputs,
    dynamicOutputs,
    draftOutputs,
    draftReadyOutputs,
    draftBlockedOutputs,
    draftNeedsAttentionOutputs,
    staleDynamicOutputs,
    warningCount,
    criticalCount,
    draftBenchmark,
    topLibraries,
    topDraftScenarios,
    outputStatusCounts,
    cards,
    warningBullets,
    riskNotes,
  };
}
