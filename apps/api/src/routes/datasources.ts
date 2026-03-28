import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
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
  listDatasourceCredentials,
  upsertDatasourceCredential,
} from '../lib/datasource-credentials.js';
import {
  activateDatasourceDefinition,
  deleteDatasourceExecutionArtifacts,
  pauseDatasourceDefinition,
  runDatasourceDefinition,
} from '../lib/datasource-execution.js';
import { planDatasourceFromPrompt } from '../lib/datasource-planning.js';
import {
  buildDatasourceDocumentSummaryMap,
  buildDatasourceLibraryLabelMap,
  buildDatasourceMeta,
  buildDatasourceRunReadModels,
  enrichDatasourceProviderSummary,
  listDatasourceProviderSummaries,
} from '../lib/datasource-service.js';
import { listDatasourcePresets } from '../lib/datasource-presets.js';
import { sourceItems } from '../lib/mock-data.js';
import { listWebCaptureTasks } from '../lib/web-capture.js';
import { DEFAULT_SCAN_DIR, loadParsedDocuments } from '../lib/document-store.js';
import { loadDocumentCategoryConfig } from '../lib/document-config.js';
import { loadDocumentLibraries } from '../lib/document-libraries.js';
import { ingestUploadedFiles, saveMultipartFiles } from '../lib/document-upload-ingest.js';

function toDatasourceItem(item: any) {
  return {
    ...item,
    actions: item.actions || ['hide', 'delete'],
    updateMode: item.updateMode || '手动更新',
    hidden: false,
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
      documentIds: ingestResult.parsedItems.map((item) => item.path),
      libraryKeys: ingestResult.confirmedLibraryKeys.length ? ingestResult.confirmedLibraryKeys : definition.targetLibraries.map((item) => item.key),
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
    const [items, meta, documentSummaryMap] = await Promise.all([
      listDatasourceProviderSummaries(),
      buildDatasourceMeta(),
      buildDocumentSummaryMap(),
    ]);
    return {
      total: items.length,
      items: items.map((item) => enrichDatasourceProviderSummary(item, documentSummaryMap)),
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
    return {
      total: items.length,
      items: buildDatasourceRunReadModels({
        runs: items,
        definitions,
        libraryLabelMap,
        documentSummaryMap,
      }),
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
    const [webTasks, providerSummaries, providerMeta, presetCatalog, documentSummaryMap] = await Promise.all([
      listWebCaptureTasks(),
      listDatasourceProviderSummaries(),
      buildDatasourceMeta(),
      Promise.resolve(listDatasourcePresets()),
      buildDocumentSummaryMap(),
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
