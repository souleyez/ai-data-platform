import { buildAuditSnapshot } from './audit-center.js';
import { listDatasourceDefinitions, listDatasourceRuns } from './datasource-definitions.js';
import { buildDatasourceMeta, buildDatasourceRunReadModels } from './datasource-service.js';
import { readDetailedParseQueueState } from './document-deep-parse-queue.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { loadDocumentsIndexRoutePayload } from './document-route-read-operations.js';
import { loadParsedDocuments } from './document-store.js';
import { readOpenClawMemorySyncStatus } from './openclaw-memory-sync.js';
import { loadReportCenterReadState } from './report-center.js';
import { readTaskRuntimeMetrics, type TaskRuntimeMetricsRecord } from './task-runtime-metrics.js';
import { listWebCaptureTasks } from './web-capture.js';

const DEEP_PARSE_BACKLOG_WARNING = 20;
const DEEP_PARSE_BACKLOG_CRITICAL = 80;
const DATASOURCE_FAILED_RUNS_WARNING = 3;
const DATASOURCE_FAILED_RUNS_CRITICAL = 6;
const CAPTURE_ERROR_TASKS_WARNING = 1;
const MEMORY_SYNC_STALE_WARNING_MS = 6 * 60 * 60 * 1000;
const MEMORY_SYNC_STALE_CRITICAL_MS = 24 * 60 * 60 * 1000;
const DYNAMIC_OUTPUT_STALE_WARNING_MS = 12 * 60 * 60 * 1000;

type StabilityWarning = {
  key: string;
  level: 'warning' | 'critical';
  area: 'parse' | 'datasource' | 'capture' | 'memory-sync' | 'dataviz' | 'report';
  title: string;
  detail: string;
};

export type Phase1StabilityBlock = {
  generatedAt: string;
  summary: {
    warningCount: number;
    criticalCount: number;
    deepParseBacklog: number;
    datasourceFailedRuns: number;
    captureErrorTasks: number;
    dynamicOutputCount: number;
  };
  backlog: {
    deepParseQueued: number;
    deepParseProcessing: number;
    datasourceRunning: number;
    captureScheduled: number;
    dynamicOutputs: number;
  };
  durations: {
    datasourceAvgDurationMs: number;
    deepParseAvgDurationMs: number;
    memorySyncAvgDurationMs: number;
    datavizAvgDurationMs: number;
  };
  failures: {
    datasourceFailedRuns: number;
    datasourcePartialRuns: number;
    captureErrorTasks: number;
    datavizStatus: string;
    datavizLastError: string;
    memorySyncStatus: string;
    memorySyncLastError: string;
  };
  tasks: {
    deepParse: TaskRuntimeMetricsRecord | null;
    memorySync: TaskRuntimeMetricsRecord | null;
    dataviz: TaskRuntimeMetricsRecord | null;
  };
  warnings: StabilityWarning[];
};

