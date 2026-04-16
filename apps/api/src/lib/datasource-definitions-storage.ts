import {
  readDatasourceDefinitionPayload,
  readDatasourceRunPayload,
  writeDatasourceDefinitionPayload,
  writeDatasourceRunPayload,
} from './datasource-state-repository.js';
import type { DatasourceDefinition, DatasourceRun } from './datasource-definitions-types.js';
import { normalizeDefinition, normalizeRun } from './datasource-definitions-normalization.js';

export async function readDefinitions(): Promise<DatasourceDefinition[]> {
  const parsed = await readDatasourceDefinitionPayload();
  return Array.isArray(parsed?.items) ? parsed.items.map(normalizeDefinition).filter((item) => item.id && item.name) : [];
}

export async function writeDefinitions(items: DatasourceDefinition[]) {
  await writeDatasourceDefinitionPayload(items);
}

export async function readRuns(): Promise<DatasourceRun[]> {
  const parsed = await readDatasourceRunPayload();
  return Array.isArray(parsed?.items) ? parsed.items.map(normalizeRun).filter((item) => item.id && item.datasourceId) : [];
}

export async function writeRuns(items: DatasourceRun[]) {
  await writeDatasourceRunPayload(items);
}
