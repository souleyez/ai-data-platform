import {
  appendDatasourceRun,
  getDatasourceDefinition,
  type DatasourceDefinition,
} from './datasource-definitions.js';
import { runLocalDirectoryDatasource } from './datasource-local-directory.js';
import {
  appendFailedRunForDefinition,
  buildSyntheticRun,
} from './datasource-execution-support.js';

export async function runLocalDirectoryDatasourceDefinition(definition: DatasourceDefinition) {
  const directory = String(definition.config?.path || definition.config?.url || '').trim();
  if (!directory) {
    const summary = 'local directory path is required';
    const run = await appendFailedRunForDefinition(definition, summary);
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
    const run = await appendFailedRunForDefinition(definition, message);
    const nextDefinition = await getDatasourceDefinition(definition.id);
    return { definition: nextDefinition, task: null, run };
  }
}

export async function runUploadPublicDatasourceDefinition(definition: DatasourceDefinition) {
  const summary = `外部资料上传入口已就绪，可通过固定链接向 ${(definition.targetLibraries || []).map((item) => item.label).join('、') || '目标知识库'} 提交材料。`;
  const run = await appendDatasourceRun({
    ...buildSyntheticRun(definition, 'partial', summary),
    summary,
  });
  const nextDefinition = await getDatasourceDefinition(definition.id);
  return { definition: nextDefinition, task: null, run };
}
