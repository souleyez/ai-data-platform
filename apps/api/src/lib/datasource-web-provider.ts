import type { DatasourceDefinition, DatasourceRun } from './datasource-definitions.js';
import type { DatasourceProvider, DatasourceProviderSummary } from './datasource-provider.js';

function pickLatestRun(runs: DatasourceRun[]) {
  return [...runs].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0] || null;
}

function toDocumentLabels(documentIds: string[]) {
  return (documentIds || []).map((value) => String(value || '').split(/[\\/]/).at(-1) || '').filter(Boolean);
}

function summarizeWebCapabilities(definition: DatasourceDefinition) {
  const capabilities = ['discover', 'extract', 'ingest', 'schedule'] as const;
  if (definition.authMode === 'credential' || definition.authMode === 'manual_session') {
    return [...capabilities, 'login'] as const;
  }
  return capabilities;
}

export const webDatasourceProvider: DatasourceProvider = {
  kind: 'web_public',
  capabilities: ['discover', 'extract', 'ingest', 'schedule'],
  supports(definition) {
    return definition.kind === 'web_public' || definition.kind === 'web_login' || definition.kind === 'web_discovery';
  },
  async summarize(definition, runs) {
    const latestRun = pickLatestRun(runs);
    const summary: DatasourceProviderSummary = {
      id: definition.id,
      name: definition.name,
      kind: definition.kind,
      status: definition.status,
      schedule: definition.schedule.kind,
      targetLibraries: definition.targetLibraries,
      capabilities: [...summarizeWebCapabilities(definition)],
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
            documentIds: latestRun.documentIds,
            documentLabels: toDocumentLabels(latestRun.documentIds),
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
            documentIds: [],
            documentLabels: [],
          },
    };
    return summary;
  },
};
