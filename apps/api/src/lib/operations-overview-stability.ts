import type { TaskRuntimeMetricsRecord } from './task-runtime-metrics.js';
import { averageDurationMs, buildWarning, toTimestamp } from './operations-overview-support.js';
import type { Phase1StabilityBlock } from './operations-overview-types.js';

const DEEP_PARSE_BACKLOG_WARNING = 20;
const DEEP_PARSE_BACKLOG_CRITICAL = 80;
const DATASOURCE_FAILED_RUNS_WARNING = 3;
const DATASOURCE_FAILED_RUNS_CRITICAL = 6;
const CAPTURE_ERROR_TASKS_WARNING = 1;
const MEMORY_SYNC_STALE_WARNING_MS = 6 * 60 * 60 * 1000;
const MEMORY_SYNC_STALE_CRITICAL_MS = 24 * 60 * 60 * 1000;
const DYNAMIC_OUTPUT_STALE_WARNING_MS = 12 * 60 * 60 * 1000;

type BuildPhase1StabilityInput = {
  runStatusCounts: Record<string, number>;
  captureErrorTasksCount: number;
  captureScheduledCount: number;
  dynamicOutputs: Array<{
    dynamicSource?: {
      lastRenderedAt?: string | null;
      updatedAt?: string | null;
    } | null;
    createdAt?: string | null;
  }>;
  draftBlockedCount: number;
  draftNeedsAttentionCount: number;
  deepParseQueued: number;
  deepParseProcessing: number;
  runDurationsMs: number[];
  deepParseTask: TaskRuntimeMetricsRecord | null;
  memorySyncTask: TaskRuntimeMetricsRecord | null;
  datavizTask: TaskRuntimeMetricsRecord | null;
  memorySyncStatus: {
    status: string;
    lastSuccessAt?: string | null;
    lastErrorMessage?: string | null;
  };
  now?: number;
};

