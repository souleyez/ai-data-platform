import type { DatasourceDefinition, DatasourceRun } from './datasource-definitions.js';
import { buildDatabaseExecutionPlan } from './datasource-database-connector.js';
import { getDatasourceCredentialSecret } from './datasource-credentials.js';
import type { DatasourceProvider, DatasourceProviderSummary } from './datasource-provider.js';

function pickLatestRun(runs: DatasourceRun[]) {
  return [...runs].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0] || null;
}

function toDocumentLabels(documentIds: string[]) {
  return (documentIds || []).map((value) => String(value || '').split(/[\\/]/).at(-1) || '').filter(Boolean);
}

function toResultSummaries(run: DatasourceRun | null) {
  return (run?.resultSummaries || [])
    .map((item) => ({
      id: item.id,
      label: item.label,
      summary: item.summary,
    }))
    .filter((item) => item.id && item.label)
    .slice(0, 8);
}

export const databaseDatasourceProvider: DatasourceProvider = {
  kind: 'database',
  capabilities: ['database-read', 'ingest', 'schedule'],
  supports(definition) {
    return definition.kind === 'database';
  },
  async summarize(definition, runs) {
    const latestRun = pickLatestRun(runs);
    const credentialSecret = definition.credentialRef?.id
      ? await getDatasourceCredentialSecret(definition.credentialRef.id)
      : null;
    const plan = buildDatabaseExecutionPlan(definition, {
      connectionString: credentialSecret?.connectionString || '',
    });

    const summary: DatasourceProviderSummary = {
      id: definition.id,
      name: definition.name,
      kind: definition.kind,
      status: definition.status,
      schedule: definition.schedule.kind,
      targetLibraries: definition.targetLibraries,
      capabilities: ['database-read', 'ingest', 'schedule'],
      executionHints: [
        `Dialect: ${plan.dialect}`,
        `Target: ${plan.connectionTarget}`,
        `Database: ${plan.databaseName}`,
        `Readonly targets: ${plan.queryTargets.join(', ')}`,
        `Scope: ${plan.queryScopes.join(', ')}`,
        `Readiness: ${plan.executionReadiness}`,
        `Probe checks: ${plan.connectionProbeChecks.length}`,
        `Readonly guards: ${plan.readonlyGuards.length}`,
      ],
      notes: definition.notes || '',
      runtime: latestRun
        ? {
            datasourceId: definition.id,
            kind: definition.kind,
            status: definition.status,
            lastRunAt: latestRun.finishedAt || latestRun.startedAt,
            nextRunAt: definition.nextRunAt || '',
            lastStatus: latestRun.status,
            lastSummary: latestRun.summary || definition.lastSummary || '',
            discoveredCount: latestRun.discoveredCount,
            capturedCount: latestRun.capturedCount,
            ingestedCount: latestRun.ingestedCount,
            libraryKeys: latestRun.libraryKeys,
            documentIds: latestRun.documentIds,
            documentLabels: latestRun.resultSummaries?.length
              ? latestRun.resultSummaries.map((item) => item.label).filter(Boolean)
              : toDocumentLabels(latestRun.documentIds),
            resultSummaries: toResultSummaries(latestRun),
            documentSummaries: toResultSummaries(latestRun),
          }
        : {
            datasourceId: definition.id,
            kind: definition.kind,
            status: definition.status,
            lastRunAt: definition.lastRunAt || '',
            nextRunAt: definition.nextRunAt || '',
            lastStatus: definition.lastStatus || 'idle',
            lastSummary: definition.lastSummary || '',
            discoveredCount: 0,
            capturedCount: 0,
            ingestedCount: 0,
            libraryKeys: definition.targetLibraries.map((item) => item.key),
            documentIds: [],
            documentLabels: [],
            resultSummaries: [],
            documentSummaries: [],
          },
    };
    return summary;
  },
};
