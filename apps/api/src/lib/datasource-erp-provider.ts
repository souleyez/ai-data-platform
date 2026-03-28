import type { DatasourceDefinition, DatasourceRun } from './datasource-definitions.js';
import { buildErpExecutionPlan } from './datasource-erp-connector.js';
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

function buildCapabilities(definition: DatasourceDefinition) {
  const capabilities = ['erp-sync', 'ingest', 'schedule'] as const;
  if (definition.authMode === 'credential' || definition.authMode === 'manual_session' || definition.authMode === 'api_token') {
    return [...capabilities, 'login'] as const;
  }
  return capabilities;
}

export const erpDatasourceProvider: DatasourceProvider = {
  kind: 'erp',
  capabilities: ['erp-sync', 'ingest', 'schedule'],
  supports(definition) {
    return definition.kind === 'erp';
  },
  async summarize(definition, runs) {
    const latestRun = pickLatestRun(runs);
    const plan = buildErpExecutionPlan(definition);
    const summary: DatasourceProviderSummary = {
      id: definition.id,
      name: definition.name,
      kind: definition.kind,
      status: definition.status,
      schedule: definition.schedule.kind,
      targetLibraries: definition.targetLibraries,
      capabilities: [...buildCapabilities(definition)],
      executionHints: [
        `Auth: ${plan.authKind}`,
        `Target: ${plan.endpointTarget}`,
        `Modules: ${plan.modules.join(', ')}`,
        `Transport: ${plan.preferredTransport}`,
        `Bootstrap mode: ${plan.bootstrapMode}`,
        `Readiness: ${plan.executionReadiness}`,
        `Bootstrap requests: ${plan.bootstrapRequests.length}`,
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
