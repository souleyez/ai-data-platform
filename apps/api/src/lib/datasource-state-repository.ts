import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DatasourceDefinition, DatasourceRun } from './datasource-definitions.js';
import { STORAGE_CONFIG_DIR } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

type DatasourceDefinitionPayload = {
  items: DatasourceDefinition[];
};

type DatasourceRunPayload = {
  items: DatasourceRun[];
};

const DATASOURCE_CONFIG_DIR = path.join(STORAGE_CONFIG_DIR, 'datasources');
const DEFINITIONS_FILE = path.join(DATASOURCE_CONFIG_DIR, 'definitions.json');
const RUNS_FILE = path.join(DATASOURCE_CONFIG_DIR, 'runs.json');

async function ensureDatasourceConfigDir() {
  await fs.mkdir(DATASOURCE_CONFIG_DIR, { recursive: true });
}

export async function readDatasourceDefinitionPayload(): Promise<DatasourceDefinitionPayload | null> {
  const { data } = await readRuntimeStateJson<DatasourceDefinitionPayload | null>({
    filePath: DEFINITIONS_FILE,
    fallback: null,
    normalize: (parsed) => {
      if (!parsed || typeof parsed !== 'object') return null;
      const items = Array.isArray((parsed as { items?: unknown[] }).items)
        ? (parsed as { items: DatasourceDefinition[] }).items
        : [];
      return { items };
    },
  });
  return data;
}

export async function writeDatasourceDefinitionPayload(items: DatasourceDefinition[]) {
  await ensureDatasourceConfigDir();
  await writeRuntimeStateJson({
    filePath: DEFINITIONS_FILE,
    payload: { items },
  });
}

export async function readDatasourceRunPayload(): Promise<DatasourceRunPayload | null> {
  const { data } = await readRuntimeStateJson<DatasourceRunPayload | null>({
    filePath: RUNS_FILE,
    fallback: null,
    normalize: (parsed) => {
      if (!parsed || typeof parsed !== 'object') return null;
      const items = Array.isArray((parsed as { items?: unknown[] }).items)
        ? (parsed as { items: DatasourceRun[] }).items
        : [];
      return { items };
    },
  });
  return data;
}

export async function writeDatasourceRunPayload(items: DatasourceRun[]) {
  await ensureDatasourceConfigDir();
  await writeRuntimeStateJson({
    filePath: RUNS_FILE,
    payload: { items },
  });
}
