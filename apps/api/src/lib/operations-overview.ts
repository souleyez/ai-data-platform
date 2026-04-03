import { buildAuditSnapshot } from './audit-center.js';
import { listDatasourceDefinitions, listDatasourceRuns } from './datasource-definitions.js';
import { buildDatasourceMeta, buildDatasourceRunReadModels } from './datasource-service.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { loadDocumentsIndexRoutePayload } from './document-route-read-operations.js';
import { loadParsedDocuments } from './document-store.js';
import { readOpenClawMemorySyncStatus } from './openclaw-memory-sync.js';
import { loadReportCenterState } from './report-center.js';

function countByStatus(items: Array<Record<string, unknown>>, field: string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = String(item?.[field] || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
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
  ] = await Promise.all([
    buildDatasourceMeta(),
    listDatasourceDefinitions(),
    listDatasourceRuns(),
    loadDocumentsIndexRoutePayload(),
    loadParsedDocuments(5000, false),
    loadDocumentLibraries(),
    readOpenClawMemorySyncStatus(),
    loadReportCenterState(),
    buildAuditSnapshot(),
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
      memorySync: memorySyncStatus,
      recentDocuments,
    },
    output: {
      summary: {
        groups: reportState.groups.length,
        templates: reportState.templates.length,
        userTemplates: reportState.templates.filter((item) => item.origin === 'user').length,
        outputs: reportState.outputs.length,
        dynamicOutputs: reportState.outputs.filter((item) => item.dynamicSource?.enabled).length,
      },
      recentOutputs,
    },
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
