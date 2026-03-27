import type { DatasourceDefinition, DatasourceRun } from './datasource-definitions.js';
import type { DatasourceProvider, DatasourceProviderSummary } from './datasource-provider.js';

function pickLatestRun(runs: DatasourceRun[]) {
  return [...runs].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0] || null;
}

function toDocumentLabels(documentIds: string[]) {
  return (documentIds || []).map((value) => String(value || '').split(/[\\/]/).at(-1) || '').filter(Boolean);
}

export const uploadDatasourceProvider: DatasourceProvider = {
  kind: 'upload_public',
  capabilities: ['ingest', 'upload-submit'],
  supports(definition) {
    return definition.kind === 'upload_public';
  },
  async summarize(definition, runs) {
    const latestRun = pickLatestRun(runs);
    const token = String(definition.config?.uploadToken || '').trim();
    const summary: DatasourceProviderSummary = {
      id: definition.id,
      name: definition.name,
      kind: definition.kind,
      status: definition.status,
      schedule: definition.schedule.kind,
      targetLibraries: definition.targetLibraries,
      capabilities: ['ingest', 'upload-submit'],
      notes: definition.notes || '',
      executionHints: ['适合外部客户、合作方、供应商通过固定链接主动提交材料'],
      publicPath: token ? `/datasource-upload/${token}` : '',
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
            lastSummary: definition.lastSummary || '等待外部提交资料',
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
