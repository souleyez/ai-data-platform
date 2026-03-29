import {
  appendDatasourceRun,
  getDatasourceDefinition,
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
} from './web-capture.js';
import { buildDatabaseExecutionPlan, buildDatabaseRunSummaryItems } from './datasource-database-connector.js';
import { getDatasourceCredentialSecret } from './datasource-credentials.js';
import { buildErpExecutionPlan, buildErpRunSummaryItems } from './datasource-erp-connector.js';
import {
  buildErpOrderCaptureSummaryItems,
  runErpOrderCapturePlanner,
} from './datasource-erp-order-capture.js';
import { computeNextRunAt } from './datasource-schedule.js';

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
    documentIds: [],
    libraryKeys: definition.targetLibraries.map((item) => item.key),
    summary,
    errorMessage,
  } satisfies Partial<DatasourceRun>;
}

function getDefinitionUrl(definition: DatasourceDefinition) {
  return String(definition.config?.url || '').trim();
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
