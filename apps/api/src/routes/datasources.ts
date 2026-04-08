import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  deleteDatasourceRun,
  deleteDatasourceDefinition,
  findDatasourceDefinitionByUploadToken,
  getDatasourceDefinition,
  listDatasourceDefinitions,
  listDatasourceRuns,
  appendDatasourceRun,
  upsertDatasourceDefinition,
} from '../lib/datasource-definitions.js';
import {
  deleteDatasourceCredential,
  getDatasourceCredential,
  getDatasourceCredentialSecret,
  listDatasourceCredentials,
  upsertDatasourceCredential,
} from '../lib/datasource-credentials.js';
import {
  activateDatasourceDefinition,
  deleteDatasourceExecutionArtifacts,
  pauseDatasourceDefinition,
  runDatasourceDefinition,
  runDueDatasourceDefinitions,
} from '../lib/datasource-execution.js';
import { buildErpExecutionPlan } from '../lib/datasource-erp-connector.js';
import { runErpOrderCapturePlanner } from '../lib/datasource-erp-order-capture.js';
import { runErpSessionBrowserLaunch } from '../lib/datasource-erp-session-launch.js';
import { planDatasourceFromPrompt } from '../lib/datasource-planning.js';
import {
  buildDatasourceDocumentSummaryMap,
  buildDatasourceLibraryLabelMap,
  buildDatasourceMeta,
  buildDatasourceRunReadModels,
  enrichDatasourceProviderSummary,
  listDatasourceProviderSummaries,
} from '../lib/datasource-service.js';
import { logDatasourceRunDeletion } from '../lib/datasource-audit.js';
import { listDatasourcePresets } from '../lib/datasource-presets.js';
import { buildDocumentIngestSummaryItems } from '../lib/document-ingest-service.js';
import { sourceItems } from '../lib/mock-data.js';
import { listWebCaptureTasks } from '../lib/web-capture.js';
import { DEFAULT_SCAN_DIR, loadParsedDocuments } from '../lib/document-store.js';
import { loadDocumentCategoryConfig } from '../lib/document-config.js';
import { loadDocumentLibraries } from '../lib/document-libraries.js';
import { ingestUploadedFiles, saveMultipartFiles } from '../lib/document-upload-ingest.js';
import { loadOperationsOverviewPayload } from '../lib/operations-overview.js';

const DATASOURCE_STALE_WARNING_MS = 12 * 60 * 60 * 1000;
const DATASOURCE_STALE_CRITICAL_MS = 24 * 60 * 60 * 1000;

function toDatasourceItem(item: any) {
  return {
    ...item,
    actions: item.actions || ['hide', 'delete'],
    updateMode: item.updateMode || '手动更新',
    hidden: false,
  };
}

function toTimestamp(value: unknown) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toDurationMs(startedAt?: string, finishedAt?: string) {
  const started = toTimestamp(startedAt);
  const finished = toTimestamp(finishedAt);
  if (!started || !finished || finished < started) return 0;
  return finished - started;
}

function buildDatasourceRunStability(run: any) {
  const durationMs = toDurationMs(run.startedAt, run.finishedAt);
  const badges: Array<{ tone: string; label: string }> = [];
  const notes: string[] = [];

  if (run.status === 'failed') {
    badges.push({ tone: 'danger-tag', label: '运行失败' });
  } else if (run.status === 'partial') {
    badges.push({ tone: 'warning-tag', label: '部分完成' });
  }

  if (Number(run.failedCount || 0) > 0) {
    notes.push(`失败 ${Number(run.failedCount || 0)} 项`);
  }
  if (durationMs > 0) {
    notes.push(`耗时 ${Math.round(durationMs / 1000)} 秒`);
  }

  return {
    durationMs,
    badges,
    note: notes.join('；'),
  };
}

function countConsecutiveFailures(runs: any[]) {
  let total = 0;
  for (const run of runs) {
    if (run.status !== 'failed') break;
    total += 1;
  }
  return total;
}