export function buildPhase1StabilityBlock(input: BuildPhase1StabilityInput): {
  stability: Phase1StabilityBlock;
  dynamicOutputStaleCount: number;
} {
  const now = input.now ?? Date.now();
  const deepParseBacklog = input.deepParseQueued + input.deepParseProcessing;
  const memorySyncAgeMs = input.memorySyncStatus.lastSuccessAt
    ? Math.max(0, now - toTimestamp(input.memorySyncStatus.lastSuccessAt))
    : 0;
  const dynamicOutputStaleCount = input.dynamicOutputs.filter((item) => {
    const lastRenderedAt = toTimestamp(item.dynamicSource?.lastRenderedAt || item.dynamicSource?.updatedAt || item.createdAt);
    return Boolean(lastRenderedAt) && now - lastRenderedAt >= DYNAMIC_OUTPUT_STALE_WARNING_MS;
  }).length;

  const warnings = [];
  if (deepParseBacklog >= DEEP_PARSE_BACKLOG_CRITICAL) {
    warnings.push(buildWarning(
      'deep-parse-backlog-critical',
      'critical',
      'parse',
      '深解析积压过大',
      `当前待处理 ${deepParseBacklog}，已经超过阶段一 critical 阈值 ${DEEP_PARSE_BACKLOG_CRITICAL}。`,
    ));
  } else if (deepParseBacklog >= DEEP_PARSE_BACKLOG_WARNING) {
    warnings.push(buildWarning(
      'deep-parse-backlog-warning',
      'warning',
      'parse',
      '深解析出现积压',
      `当前待处理 ${deepParseBacklog}，已经超过阶段一 warning 阈值 ${DEEP_PARSE_BACKLOG_WARNING}。`,
    ));
  }

  if ((input.runStatusCounts.failed || 0) >= DATASOURCE_FAILED_RUNS_CRITICAL) {
    warnings.push(buildWarning(
      'datasource-failed-runs-critical',
      'critical',
      'datasource',
      '数据源失败运行过多',
      `最近失败运行 ${input.runStatusCounts.failed || 0} 次，已经超过阶段一 critical 阈值 ${DATASOURCE_FAILED_RUNS_CRITICAL}。`,
    ));
  } else if ((input.runStatusCounts.failed || 0) >= DATASOURCE_FAILED_RUNS_WARNING) {
    warnings.push(buildWarning(
      'datasource-failed-runs-warning',
      'warning',
      'datasource',
      '数据源失败运行偏多',
      `最近失败运行 ${input.runStatusCounts.failed || 0} 次，已经超过阶段一 warning 阈值 ${DATASOURCE_FAILED_RUNS_WARNING}。`,
    ));
  }

  if (input.captureErrorTasksCount >= CAPTURE_ERROR_TASKS_WARNING) {
    warnings.push(buildWarning(
      'capture-error-tasks-warning',
      'warning',
      'capture',
      '采集任务存在错误',
      `最近有 ${input.captureErrorTasksCount} 个采集任务处于 error 状态。`,
    ));
  }

  if (memorySyncAgeMs >= MEMORY_SYNC_STALE_CRITICAL_MS) {
    warnings.push(buildWarning(
      'memory-sync-stale-critical',
      'critical',
      'memory-sync',
      'memory sync 严重滞后',
      `距离上次成功同步已超过 ${Math.round(MEMORY_SYNC_STALE_CRITICAL_MS / 3600000)} 小时。`,
    ));
  } else if (memorySyncAgeMs >= MEMORY_SYNC_STALE_WARNING_MS) {
    warnings.push(buildWarning(
      'memory-sync-stale-warning',
      'warning',
      'memory-sync',
      'memory sync 已滞后',
      `距离上次成功同步已超过 ${Math.round(MEMORY_SYNC_STALE_WARNING_MS / 3600000)} 小时。`,
    ));
  }

  if (input.datavizTask?.status === 'failed' || input.datavizTask?.status === 'skipped') {
    const datavizDetail = input.datavizTask.lastErrorMessage
      || input.datavizTask.lastMessage
      || 'dataviz runtime unavailable';
    const datavizLevel = /renderer-unavailable/i.test(datavizDetail) ? 'warning' : 'critical';
    warnings.push(buildWarning(
      'dataviz-runtime-warning',
      datavizLevel,
      'dataviz',
      '图表渲染链异常',
      datavizDetail,
    ));
  }

  if (dynamicOutputStaleCount > 0) {
    warnings.push(buildWarning(
      'dynamic-output-stale-warning',
      'warning',
      'report',
      '动态报表输出存在陈旧结果',
      `当前有 ${dynamicOutputStaleCount} 个动态输出超过 ${Math.round(DYNAMIC_OUTPUT_STALE_WARNING_MS / 3600000)} 小时未刷新。`,
    ));
  }

  if (input.draftBlockedCount > 0) {
    warnings.push(buildWarning(
      'draft-output-blocked-warning',
      'warning',
      'report',
      '静态页草稿存在终稿阻塞',
      `当前有 ${input.draftBlockedCount} 份静态页草稿缺少关键模块或内容，无法直接进入终稿。`,
    ));
  }

  const warningCount = warnings.filter((item) => item.level === 'warning').length;
  const criticalCount = warnings.filter((item) => item.level === 'critical').length;
  return {
    dynamicOutputStaleCount,
    stability: {
      generatedAt: new Date(now).toISOString(),
      summary: {
        warningCount,
        criticalCount,
        deepParseBacklog,
        datasourceFailedRuns: input.runStatusCounts.failed || 0,
        captureErrorTasks: input.captureErrorTasksCount,
        dynamicOutputCount: input.dynamicOutputs.length,
        draftBlockedCount: input.draftBlockedCount,
        draftNeedsAttentionCount: input.draftNeedsAttentionCount,
      },
      backlog: {
        deepParseQueued: input.deepParseQueued,
        deepParseProcessing: input.deepParseProcessing,
        datasourceRunning: input.runStatusCounts.running || 0,
        captureScheduled: input.captureScheduledCount,
        dynamicOutputs: input.dynamicOutputs.length,
      },
      durations: {
        datasourceAvgDurationMs: averageDurationMs(input.runDurationsMs),
        deepParseAvgDurationMs: input.deepParseTask?.avgDurationMs || 0,
        memorySyncAvgDurationMs: input.memorySyncTask?.avgDurationMs || 0,
        datavizAvgDurationMs: input.datavizTask?.avgDurationMs || 0,
      },
      failures: {
        datasourceFailedRuns: input.runStatusCounts.failed || 0,
        datasourcePartialRuns: input.runStatusCounts.partial || 0,
        captureErrorTasks: input.captureErrorTasksCount,
        datavizStatus: input.datavizTask?.status || 'idle',
        datavizLastError: input.datavizTask?.lastErrorMessage || input.datavizTask?.lastMessage || '',
        memorySyncStatus: input.memorySyncStatus.status,
        memorySyncLastError: input.memorySyncStatus.lastErrorMessage || '',
      },
      tasks: {
        deepParse: input.deepParseTask,
        memorySync: input.memorySyncTask,
        dataviz: input.datavizTask,
      },
      warnings,
    },
  };
}
