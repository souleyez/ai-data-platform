import type { DatasourceDefinition, DatasourceRun } from './datasource-definitions.js';
import type { DatasourceProvider, DatasourceProviderSummary } from './datasource-provider.js';

function pickLatestRun(runs: DatasourceRun[]) {
  return [...runs].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0] || null;
}

function toDocumentLabels(documentIds: string[]) {
  return (documentIds || []).map((value) => String(value || '').split(/[\\/]/).at(-1) || '').filter(Boolean);
}

export const localDirectoryDatasourceProvider: DatasourceProvider = {
  kind: 'local_directory',
  capabilities: ['ingest', 'schedule'],
  supports(definition) {
    return definition.kind === 'local_directory';
  },
  async summarize(definition, runs) {
    const latestRun = pickLatestRun(runs);
    const directory = String(definition.config?.path || definition.config?.url || '').trim();
    const summary: DatasourceProviderSummary = {
      id: definition.id,
      name: definition.name,
      kind: definition.kind,
      status: definition.status,
      schedule: definition.schedule.kind,
      targetLibraries: definition.targetLibraries,
      capabilities: ['ingest', 'schedule'],
      notes: definition.notes || '',
      executionHints: [
        directory ? `scan: ${directory}` : 'scan: local directory',
        'only ingest supported file formats',
        'keep original files unchanged',
      ],
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
            lastSummary: definition.lastSummary || 'waiting for first local scan',
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