function buildManagedDatasourceStability(item: any, runs: any[]) {
  const runtime = item.runtime || item;
  const sortedRuns = [...runs].sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
  const latestRun = sortedRuns[0] || runtime || {};
  const latestDurationMs = toDurationMs(latestRun.startedAt, latestRun.finishedAt);
  const consecutiveFailures = countConsecutiveFailures(sortedRuns);
  const badges: Array<{ tone: string; label: string }> = [];
  const notes: string[] = [];

  if (consecutiveFailures >= 2) {
    badges.push({ tone: 'danger-tag', label: `连续失败 ${consecutiveFailures}` });
    notes.push(`最近 ${consecutiveFailures} 次运行连续失败`);
  } else if (runtime.lastStatus === 'failed') {
    badges.push({ tone: 'warning-tag', label: '最近失败' });
  } else if (runtime.lastStatus === 'partial') {
    badges.push({ tone: 'warning-tag', label: '部分完成' });
  }

  if (latestDurationMs > 0) {
    notes.push(`最近耗时 ${Math.round(latestDurationMs / 1000)} 秒`);
  }

  const isScheduled = item.schedule && item.schedule !== 'manual';
  const lastRunAtMs = toTimestamp(runtime.lastRunAt || item.lastRunAt);
  const staleForMs = isScheduled && lastRunAtMs ? Math.max(0, Date.now() - lastRunAtMs) : 0;
  if (staleForMs >= DATASOURCE_STALE_CRITICAL_MS) {
    badges.push({ tone: 'danger-tag', label: '运行严重滞后' });
    notes.push(`距离上次运行已超过 ${Math.round(DATASOURCE_STALE_CRITICAL_MS / 3600000)} 小时`);
  } else if (staleForMs >= DATASOURCE_STALE_WARNING_MS) {
    badges.push({ tone: 'warning-tag', label: '运行滞后' });
    notes.push(`距离上次运行已超过 ${Math.round(DATASOURCE_STALE_WARNING_MS / 3600000)} 小时`);
  }

  if (item.status === 'paused') {
    badges.push({ tone: 'neutral-tag', label: '已暂停' });
  }

  return {
    consecutiveFailures,
    latestDurationMs,
    staleForMs,
    badges,
    note: notes.join('；'),
  };
}

async function buildDocumentSummaryMap() {
  const snapshot = await loadParsedDocuments(5000, false);
  return buildDatasourceDocumentSummaryMap(
    snapshot.items.map((item) => ({
      path: item.path,
      title: item.title,
      name: item.name,
      summary: item.summary,
      excerpt: item.excerpt,
    })),
  );
}

function buildLegacyDynamicItems(webTasks: Awaited<ReturnType<typeof listWebCaptureTasks>>) {
  const scheduledTasks = webTasks.filter((task) => task.frequency !== 'manual');
  const successfulTasks = webTasks.filter((task) => task.lastStatus === 'success');
  const failedTasks = webTasks.filter((task) => task.lastStatus === 'error');

  return [
    {
      id: 'web-fixed',
      name: `固定网页抓取${webTasks.length ? `（${webTasks.length}）` : ''}`,
      type: 'web',
      status: successfulTasks.length ? 'connected' : webTasks.length ? 'warning' : 'idle',
      mode: scheduledTasks.length ? 'active' : webTasks.length ? 'standby' : 'standby',
      updateMode: '定时抓取 / 手动补抓',
      capability: '固定网页、知识站点与专题页面持续采集',
      group: '在线采集',
    },
    {
      id: 'knowledge-sites',
      name: '公开学术站点采集',
      type: 'web',
      status: successfulTasks.length ? 'connected' : webTasks.length ? 'warning' : 'idle',
      mode: scheduledTasks.length ? 'active' : webTasks.length ? 'standby' : 'standby',
      updateMode: '定时拉取 / 增量更新',
      capability: 'PubMed Central、arXiv、DOAJ、WHO IRIS 等公开站点采集',
      group: '在线采集',
    },
    {
      id: 'db-access',
      name: '数据库接入',
      type: 'database',
      status: 'connected',
      mode: 'read-only',
      updateMode: '定时同步 / 查询拉取',
      capability: '结构化数据库、业务台账、查询视图只读接入',
      group: '业务系统',
    },
    {
      id: 'erp-orders',
      name: 'ERP 订单后台数据接入',
      type: 'database',
      status: 'connected',
      mode: 'read-only',
      updateMode: '定时同步',
      capability: '订单、回款、客诉、库存等业务数据接入',
      group: '业务系统',
    },
  ].map(toDatasourceItem);
}

