import { buildAuditSnapshot } from './audit-center.js';
import { listDatasourceDefinitions, listDatasourceRuns } from './datasource-definitions.js';
import { buildDatasourceMeta, buildDatasourceRunReadModels } from './datasource-service.js';
import { readDetailedParseQueueState } from './document-deep-parse-queue.js';
import {
  getParsedDocumentCanonicalParseStatus,
  getParsedDocumentCanonicalSource,
} from './document-canonical-text.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { loadDocumentsIndexRoutePayload } from './document-route-read-operations.js';
import { DOCUMENT_AUDIO_EXTENSIONS } from './document-parser.js';
import { loadParsedDocuments } from './document-store.js';
import { readOpenClawMemorySyncStatus } from './openclaw-memory-sync.js';
import { buildPhase1StabilityBlock } from './operations-overview-stability.js';
import { countByStatus, findTask, toDurationMs } from './operations-overview-support.js';
import type { Phase1StabilityBlock } from './operations-overview-types.js';
import { summarizeReportDraftBenchmarks } from './report-draft-quality.js';
import { loadReportCenterReadState } from './report-center.js';
import { readTaskRuntimeMetrics } from './task-runtime-metrics.js';
import { listWebCaptureTasks } from './web-capture.js';

const AUDIO_EXTENSIONS = new Set<string>(DOCUMENT_AUDIO_EXTENSIONS);

export type { Phase1StabilityBlock } from './operations-overview-types.js';

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
  const draftBenchmark = summarizeReportDraftBenchmarks(reportState.outputs);
  const draftBlockedCount = draftBenchmark.totals.blocked;
  const draftNeedsAttentionCount = draftBenchmark.totals.needsAttention;
  const draftReadyCount = draftBenchmark.totals.ready;
  const deepParseQueued = deepParseQueueState.items.filter((item) => item.status === 'queued').length;
  const deepParseProcessing = deepParseQueueState.items.filter((item) => item.status === 'processing').length;
  const canonicalCoverageCount = rawDocuments.items.filter(
    (item) => getParsedDocumentCanonicalParseStatus(item) === 'ready',
  ).length;
  const markdownCoverageCount = rawDocuments.items.filter((item) => {
    const source = getParsedDocumentCanonicalSource(item);
    return source === 'existing-markdown' || source === 'markitdown';
  }).length;
  const markdownFailedCount = rawDocuments.items.filter(
    (item) => getParsedDocumentCanonicalParseStatus(item) === 'failed' || Boolean(String(item.markdownError || '').trim()),
  ).length;
  const vlmFallbackCount = rawDocuments.items.filter((item) => {
    const source = getParsedDocumentCanonicalSource(item);
    return source === 'vlm-image' || source === 'vlm-pdf' || source === 'vlm-presentation';
  }).length;
  const audioParseFailedCount = rawDocuments.items.filter((item) => {
    const ext = String(item.ext || '').toLowerCase();
    return AUDIO_EXTENSIONS.has(ext) && item.detailParseStatus === 'failed';
  }).length;
  const deepParseTask = findTask(taskRuntimeMetrics.items, 'deep-parse');
  const memorySyncTask = findTask(taskRuntimeMetrics.items, 'memory-sync');
  const datavizTask = findTask(taskRuntimeMetrics.items, 'dataviz');
  const { stability, dynamicOutputStaleCount }: { stability: Phase1StabilityBlock; dynamicOutputStaleCount: number } = buildPhase1StabilityBlock({
    runStatusCounts,
    captureErrorTasksCount: captureErrorTasks.length,
    captureScheduledCount,
    dynamicOutputs,
    draftBlockedCount,
    draftNeedsAttentionCount,
    deepParseQueued,
    deepParseProcessing,
    runDurationsMs,
    deepParseTask,
    memorySyncTask,
    datavizTask,
    memorySyncStatus,
  });

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
    .sort((a, b) => String(b.detailParsedAt || b.groupConfirmedAt || '').localeCompare(String(a.detailParsedAt || a.groupConfirmedAt || '')))
    .slice(0, 10)
    .map((item) => ({
      id: item.id,
      name: item.title || item.name,
      ext: item.ext,
      parseStatus: item.parseStatus,
      detailParseStatus: item.detailParseStatus || 'idle',
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
      markdownSummary: {
        canonicalReady: canonicalCoverageCount,
        markdownReady: markdownCoverageCount,
        markdownFailed: markdownFailedCount,
        vlmFallbackCount,
        audioParseFailedCount,
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
        draftOutputs: draftBenchmark.totals.drafts,
        draftReadyOutputs: draftReadyCount,
        draftNeedsAttentionOutputs: draftNeedsAttentionCount,
        draftBlockedOutputs: draftBlockedCount,
      },
      benchmark: draftBenchmark,
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
