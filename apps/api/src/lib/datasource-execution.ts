import {
  appendDatasourceRun,
  getDatasourceDefinition,
  listDatasourceDefinitions,
  upsertDatasourceDefinition,
  type DatasourceDefinition,
  type DatasourceRun,
} from './datasource-definitions.js';
import {
  buildDatasourceRunFromWebCaptureTask,
  syncWebCaptureTaskToDatasource,
} from './datasource-web-bridge.js';
import {
  createAndRunWebCaptureTask,
  deleteWebCaptureTask,
  listWebCaptureTasks,
  updateWebCaptureTaskStatus,
  upsertWebCaptureTask,
  type WebCaptureCrawlMode,
} from './web-capture.js';
import { buildDatabaseExecutionPlan, buildDatabaseRunSummaryItems } from './datasource-database-connector.js';
import { getDatasourceCredentialSecret } from './datasource-credentials.js';
import { buildErpExecutionPlan, buildErpRunSummaryItems } from './datasource-erp-connector.js';
import {
  buildErpOrderCaptureSummaryItems,
  runErpOrderCapturePlanner,
} from './datasource-erp-order-capture.js';
import { computeNextRunAt } from './datasource-schedule.js';
import { runLocalDirectoryDatasource } from './datasource-local-directory.js';

function buildSyntheticRun(
  definition: DatasourceDefinition,
  status: DatasourceRun['status'],
  summary: string,
  errorMessage = '',
) {
  const startedAt = new Date().toISOString();
  return {
    id: `run-${definition.id}-${Date.now()}`,
    datasourceId: definition.id,
    startedAt,
    finishedAt: startedAt,
    status,
    discoveredCount: 0,
    capturedCount: 0,
    ingestedCount: 0,
    skippedCount: 0,
    unsupportedCount: 0,
    failedCount: 0,
    groupedCount: 0,
    ungroupedCount: 0,
    documentIds: [],
    libraryKeys: definition.targetLibraries.map((item) => item.key),
    summary,
    errorMessage,
  } satisfies Partial<DatasourceRun>;
}

function getDefinitionUrl(definition: DatasourceDefinition) {
  return String(definition.config?.url || '').trim();
}

function getDefinitionCrawlMode(definition: DatasourceDefinition): WebCaptureCrawlMode {
  const configured = String(definition.config?.crawlMode || '').trim().toLowerCase();
  if (configured === 'listing-detail') return 'listing-detail';
  return definition.kind === 'web_discovery' ? 'listing-detail' : 'single-page';
}

async function findLinkedWebTask(definition: DatasourceDefinition) {
  const url = getDefinitionUrl(definition);
  if (!url) return null;
  const tasks = await listWebCaptureTasks();
  return tasks.find((item) => item.url === url) || null;
}

async function ensureWebTaskFromDefinition(definition: DatasourceDefinition) {
  const url = getDefinitionUrl(definition);
  if (!url) {
    throw new Error('web datasource url is required');
  }

  const existing = await findLinkedWebTask(definition);
  return upsertWebCaptureTask({
    id: existing?.id,
    url,
    focus: String(definition.config?.focus || '').trim(),
    keywords: Array.isArray(definition.config?.keywords) ? definition.config.keywords as string[] : [],
    siteHints: Array.isArray(definition.config?.siteHints) ? definition.config.siteHints as string[] : [],
    seedUrls: Array.isArray(definition.config?.seedUrls) ? definition.config.seedUrls as string[] : [url],
    crawlMode: getDefinitionCrawlMode(definition),
    frequency: definition.schedule.kind,
    note: definition.notes || '',
    maxItems: Number(definition.schedule.maxItemsPerRun || definition.config?.maxItems || 5),
    credentialRef: definition.credentialRef?.id || '',
    credentialLabel: definition.credentialRef?.label || '',
    loginMode: definition.authMode === 'credential' || definition.authMode === 'manual_session' ? 'credential' : 'none',
    captureStatus: definition.status === 'paused' ? 'paused' : 'active',
  });
}