export async function registerDatasourceRoutes(app: FastifyInstance) {
  app.get('/datasources/public/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const definition = await findDatasourceDefinitionByUploadToken(token);
    if (!definition) {
      return reply.code(404).send({ error: 'datasource upload entry not found' });
    }
    if (definition.status === 'paused') {
      return reply.code(403).send({ error: 'datasource upload entry is paused' });
    }

    return {
      status: 'ready',
      item: {
        id: definition.id,
        name: definition.name,
        kind: definition.kind,
        notes: definition.notes || '',
        targetLibraries: definition.targetLibraries,
      },
    };
  });

  app.post('/datasources/public/:token/upload', async (request, reply) => {
    const { token } = request.params as { token: string };
    const definition = await findDatasourceDefinitionByUploadToken(token);
    if (!definition) {
      return reply.code(404).send({ error: 'datasource upload entry not found' });
    }
    if (definition.status === 'paused') {
      return reply.code(403).send({ error: 'datasource upload entry is paused' });
    }

    const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const uploadDir = path.join(documentConfig.scanRoot, 'uploads');
    const { files, fields } = await saveMultipartFiles(request.parts(), uploadDir);

    if (!files.length) {
      return reply.code(400).send({ error: 'no files uploaded' });
    }

    const libraries = await loadDocumentLibraries();
    const ingestResult = await ingestUploadedFiles({
      files,
      documentConfig,
      libraries,
      preferredLibraryKeys: definition.targetLibraries.map((item) => item.key),
      forcedLibraryKeys: definition.targetLibraries.map((item) => item.key),
    });

    const finishedAt = new Date().toISOString();
    const status = ingestResult.summary.failedCount
      ? (ingestResult.summary.successCount ? 'partial' : 'failed')
      : 'success';
    const summary = `外部上传已接收 ${files.length} 个文件，入库 ${ingestResult.summary.successCount} 个，目标知识库：${definition.targetLibraries.map((item) => item.label).join('、') || '未绑定'}。`;

    await appendDatasourceRun({
      id: `run-${definition.id}-${Date.now()}`,
      datasourceId: definition.id,
      startedAt: finishedAt,
      finishedAt,
      status,
      discoveredCount: files.length,
      capturedCount: files.length,
      ingestedCount: ingestResult.summary.successCount,
      skippedCount: 0,
      unsupportedCount: ingestResult.metrics.unsupportedCount,
      failedCount: ingestResult.summary.failedCount,
      groupedCount: ingestResult.metrics.groupedCount,
      ungroupedCount: ingestResult.metrics.ungroupedCount,
      documentIds: ingestResult.parsedItems.map((item) => item.path),
      libraryKeys: ingestResult.confirmedLibraryKeys.length ? ingestResult.confirmedLibraryKeys : definition.targetLibraries.map((item) => item.key),
      resultSummaries: buildDocumentIngestSummaryItems(ingestResult.metrics),
      summary,
      errorMessage: ingestResult.summary.failedCount ? '部分文件快速解析失败。' : '',
    });

    await upsertDatasourceDefinition({
      ...definition,
      lastRunAt: finishedAt,
      lastStatus: status,
      lastSummary: summary,
    });

    return {
      status: 'uploaded',
      datasource: {
        id: definition.id,
        name: definition.name,
        targetLibraries: definition.targetLibraries,
      },
      note: fields.note || '',
      uploadedCount: files.length,
      uploadedFiles: files,
      summary: ingestResult.summary,
      ingestItems: ingestResult.ingestItems,
      message: summary,
    };
  });

  app.get('/datasources/credentials', async () => {
    const items = await listDatasourceCredentials();
    return {
      total: items.length,
      items,
    };
  });

  app.post('/datasources/credentials', async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    try {
      const saved = await upsertDatasourceCredential({
        ...body,
        id: String(body.id || '').trim() || `cred-${Date.now()}`,
      });
      return {
        status: 'saved',
        item: saved,
      };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'failed to save datasource credential',
      });
    }
  });

  app.patch('/datasources/credentials/:id', async (request, reply) => {
    const params = request.params as { id?: string };
    const body = (request.body || {}) as Record<string, unknown>;
    const id = String(params.id || '').trim();
    const existing = id ? await getDatasourceCredential(id) : null;
    if (!existing) {
      return reply.code(404).send({ error: 'datasource credential not found' });
    }

    try {
      const saved = await upsertDatasourceCredential({
        ...body,
        id,
        label: String(body.label || existing.label || '').trim(),
        kind: (['credential', 'manual_session', 'database_password', 'api_token'].includes(String(body.kind || existing.kind || 'credential'))
          ? String(body.kind || existing.kind || 'credential')
          : 'credential') as 'credential' | 'manual_session' | 'database_password' | 'api_token',
      });
      return {
        status: 'saved',
        item: saved,
      };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'failed to update datasource credential',
      });
    }
  });

  app.delete('/datasources/credentials/:id', async (request, reply) => {
    const params = request.params as { id?: string };
    const id = String(params.id || '').trim();
    const removed = id ? await deleteDatasourceCredential(id) : null;
    if (!removed) {
      return reply.code(404).send({ error: 'datasource credential not found' });
    }
    return {
      status: 'deleted',
      item: removed,
    };
  });

  app.post('/datasources/plan', async (request, reply) => {
    const body = (request.body || {}) as { prompt?: string };
    const prompt = String(body.prompt || '').trim();
    if (!prompt) {
      return reply.code(400).send({ error: 'prompt is required' });
    }
    const draft = await planDatasourceFromPrompt(prompt);
    return {
      status: 'planned',
      draft,
    };
  });

  app.get('/datasources/managed', async () => {
    const [items, meta, documentSummaryMap, runs] = await Promise.all([
      listDatasourceProviderSummaries(),
      buildDatasourceMeta(),
      buildDocumentSummaryMap(),
      listDatasourceRuns(),
    ]);
    const runsByDatasource = runs.reduce((acc, item) => {
      const bucket = acc.get(item.datasourceId) || [];
      bucket.push(item);
      acc.set(item.datasourceId, bucket);
      return acc;
    }, new Map<string, any[]>());
    return {
      total: items.length,
      items: items.map((item) => {
        const enriched = enrichDatasourceProviderSummary(item, documentSummaryMap);
        return {
          ...enriched,
          stability: buildManagedDatasourceStability(enriched, runsByDatasource.get(enriched.id) || []),
        };
      }),
      meta,
    };
  });

  app.get('/datasources/definitions', async () => {
    const items = await listDatasourceDefinitions();
    return {
      total: items.length,
      items,
    };
  });

  app.get('/datasources/runs', async (request) => {
    const query = (request.query || {}) as { datasourceId?: string };
    const [items, definitions, documentSummaryMap, documentLibraries] = await Promise.all([
      listDatasourceRuns(String(query.datasourceId || '').trim() || undefined),
      listDatasourceDefinitions(),
      buildDocumentSummaryMap(),
      loadDocumentLibraries(),
    ]);
    const libraryLabelMap = buildDatasourceLibraryLabelMap(documentLibraries);
    const runModels = buildDatasourceRunReadModels({
      runs: items,
      definitions,
      libraryLabelMap,
      documentSummaryMap,
    }).map((item) => {
      const stability = buildDatasourceRunStability(item);
      return {
        ...item,
        durationMs: stability.durationMs,
        stability,
      };
    });
    return {
      total: items.length,
      items: runModels,
    };
  });

  app.delete('/datasources/runs/:id', async (request, reply) => {
    const params = request.params as { id?: string };
    const id = String(params.id || '').trim();
    const removed = id ? await deleteDatasourceRun(id) : null;
    if (!removed) {
      return reply.code(404).send({ error: 'datasource run not found' });
    }
    await logDatasourceRunDeletion(removed, 'user');
    return {
      status: 'deleted',
      item: removed,
    };
  });

  app.post('/datasources/run-due', async () => {
    const result = await runDueDatasourceDefinitions();
    return {
      status: result.executedCount ? 'processed' : 'idle',
      ...result,
    };
  });

  app.post('/datasources/definitions', async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    try {
      const saved = await upsertDatasourceDefinition({
        ...body,
        id: String(body.id || '').trim() || `ds-${Date.now()}`,
      });
      return {
        status: 'saved',
        item: saved,
      };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'failed to save datasource definition',
      });
    }
  });

  app.patch('/datasources/definitions/:id', async (request, reply) => {
    const params = request.params as { id?: string };
    const body = (request.body || {}) as Record<string, unknown>;
    const id = String(params.id || '').trim();
    const existing = id ? await getDatasourceDefinition(id) : null;
    if (!existing) {
      return reply.code(404).send({ error: 'datasource definition not found' });
    }

    try {
      const saved = await upsertDatasourceDefinition({
        ...existing,
        ...body,
        id,
      });
      return {
        status: 'saved',
        item: saved,
      };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'failed to update datasource definition',
      });
    }
  });

  app.delete('/datasources/definitions/:id', async (request, reply) => {
    const params = request.params as { id?: string };
    const id = String(params.id || '').trim();
    const existing = id ? await getDatasourceDefinition(id) : null;
    if (existing) {
      await deleteDatasourceExecutionArtifacts(existing);
    }
    const removed = id ? await deleteDatasourceDefinition(id) : null;
    if (!removed) {
      return reply.code(404).send({ error: 'datasource definition not found' });
    }
    return {
      status: 'deleted',
      item: removed,
    };
  });

  app.post('/datasources/definitions/:id/run', async (request, reply) => {
    const params = request.params as { id?: string };
    const id = String(params.id || '').trim();
    try {
      const result = await runDatasourceDefinition(id);
      return {
        status: 'executed',
        ...result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to run datasource definition';
      const code = /not found/i.test(message) ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  app.post('/datasources/definitions/:id/session-launch', async (request, reply) => {
    const params = request.params as { id?: string };
    const body = (request.body || {}) as { execute?: boolean };
    const id = String(params.id || '').trim();
    const definition = id ? await getDatasourceDefinition(id) : null;
    if (!definition) {
      return reply.code(404).send({ error: 'datasource definition not found' });
    }
    if (definition.kind !== 'erp') {
      return reply.code(400).send({ error: 'session launch only supports ERP datasource definitions' });
    }

    try {
      const executionPlan = buildErpExecutionPlan(definition);
      if (executionPlan.preferredTransport !== 'session') {
        return reply.code(400).send({ error: 'ERP session launch only supports session transport datasources' });
      }

      const [captureResolution, credentialSecret] = await Promise.all([
        runErpOrderCapturePlanner({
          definition,
          executionPlan,
        }),
        definition.credentialRef?.id ? getDatasourceCredentialSecret(definition.credentialRef.id) : Promise.resolve(null),
      ]);

      const item = await runErpSessionBrowserLaunch({
        definition,
        executionPlan,
        captureResolution,
        credentialSecret,
        execute: Boolean(body.execute),
      });

      return {
        status: item.execution.status === 'completed' ? 'launched' : 'prepared',
        item,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to prepare ERP session launch';
      return reply.code(400).send({ error: message });
    }
  });

  app.post('/datasources/definitions/:id/activate', async (request, reply) => {
    const params = request.params as { id?: string };
    const id = String(params.id || '').trim();
    try {
      const item = await activateDatasourceDefinition(id);
      return {
        status: 'active',
        item,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to activate datasource definition';
      const code = /not found/i.test(message) ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  app.post('/datasources/definitions/:id/pause', async (request, reply) => {
    const params = request.params as { id?: string };
    const id = String(params.id || '').trim();
    try {
      const item = await pauseDatasourceDefinition(id);
      return {
        status: 'paused',
        item,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to pause datasource definition';
      const code = /not found/i.test(message) ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  app.get('/datasources', async () => {
    const [webTasks, providerSummaries, providerMeta, presetCatalog, documentSummaryMap, operationsOverview] = await Promise.all([
      listWebCaptureTasks(),
      listDatasourceProviderSummaries(),
      buildDatasourceMeta(),
      Promise.resolve(listDatasourcePresets()),
      buildDocumentSummaryMap(),
      loadOperationsOverviewPayload(),
    ]);

    const latestCaptureAt = webTasks
      .map((task) => task.lastRunAt || '')
      .filter(Boolean)
      .sort()
      .at(-1) || '';

    const legacyItems = [...sourceItems.map(toDatasourceItem), ...buildLegacyDynamicItems(webTasks)];
    const activeItems = legacyItems.filter((item) => item.mode === 'active' || item.status === 'connected');
    const captureTasks = webTasks.slice(0, 12).map((task) => ({
      id: task.id,
      title: task.title || task.url,
      url: task.url,
      focus: task.focus,
      frequency: task.frequency,
      maxItems: task.maxItems || 5,
      status: task.lastStatus || 'idle',
      lastRunAt: task.lastRunAt || '',
      nextRunAt: task.nextRunAt || '',
      summary: task.lastSummary || '',
      documentPath: task.documentPath || '',
      note: task.note || '',
      collectedCount: task.lastCollectedCount || 0,
      collectedItems: task.lastCollectedItems || [],
      captureStatus: task.captureStatus || 'active',
    }));

    return {
      mode: 'read-only',
      total: legacyItems.length,
      items: legacyItems,
      activeItems,
      captureTasks,
      managedDatasources: providerSummaries.map((item) => ({
        ...enrichDatasourceProviderSummary(item, documentSummaryMap),
      })),
      providerMeta,
      stability: operationsOverview.stability,
      presetCatalog,
      meta: {
        connected: legacyItems.filter((item) => item.status === 'connected').length,
        warning: legacyItems.filter((item) => item.status === 'warning').length,
        idle: legacyItems.filter((item) => item.status === 'idle').length,
        active: activeItems.length,
        webTasks: webTasks.length,
        latestCaptureAt,
        captureSuccess: webTasks.filter((item) => item.lastStatus === 'success').length,
        captureError: webTasks.filter((item) => item.lastStatus === 'error').length,
        captureScheduled: webTasks.filter((item) => item.frequency !== 'manual').length,
      },
    };
  });
}
