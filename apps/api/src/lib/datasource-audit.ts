import { appendDatasourceRunDeletionAuditLog } from './audit-center.js';
import { getDatasourceDefinition, listDatasourceRuns, type DatasourceRun } from './datasource-definitions.js';

export async function logDatasourceRunDeletion(run: DatasourceRun, actor: 'system' | 'user' = 'user') {
  const [definition, remainingRuns] = await Promise.all([
    getDatasourceDefinition(run.datasourceId),
    listDatasourceRuns(run.datasourceId),
  ]);

  return appendDatasourceRunDeletionAuditLog({
    actor,
    datasourceName: definition?.name || run.datasourceId,
    runId: run.id,
    remainingRuns: remainingRuns.length,
    restoredRunId: remainingRuns[0]?.id || '',
    restoredStatus: definition?.lastStatus || remainingRuns[0]?.status || '',
  });
}