export async function activateDatasourceDefinition(id: string) {
  const definition = await getDatasourceDefinition(id);
  if (!definition) throw new Error('datasource definition not found');

  if (definition.kind === 'web_public' || definition.kind === 'web_login' || definition.kind === 'web_discovery') {
    const task = await ensureWebTaskFromDefinition({ ...definition, status: 'active' });
    if (task.captureStatus !== 'active') {
      await updateWebCaptureTaskStatus(task.id, 'active');
    }
  }

  return upsertDatasourceDefinition({
    ...definition,
    status: 'active',
    nextRunAt: computeNextRunAt(definition.schedule.kind, 'active'),
  });
}

export async function pauseDatasourceDefinition(id: string) {
  const definition = await getDatasourceDefinition(id);
  if (!definition) throw new Error('datasource definition not found');

  if (definition.kind === 'web_public' || definition.kind === 'web_login' || definition.kind === 'web_discovery') {
    const task = await findLinkedWebTask(definition);
    if (task) {
      await updateWebCaptureTaskStatus(task.id, 'paused');
    }
  }

  return upsertDatasourceDefinition({
    ...definition,
    status: 'paused',
    nextRunAt: '',
  });
}

export async function runDatasourceDefinition(id: string) {
  const definition = await getDatasourceDefinition(id);
  if (!definition) throw new Error('datasource definition not found');
  if (definition.status === 'paused') {
    throw new Error('paused datasource definition cannot be run until activated');
  }

  if (definition.kind === 'local_directory') {
    const directory = String(definition.config?.path || definition.config?.url || '').trim();
    if (!directory) {
      const summary = 'local directory path is required';
      const run = await appendDatasourceRun({
        ...buildSyntheticRun(definition, 'failed', summary, summary),
        summary,
        errorMessage: summary,
      });
      const nextDefinition = await getDatasourceDefinition(definition.id);
      return { definition: nextDefinition, task: null, run };
    }

    try {
      const configuredMaxItems = Number(definition.schedule.maxItemsPerRun || definition.config?.maxItems || 0) || undefined;
      const result = await runLocalDirectoryDatasource({
        directory,
        targetLibraryKeys: definition.targetLibraries.map((item) => item.key),
        maxItems: configuredMaxItems,
      });
      const status = result.failedCount ? (result.ingestedCount ? 'partial' : 'failed') : 'success';
      const summary = `local scan ${result.ingestedCount}/${result.plannedCount} | discovered ${result.discoveredCount}`;
      const run = await appendDatasourceRun({
        ...buildSyntheticRun(definition, status, summary),
        discoveredCount: result.discoveredCount,
        capturedCount: result.plannedCount,
        ingestedCount: result.ingestedCount,
        skippedCount: result.skippedKnownCount,
        unsupportedCount: result.unsupportedCount,
        failedCount: result.failedCount,
        groupedCount: result.groupedCount,
        ungroupedCount: result.ungroupedCount,
        documentIds: result.ingestedPaths,
        libraryKeys: result.confirmedLibraryKeys?.length
          ? result.confirmedLibraryKeys
          : definition.targetLibraries.map((item) => item.key),
        resultSummaries: result.resultSummaries,
        summary,
        errorMessage: result.failedCount ? 'some files failed parsing or were unsupported' : '',
      });
      const nextDefinition = await getDatasourceDefinition(definition.id);
      return { definition: nextDefinition, task: null, run };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'local directory scan failed';
      const run = await appendDatasourceRun({
        ...buildSyntheticRun(definition, 'failed', message, message),
        summary: message,
        errorMessage: message,
      });
      const nextDefinition = await getDatasourceDefinition(definition.id);
      return { definition: nextDefinition, task: null, run };
    }
  }

  if (definition.kind === 'upload_public') {
    const summary = `外部资料上传入口已就绪，可通过固定链接向 ${(definition.targetLibraries || []).map((item) => item.label).join('、') || '目标知识库'} 提交材料。`;
    const run = await appendDatasourceRun({
      ...buildSyntheticRun(definition, 'partial', summary),
      summary,
    });
    const nextDefinition = await getDatasourceDefinition(definition.id);
    return { definition: nextDefinition, task: null, run };
  }

  if (definition.kind === 'database') {
    const credentialSecret = definition.credentialRef?.id
      ? await getDatasourceCredentialSecret(definition.credentialRef.id)
      : null;
    const plan = buildDatabaseExecutionPlan(definition, {
      connectionString: credentialSecret?.connectionString || '',
    });
    const resultSummaries = buildDatabaseRunSummaryItems(plan);
    const status = plan.validationWarnings.length ? 'partial' : 'success';
    const run = await appendDatasourceRun({
      ...buildSyntheticRun(definition, status, plan.summary),
      discoveredCount: plan.queryTargets.length,
      capturedCount: plan.queryTargets.length,
      resultSummaries,
      summary: plan.summary,
    });
    const nextDefinition = await getDatasourceDefinition(definition.id);
    return { definition: nextDefinition, task: null, run };
  }

  if (definition.kind === 'erp') {
    const plan = buildErpExecutionPlan(definition);
    const captureResolution = await runErpOrderCapturePlanner({
      definition,
      executionPlan: plan,
    });
    const baseSummaries = buildErpRunSummaryItems(plan);
    const captureSummaries = buildErpOrderCaptureSummaryItems(plan, captureResolution);
    const resultSummaries = [
      ...baseSummaries.slice(0, 5),
      ...captureSummaries,
      ...baseSummaries.slice(5),
    ];
    const status = plan.validationWarnings.length ? 'partial' : 'success';
    const summary = [
      plan.summary,
      `Order capture contract: ${captureResolution.plan.captureMode} via ${captureResolution.plan.login.entryPath || '/'} (${captureResolution.provider}).`,
    ].join(' ');
    const run = await appendDatasourceRun({
      ...buildSyntheticRun(definition, status, summary),
      discoveredCount: plan.modules.length,
      capturedCount: plan.modules.length,
      resultSummaries,
      summary,
    });
    const nextDefinition = await getDatasourceDefinition(definition.id);
    return { definition: nextDefinition, task: null, run };
  }

  if (!(definition.kind === 'web_public' || definition.kind === 'web_login' || definition.kind === 'web_discovery')) {
    throw new Error('datasource run is not implemented for this provider yet');
  }

  const task = await createAndRunWebCaptureTask({
    url: getDefinitionUrl(definition),
    focus: String(definition.config?.focus || '').trim(),
    keywords: Array.isArray(definition.config?.keywords) ? definition.config.keywords as string[] : [],
    siteHints: Array.isArray(definition.config?.siteHints) ? definition.config.siteHints as string[] : [],
    seedUrls: Array.isArray(definition.config?.seedUrls) ? definition.config.seedUrls as string[] : [getDefinitionUrl(definition)],
    crawlMode: getDefinitionCrawlMode(definition),
    frequency: definition.schedule.kind,
    note: definition.notes || '',
    maxItems: Number(definition.schedule.maxItemsPerRun || definition.config?.maxItems || 5),
    credentialRef: definition.credentialRef?.id || '',
    credentialLabel: definition.credentialRef?.label || '',
  });

  const syncedDefinition = await syncWebCaptureTaskToDatasource(task, {
    id: definition.id,
    name: definition.name,
    targetLibraries: definition.targetLibraries,
    notes: definition.notes,
  });

  const run = buildDatasourceRunFromWebCaptureTask(task);
  if (run) {
    run.datasourceId = syncedDefinition.id;
    run.libraryKeys = syncedDefinition.targetLibraries.map((item) => item.key);
    await appendDatasourceRun(run);
  }

  return { definition: syncedDefinition, task, run };
}

export async function deleteDatasourceExecutionArtifacts(definition: DatasourceDefinition) {
  if (!(definition.kind === 'web_public' || definition.kind === 'web_login' || definition.kind === 'web_discovery')) {
    return;
  }
  const task = await findLinkedWebTask(definition);
  if (task) {
    await deleteWebCaptureTask(task.id);
  }
}

export async function runDueDatasourceDefinitions() {
  const definitions = await listDatasourceDefinitions();
  const now = Date.now();
  const due = definitions.filter((definition) => {
    if (definition.status !== 'active') return false;
    if (definition.schedule.kind === 'manual') return false;
    if (definition.kind !== 'local_directory') return false;
    const nextRunAt = definition.nextRunAt || '';
    if (!nextRunAt) return false;
    return Date.parse(nextRunAt) <= now;
  });

  const results = [];
  for (const definition of due) {
    try {
      results.push(await runDatasourceDefinition(definition.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'run due datasource failed';
      const run = await appendDatasourceRun({
        ...buildSyntheticRun(definition, 'failed', message, message),
        summary: message,
        errorMessage: message,
      });
      results.push({ definition, task: null, run });
    }
  }

  return {
    executedCount: results.length,
    items: results,
  };
}
