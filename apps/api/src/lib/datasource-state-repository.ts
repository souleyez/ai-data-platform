import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DatasourceDefinition, DatasourceRun } from './datasource-definitions.js';
import { STORAGE_CONFIG_DIR } from './paths.js';

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
  try {
    const raw = await fs.readFile(DEFINITIONS_FILE, 'utf8');
    return JSON.parse(raw) as DatasourceDefinitionPayload;
  } catch {
    return null;
  }
}

export async function writeDatasourceDefinitionPayload(items: DatasourceDefinition[]) {
  await ensureDatasourceConfigDir();
  await fs.writeFile(DEFINITIONS_FILE, JSON.stringify({ items }, null, 2), 'utf8');
}

export async function readDatasourceRunPayload(): Promise<DatasourceRunPayload | null> {
  try {
    const raw = await fs.readFile(RUNS_FILE, 'utf8');
    return JSON.parse(raw) as DatasourceRunPayload;
  } catch {
    return null;
  }
}

export async function writeDatasourceRunPayload(items: DatasourceRun[]) {
  await ensureDatasourceConfigDir();
  await fs.writeFile(RUNS_FILE, JSON.stringify({ items }, null, 2), 'utf8');
}
