import {
  appendDatasourceRun,
  getDatasourceDefinition,
  type DatasourceDefinition,
} from './datasource-definitions.js';
import { getDatasourceCredentialSecret } from './datasource-credentials.js';
import { buildDatabaseExecutionPlan, buildDatabaseRunSummaryItems } from './datasource-database-connector.js';
import { buildErpExecutionPlan, buildErpRunSummaryItems } from './datasource-erp-connector.js';
import {
  buildErpOrderCaptureSummaryItems,
  runErpOrderCapturePlanner,
} from './datasource-erp-order-capture.js';
import { buildDatasourceRunFromWebCaptureTask, syncWebCaptureTaskToDatasource } from './datasource-web-bridge.js';
import { ingestWebCaptureTaskDocument } from './datasource-web-ingest.js';
import { createAndRunWebCaptureTask } from './web-capture.js';
import {
  buildSyntheticRun,
  buildWebCaptureRunSummary,
  getDefinitionCrawlMode,
  getDefinitionUrl,
} from './datasource-execution-support.js';

export async function runDatabaseDatasourceDefinition(definition: DatasourceDefinition) {
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

export async function runErpDatasourceDefinition(definition: DatasourceDefinition) {
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

export async function runWebDatasourceDefinition(definition: DatasourceDefinition) {
  const credentialSecret = definition.credentialRef?.id
    ? await getDatasourceCredentialSecret(definition.credentialRef.id)
    : null;

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
    auth: definition.authMode === 'credential' && credentialSecret?.username && credentialSecret?.password
      ? {
          username: credentialSecret.username,
          password: credentialSecret.password,
        }
      : undefined,
    credentialRef: definition.credentialRef?.id || '',
    credentialLabel: definition.credentialRef?.label || '',
    loginMode: definition.authMode === 'credential' ? 'credential' : 'none',
    keepOriginalFiles: Boolean(definition.config?.keepOriginalFiles),
  });

  const syncedDefinition = await syncWebCaptureTaskToDatasource(task, {
    id: definition.id,
    name: definition.name,
    targetLibraries: definition.targetLibraries,
    notes: definition.notes,
    authMode: definition.authMode,
    credentialRef: definition.credentialRef,
  });

  const webIngest = task.lastStatus === 'success'
    ? await ingestWebCaptureTaskDocument({
        task,
        targetLibraries: syncedDefinition.targetLibraries,
      })
    : null;
  const run = buildDatasourceRunFromWebCaptureTask(task);
  if (run) {
    run.datasourceId = syncedDefinition.id;
    run.documentIds = webIngest?.ingestResult.parsedItems.map((item) => item.path) || [];
    run.ingestedCount = webIngest?.ingestResult.summary.successCount || 0;
    run.failedCount = webIngest
      ? webIngest.ingestResult.summary.failedCount
      : (task.lastStatus === 'error' ? 1 : 0);
    run.unsupportedCount = webIngest?.ingestResult.metrics.unsupportedCount || 0;
    run.groupedCount = webIngest?.ingestResult.metrics.groupedCount || 0;
    run.ungroupedCount = webIngest?.ingestResult.metrics.ungroupedCount || 0;
    run.libraryKeys = webIngest?.ingestResult.confirmedLibraryKeys?.length
      ? webIngest.ingestResult.confirmedLibraryKeys
      : syncedDefinition.targetLibraries.map((item) => item.key);
    run.summary = buildWebCaptureRunSummary(task.lastSummary || '', webIngest ? {
      total: webIngest.ingestResult.summary.total,
      successCount: webIngest.ingestResult.summary.successCount,
      failedCount: webIngest.ingestResult.summary.failedCount,
      groupedCount: webIngest.ingestResult.metrics.groupedCount,
      unsupportedCount: webIngest.ingestResult.metrics.unsupportedCount,
      parseFailedCount: webIngest.ingestResult.metrics.parseFailedCount,
      invalidCount: webIngest.ingestResult.metrics.invalidCount,
    } : undefined);
    if (webIngest) {
      if (webIngest.ingestResult.summary.successCount && webIngest.ingestResult.summary.failedCount) {
        run.status = 'partial';
      } else if (!webIngest.ingestResult.summary.successCount) {
        run.status = 'failed';
      }
      run.errorMessage = webIngest.ingestResult.summary.failedCount
        ? 'captured file was saved but did not fully enter the knowledge base'
        : '';
    } else if (task.lastStatus === 'error') {
      run.errorMessage = task.lastSummary || 'capture failed';
    }
    await appendDatasourceRun(run);
  }

  return { definition: syncedDefinition, task, run };
}