function countByStatus(items: Array<Record<string, unknown>>, field: string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = String(item?.[field] || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function toTimestamp(value: unknown) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toDurationMs(startedAt: unknown, finishedAt: unknown) {
  const started = toTimestamp(startedAt);
  const finished = toTimestamp(finishedAt);
  if (!started || !finished || finished < started) return 0;
  return finished - started;
}

function averageDurationMs(values: number[]) {
  const normalized = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!normalized.length) return 0;
  return Math.round(normalized.reduce((acc, value) => acc + value, 0) / normalized.length);
}

function buildWarning(
  key: string,
  level: StabilityWarning['level'],
  area: StabilityWarning['area'],
  title: string,
  detail: string,
): StabilityWarning {
  return {
    key,
    level,
    area,
    title,
    detail,
  };
}

function findTask(items: TaskRuntimeMetricsRecord[], family: TaskRuntimeMetricsRecord['family']) {
  return items.find((item) => item.family === family) || null;
}

export async function loadOperationsOverviewPayload() {
  const [
    datasourceMeta,
    datasourceDefinitions,
    datasourceRuns,
    documentsPayload,
    rawDocuments,
    documentLibraries,
    memorySyncStatus,
    reportState,
    auditSnapshot,
    taskRuntimeMetrics,
    webCaptureTasks,
    deepParseQueueState,
  ] = await Promise.all([
    buildDatasourceMeta(),
    listDatasourceDefinitions(),
    listDatasourceRuns(),
    loadDocumentsIndexRoutePayload(),
    loadParsedDocuments(5000, false, undefined, {
      skipBackgroundTasks: true,
    }),
    loadDocumentLibraries(),
    readOpenClawMemorySyncStatus(),
    loadReportCenterReadState(),
    buildAuditSnapshot(),
    readTaskRuntimeMetrics(),
    listWebCaptureTasks(),
    readDetailedParseQueueState(),
  ]);

  const libraryLabelMap = new Map(documentLibraries.map((item) => [item.key, item.label]));
  const documentSummaryMap = new Map(
    rawDocuments.items.map((item) => [
      item.path,
      {
        id: item.path,
        label: item.title || item.name || String(item.path || '').split(/[\\/]/).at(-1) || item.path,
        summary: item.summary || item.excerpt || '',
      },
    ]),
  );

  const runModels = buildDatasourceRunReadModels({
    runs: datasourceRuns,
    definitions: datasourceDefinitions,
    libraryLabelMap,
    documentSummaryMap,
  });
  const runStatusCounts = countByStatus(runModels, 'status');
  const parseDetailCounts = countByStatus(documentsPayload.items || [], 'detailParseStatus');
  const runDurationsMs = runModels
    .map((item) => toDurationMs(item.startedAt, item.finishedAt))
    .filter((value) => value > 0);
  const captureErrorTasks = webCaptureTasks.filter((task) => task.lastStatus === 'error');
  const captureScheduledCount = webCaptureTasks.filter((task) => task.captureStatus !== 'paused' && task.frequency !== 'manual').length;
  const dynamicOutputs = reportState.outputs.filter((item) => item.dynamicSource?.enabled);
  const dynamicOutputStaleCount = dynamicOutputs.filter((item) => {
    const lastRenderedAt = toTimestamp(item.dynamicSource?.lastRenderedAt || item.dynamicSource?.updatedAt || item.createdAt);
    return Boolean(lastRenderedAt) && Date.now() - lastRenderedAt >= DYNAMIC_OUTPUT_STALE_WARNING_MS;
  }).length;
  const deepParseQueued = deepParseQueueState.items.filter((item) => item.status === 'queued').length;
  const deepParseProcessing = deepParseQueueState.items.filter((item) => item.status === 'processing').length;
  const deepParseBacklog = deepParseQueued + deepParseProcessing;
  const deepParseTask = findTask(taskRuntimeMetrics.items, 'deep-parse');
  const memorySyncTask = findTask(taskRuntimeMetrics.items, 'memory-sync');
  const datavizTask = findTask(taskRuntimeMetrics.items, 'dataviz');
  const memorySyncAgeMs = memorySyncStatus.lastSuccessAt ? Math.max(0, Date.now() - toTimestamp(memorySyncStatus.lastSuccessAt)) : 0;

  const warnings: StabilityWarning[] = [];
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

  if ((runStatusCounts.failed || 0) >= DATASOURCE_FAILED_RUNS_CRITICAL) {
    warnings.push(buildWarning(
      'datasource-failed-runs-critical',
      'critical',
      'datasource',
      '数据源失败运行过多',
      `最近失败运行 ${runStatusCounts.failed || 0} 次，已经超过阶段一 critical 阈值 ${DATASOURCE_FAILED_RUNS_CRITICAL}。`,
    ));
  } else if ((runStatusCounts.failed || 0) >= DATASOURCE_FAILED_RUNS_WARNING) {
    warnings.push(buildWarning(
      'datasource-failed-runs-warning',
      'warning',
      'datasource',
      '数据源失败运行偏多',
      `最近失败运行 ${runStatusCounts.failed || 0} 次，已经超过阶段一 warning 阈值 ${DATASOURCE_FAILED_RUNS_WARNING}。`,
    ));
  }

  if (captureErrorTasks.length >= CAPTURE_ERROR_TASKS_WARNING) {
    warnings.push(buildWarning(
      'capture-error-tasks-warning',
      'warning',
      'capture',
      '采集任务存在错误',
      `最近有 ${captureErrorTasks.length} 个采集任务处于 error 状态。`,
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

  if (datavizTask?.status === 'failed' || datavizTask?.status === 'skipped') {
    const datavizDetail = datavizTask.lastErrorMessage
      || datavizTask.lastMessage
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

  const warningCount = warnings.filter((item) => item.level === 'warning').length;
  const criticalCount = warnings.filter((item) => item.level === 'critical').length;
  const stability: Phase1StabilityBlock = {
    generatedAt: new Date().toISOString(),
    summary: {
      warningCount,
      criticalCount,
      deepParseBacklog,
      datasourceFailedRuns: runStatusCounts.failed || 0,
      captureErrorTasks: captureErrorTasks.length,
      dynamicOutputCount: dynamicOutputs.length,
    },
    backlog: {
      deepParseQueued,
      deepParseProcessing,
      datasourceRunning: runStatusCounts.running || 0,
      captureScheduled: captureScheduledCount,
      dynamicOutputs: dynamicOutputs.length,
    },
    durations: {
      datasourceAvgDurationMs: averageDurationMs(runDurationsMs),
      deepParseAvgDurationMs: deepParseTask?.avgDurationMs || 0,
      memorySyncAvgDurationMs: memorySyncTask?.avgDurationMs || 0,
      datavizAvgDurationMs: datavizTask?.avgDurationMs || 0,
    },
    failures: {
      datasourceFailedRuns: runStatusCounts.failed || 0,
      datasourcePartialRuns: runStatusCounts.partial || 0,
      captureErrorTasks: captureErrorTasks.length,
      datavizStatus: datavizTask?.status || 'idle',
      datavizLastError: datavizTask?.lastErrorMessage || datavizTask?.lastMessage || '',
      memorySyncStatus: memorySyncStatus.status,
      memorySyncLastError: memorySyncStatus.lastErrorMessage || '',
    },
    tasks: {
      deepParse: deepParseTask,
      memorySync: memorySyncTask,
      dataviz: datavizTask,
    },
    warnings,
  };

  const recentRuns = [...runModels]
    .sort((a, b) => String(b.finishedAt || b.startedAt || '').localeCompare(String(a.finishedAt || a.startedAt || '')))
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      datasourceId: item.datasourceId,
      datasourceName: item.datasourceName,
      status: item.status,
      finishedAt: item.finishedAt || item.startedAt || '',
      discoveredCount: item.discoveredCount || 0,
      ingestedCount: item.ingestedCount || 0,
      failedCount: item.failedCount || 0,
      summary: item.summary || '',
    }));

  const recentDocuments = [...(documentsPayload.items || [])]
    .sort((a, b) => String(b.detailParsedAt || b.categoryConfirmedAt || '').localeCompare(String(a.detailParsedAt || a.categoryConfirmedAt || '')))
    .slice(0, 10)
    .map((item) => ({
      id: item.id,
      name: item.title || item.name,
      ext: item.ext,
      parseStatus: item.parseStatus,
      detailParseStatus: item.detailParseStatus || 'idle',
      bizCategory: item.confirmedBizCategory || item.bizCategory || '',
      libraries: item.confirmedGroups?.length ? item.confirmedGroups : item.groups || [],
    }));

  const recentOutputs = [...(reportState.outputs || [])]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      title: item.title,
      groupLabel: item.groupLabel,
      templateLabel: item.templateLabel,
      kind: item.kind || item.outputType,
      createdAt: item.createdAt,
      dynamic: Boolean(item.dynamicSource?.enabled),
    }));

  return {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    capture: {
      datasourceSummary: datasourceMeta,
      runSummary: {
        totalRuns: runModels.length,
        successRuns: runStatusCounts.success || 0,
        partialRuns: runStatusCounts.partial || 0,
        failedRuns: runStatusCounts.failed || 0,
        runningRuns: runStatusCounts.running || 0,
        latestFinishedAt: recentRuns[0]?.finishedAt || '',
      },
      taskSummary: {
        totalTasks: webCaptureTasks.length,
        scheduledTasks: captureScheduledCount,
        pausedTasks: webCaptureTasks.filter((task) => task.captureStatus === 'paused').length,
        errorTasks: captureErrorTasks.length,
        latestRunAt: webCaptureTasks
          .map((task) => task.lastRunAt || '')
          .filter(Boolean)
          .sort()
          .at(-1) || '',
      },
      recentRuns,
    },
    parse: {
      scanSummary: {
        totalFiles: documentsPayload.totalFiles || 0,
        parsed: documentsPayload.meta?.parsed || 0,
        unsupported: documentsPayload.meta?.unsupported || 0,
        error: documentsPayload.meta?.error || 0,
        cacheHit: Boolean(documentsPayload.cacheHit),
        libraryCount: Array.isArray(documentsPayload.libraries) ? documentsPayload.libraries.length : 0,
      },
      detailParseSummary: {
        queued: parseDetailCounts.queued || 0,
        processing: parseDetailCounts.processing || 0,
        completed: parseDetailCounts.completed || 0,
        failed: parseDetailCounts.failed || 0,
        idle: parseDetailCounts.idle || 0,
      },
      queueSummary: {
        queued: deepParseQueued,
        processing: deepParseProcessing,
        failed: deepParseQueueState.items.filter((item) => item.status === 'failed').length,
      },
      memorySync: memorySyncStatus,
      recentDocuments,
    },
    output: {
      summary: {
        groups: reportState.groups.length,
        templates: reportState.templates.length,
        userTemplates: reportState.templates.filter((item) => item.origin === 'user').length,
        outputs: reportState.outputs.length,
        dynamicOutputs: dynamicOutputs.length,
        staleDynamicOutputs: dynamicOutputStaleCount,
      },
      recentOutputs,
    },
    runtime: {
      updatedAt: taskRuntimeMetrics.updatedAt,
      tasks: taskRuntimeMetrics.items,
    },
    stability,
    audit: {
      storage: auditSnapshot.storage,
      summary: {
        cleanupRecommendedDocuments: auditSnapshot.meta.cleanupRecommendedDocuments,
        cleanupRecommendedCaptureTasks: auditSnapshot.meta.cleanupRecommendedCaptureTasks,
        hardDeleteRecommendedDocuments: auditSnapshot.meta.hardDeleteRecommendedDocuments,
        hardDeleteRecommendedCaptureTasks: auditSnapshot.meta.hardDeleteRecommendedCaptureTasks,
      },
    },
  };
}
