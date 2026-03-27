import type { DatasourceDefinition, DatasourceRun } from './datasource-definitions.js';
import { buildDatabaseExecutionPlan } from './datasource-database-connector.js';
import type { DatasourceProvider, DatasourceProviderSummary } from './datasource-provider.js';

function pickLatestRun(runs: DatasourceRun[]) {
  return [...runs].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0] || null;
}

function toDocumentLabels(documentIds: string[]) {
  return (documentIds || []).map((value) => String(value || '').split(/[\\/]/).at(-1) || '').filter(Boolean);
}

export const databaseDatasourceProvider: DatasourceProvider = {
  kind: 'database',
  capabilities: ['database-read', 'ingest', 'schedule'],
  supports(definition) {
    return definition.kind === 'database';
  },
  async summarize(definition, runs) {
    const latestRun = pickLatestRun(runs);
    const plan = buildDatabaseExecutionPlan(definition);
    const summary: DatasourceProviderSummary = {
      id: definition.id,
      name: definition.name,
      kind: definition.kind,
      status: definition.status,
      schedule: definition.schedule.kind,
      targetLibraries: definition.targetLibraries,
      capabilities: ['database-read', 'ingest', 'schedule'],
      executionHints: [
        `数据库类型：${plan.dialect}`,
        `数据库名：${plan.databaseName}`,
        `抽取对象：${plan.queryTargets.join('、')}`,
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
